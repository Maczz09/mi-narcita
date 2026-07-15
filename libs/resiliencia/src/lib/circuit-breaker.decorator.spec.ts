/* eslint-disable @typescript-eslint/require-await --
   Los métodos dummy son async sin await a propósito: solo existen para que el
   decorador los envuelva y para forzar el rechazo del breaker bajo prueba. */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { register, Gauge } from 'prom-client';
import { Logger } from '@nestjs/common';
import { CircuitBreakerOptions, CIRCUIT_BREAKER_REGISTRY } from './circuit-breaker.decorator';

/**
 * R-04: el gauge circuit_breaker_state lo dirigen los eventos del breaker
 * (open=1, halfOpen=0.5, close=0), no un set manual en el cliente.
 */

class Dummy {
  @CircuitBreakerOptions({ timeout: 100 })
  async llamar(): Promise<string> {
    throw Object.assign(new Error('boom'), { code: 'ECONNREFUSED' });
  }
}

class DummyOk {
  @CircuitBreakerOptions({ timeout: 100 })
  async llamar(): Promise<string> {
    return 'ok';
  }
}

function estadoGauge(breaker: string): number | undefined {
  const gauge = register.getSingleMetric('circuit_breaker_state') as Gauge<string> | undefined;
  const val = (gauge as unknown as { hashMap: Record<string, { value: number; labels: { breaker: string } }> })?.hashMap;
  return Object.values(val ?? {}).find((v) => v.labels.breaker === breaker)?.value;
}

function limpiarBreakers() {
  for (const [name, b] of CIRCUIT_BREAKER_REGISTRY) {
    b.shutdown();
    CIRCUIT_BREAKER_REGISTRY.delete(name);
  }
}

describe('CircuitBreakerOptions — gauge circuit_breaker_state (R-04)', () => {
  const breakerName = 'Dummy.llamar';
  beforeEach(limpiarBreakers);
  afterEach(limpiarBreakers);

  it('fija el estado inicial y sigue los eventos del breaker (open/halfOpen/close)', async () => {
    const dummy = new Dummy();
    // Primera invocación: instancia el breaker y registra el gauge con su label.
    await expect(dummy.llamar()).rejects.toBeDefined();
    expect(estadoGauge(breakerName)).toBeDefined();

    const breaker = CIRCUIT_BREAKER_REGISTRY.get(breakerName)!;
    breaker.emit('open');
    expect(estadoGauge(breakerName)).toBe(1);

    breaker.emit('halfOpen');
    expect(estadoGauge(breakerName)).toBe(0.5);

    breaker.emit('close');
    expect(estadoGauge(breakerName)).toBe(0);
  });

  // Log operable (sesión 29): al abrir, emite circuitBreakerState + dependency
  // derivada del nombre de la clase ('Dummy' → 'dummy').
  it('loguea el cambio de estado del circuito de forma estructurada', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const dummy = new Dummy();
    await expect(dummy.llamar()).rejects.toBeDefined();

    CIRCUIT_BREAKER_REGISTRY.get(breakerName)!.emit('open');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: breakerName,
        dependency: 'dummy',
        circuitBreakerState: 'OPEN',
      }),
    );
    warnSpy.mockRestore();
  });

  it('R-05: registra la latencia en dependency_request_duration_seconds por breaker', async () => {
    const dummy = new DummyOk();
    await expect(dummy.llamar()).resolves.toBe('ok');

    const hist = register.getSingleMetric('dependency_request_duration_seconds')!;
    const data = await hist.get();
    const values = data.values as Array<{ metricName?: string; labels: { breaker?: string }; value: number }>;
    const count = values.find(
      (v) => v.metricName?.endsWith('_count') && v.labels.breaker === 'DummyOk.llamar',
    )?.value;
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
