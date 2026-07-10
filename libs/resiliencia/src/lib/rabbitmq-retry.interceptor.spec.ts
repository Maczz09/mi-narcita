import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable } from 'rxjs';
import { register } from 'prom-client';
import { backoffConJitter, RabbitMQRetryInterceptor } from './rabbitmq-retry.interceptor';

function retryCount(surface: string): number {
  const metric = register.getSingleMetric('retry_attempts_total') as
    | { hashMap?: Record<string, { value: number; labels: { surface: string } }> }
    | undefined;
  return Object.values(metric?.hashMap ?? {}).find((v) => v.labels.surface === surface)?.value ?? 0;
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
