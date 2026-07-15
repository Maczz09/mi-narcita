import { describe, it, expect } from 'vitest';
import { HttpException } from '@nestjs/common';
import { Gauge, register } from 'prom-client';
import { HealthController } from './health.controller';

function makeController(dbOk: boolean) {
  const db = {
    serviceName: 'servicio-pedidos',
    $queryRawUnsafe: () =>
      dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('conexión caída')),
  };
  return new HealthController(db);
}

describe('HealthController (S33 · health serio)', () => {
  it('live no toca dependencias y siempre responde UP con service+version', () => {
    const r = makeController(false).live();
    expect(r.status).toBe('UP');
    expect(r.service).toBe('pedidos'); // strip de "servicio-"
    expect(r.version).toBeDefined();
  });

  it('ready devuelve UP cuando la BD responde', async () => {
    const r = await makeController(true).ready();
    expect(r.status).toBe('UP');
    expect(r.dependencies.database).toBe('UP');
  });

  it('ready lanza 503 cuando la BD está caída', async () => {
    await expect(makeController(false).ready()).rejects.toBeInstanceOf(HttpException);
  });

  it('dependencies mapea el gauge circuit_breaker_state a UP/DEGRADED/DOWN', async () => {
    register.removeSingleMetric('circuit_breaker_state');
    const g = new Gauge({ name: 'circuit_breaker_state', help: 'test', labelNames: ['breaker'] });
    g.set({ breaker: 'inventario' }, 1); // abierto → DOWN
    g.set({ breaker: 'mesas' }, 0.5); // half-open → DEGRADED
    g.set({ breaker: 'cuentas' }, 0); // cerrado → UP

    const r = await makeController(true).dependencies();
    expect(r.dependencies.inventario).toBe('DOWN');
    expect(r.dependencies.mesas).toBe('DEGRADED');
    expect(r.dependencies.cuentas).toBe('UP');
    expect(r.status).toBe('DOWN'); // hay al menos una dependencia DOWN
    register.removeSingleMetric('circuit_breaker_state');
  });
});
