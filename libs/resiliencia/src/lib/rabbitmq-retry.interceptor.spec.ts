import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable } from 'rxjs';
import { BadRequestException } from '@nestjs/common';
import { register } from 'prom-client';
import { backoffConJitter, RabbitMQRetryInterceptor } from './rabbitmq-retry.interceptor';

function retryCount(surface: string): number {
  const metric = register.getSingleMetric('retry_attempts_total') as
    | { hashMap?: Record<string, { value: number; labels: { surface: string } }> }
    | undefined;
  return Object.values(metric?.hashMap ?? {}).find((v) => v.labels.surface === surface)?.value ?? 0;
}

function dlqTotal(): number {
  const metric = register.getSingleMetric('dlq_messages_total') as
    | { hashMap?: Record<string, { value: number }> }
    | undefined;
  return Object.values(metric?.hashMap ?? {})[0]?.value ?? 0;
}

function fakeRmqContext() {
  const channel = { ack: vi.fn(), nack: vi.fn() };
  const rmqContext = {
    getChannelRef: () => channel,
    getMessage: () => ({ properties: { headers: {} } }),
  };
  const executionContext = {
    getType: () => 'rpc',
    switchToRpc: () => ({ getContext: () => rmqContext }),
    getArgByIndex: () => rmqContext,
  } as never;
  return { executionContext, channel };
}

describe('backoffConJitter', () => {
  const initialDelay = 1000;

  it('mantiene delayMs ∈ [base, base + initialDelay) para varios reintentos', () => {
    for (let retryCount = 1; retryCount <= 4; retryCount++) {
      const base = initialDelay * Math.pow(2, retryCount - 1);
      for (let i = 0; i < 50; i++) {
        const delay = backoffConJitter(retryCount, initialDelay);
        expect(delay).toBeGreaterThanOrEqual(base);
        expect(delay).toBeLessThan(base + initialDelay);
      }
    }
  });

  it('crece exponencialmente en la base entre reintentos consecutivos', () => {
    // Sin jitter (random=0) la base de cada reintento dobla la anterior.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(backoffConJitter(1, initialDelay)).toBe(1000);
    expect(backoffConJitter(2, initialDelay)).toBe(2000);
    expect(backoffConJitter(3, initialDelay)).toBe(4000);
    spy.mockRestore();
  });
});

describe('RabbitMQRetryInterceptor — retry_attempts_total (R-07)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('incrementa retry_attempts_total{surface:broker} una vez por reintento', async () => {
    const interceptor = new RabbitMQRetryInterceptor();
    const { executionContext, channel } = fakeRmqContext();
    const antes = retryCount('broker');

    let calls = 0;
    const next = {
      handle: () =>
        new Observable((sub) => {
          calls++;
          if (calls <= 2) sub.error(new Error(`fallo-${calls}`));
          else {
            sub.next('ok');
            sub.complete();
          }
        }),
    };

    const resultado = new Promise((resolve, reject) => {
      interceptor.intercept(executionContext, next as never).subscribe({ next: resolve, error: reject });
    });
    // Avanza los backoff (1s + 2s + jitter) para que se ejecuten los 2 reintentos.
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultado).resolves.toBe('ok');
    expect(retryCount('broker')).toBe(antes + 2); // 2 fallos → 2 reintentos
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });
});

describe('RabbitMQRetryInterceptor — DLQ de errores permanentes (H-5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un BadRequestException (4xx) va a DLQ al primer intento, sin reintentar', async () => {
    const interceptor = new RabbitMQRetryInterceptor();
    const { executionContext, channel } = fakeRmqContext();
    const dlqAntes = dlqTotal();
    const retriesAntes = retryCount('broker');

    let calls = 0;
    const next = {
      handle: () => new Observable((sub) => { calls++; sub.error(new BadRequestException('payload inválido')); }),
    };

    const resultado = new Promise((resolve, reject) => {
      interceptor.intercept(executionContext, next as never).subscribe({ next: resolve, error: reject });
    });
    resultado.catch(() => undefined); // marca el rechazo como manejado antes de avanzar timers
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultado).rejects.toBeInstanceOf(BadRequestException);
    expect(calls).toBe(1);                            // un solo intento
    expect(channel.nack).toHaveBeenCalledTimes(1);    // nack directo (requeue=false)
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(retryCount('broker')).toBe(retriesAntes);  // no reintentos
    expect(dlqTotal()).toBe(dlqAntes + 1);
  });

  it('un Error genérico conserva los 3 reintentos antes de la DLQ', async () => {
    const interceptor = new RabbitMQRetryInterceptor();
    const { executionContext, channel } = fakeRmqContext();
    const retriesAntes = retryCount('broker');

    let calls = 0;
    const next = {
      handle: () => new Observable((sub) => { calls++; sub.error(new Error('fallo transitorio')); }),
    };

    const resultado = new Promise((resolve, reject) => {
      interceptor.intercept(executionContext, next as never).subscribe({ next: resolve, error: reject });
    });
    resultado.catch(() => undefined); // marca el rechazo como manejado antes de avanzar timers
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(resultado).rejects.toThrow('fallo transitorio');
    expect(calls).toBe(4);                             // 1 inicial + 3 reintentos
    expect(retryCount('broker')).toBe(retriesAntes + 3);
    expect(channel.nack).toHaveBeenCalledTimes(1);
  });
});
