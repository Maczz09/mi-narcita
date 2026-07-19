import { describe, it, expect } from 'vitest';
import { HttpException } from '@nestjs/common';
import { Gauge, register } from 'prom-client';
import { HealthController } from './health.controller';

function makeController(dbOk: boolean, brokerConnected?: boolean) {
  const db = {
    serviceName: 'servicio-pedidos',
    $queryRawUnsafe: () =>
      dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('conexión caída')),
  };
  const broker =
    brokerConnected === undefined
      ? undefined
      : ({ isConnected: () => brokerConnected } as unknown as ConstructorParameters<typeof HealthController>[1]);
  return new HealthController(db, broker);
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

  it('dependencies agrupa el gauge circuit_breaker_state por dependency (UP/DEGRADED/DOWN)', async () => {
    register.removeSingleMetric('circuit_breaker_state');
    const g = new Gauge({ name: 'circuit_breaker_state', help: 'test', labelNames: ['breaker', 'dependency'] });
    // El nombre legible sale del label `dependency`, no del `breaker` técnico.
    g.set({ breaker: 'InventarioHttpClient.consultarStock', dependency: 'inventario' }, 1); // abierto → DOWN
    g.set({ breaker: 'MesasHttpClient.marcarOcupada', dependency: 'mesas' }, 0.5); // half-open → DEGRADED
    g.set({ breaker: 'CuentasHttpClient.cerrar', dependency: 'cuentas' }, 0); // cerrado → UP

    const r = await makeController(true).dependencies();
    expect(r.dependencies.inventario).toBe('DOWN');
    expect(r.dependencies.mesas).toBe('DEGRADED');
    expect(r.dependencies.cuentas).toBe('UP');
    expect(r.status).toBe('DOWN'); // hay al menos una dependencia DOWN
    register.removeSingleMetric('circuit_breaker_state');
  });

  it('dependencies colapsa varios breakers de una misma dependency al PEOR estado', async () => {
    register.removeSingleMetric('circuit_breaker_state');
    const g = new Gauge({ name: 'circuit_breaker_state', help: 'test', labelNames: ['breaker', 'dependency'] });
    // Dos breakers de la misma dependencia: uno cerrado (UP) y otro abierto (DOWN).
    g.set({ breaker: 'InventarioHttpClient.consultarStock', dependency: 'inventario' }, 0);
    g.set({ breaker: 'InventarioHttpClient.reservarStock', dependency: 'inventario' }, 1);

    const r = await makeController(true).dependencies();
    expect(r.dependencies.inventario).toBe('DOWN'); // gana el peor
    register.removeSingleMetric('circuit_breaker_state');
  });

  it('dependencies cae al label breaker si el gauge aún no trae dependency', async () => {
    register.removeSingleMetric('circuit_breaker_state');
    const g = new Gauge({ name: 'circuit_breaker_state', help: 'test', labelNames: ['breaker'] });
    g.set({ breaker: 'inventario' }, 1);

    const r = await makeController(true).dependencies();
    expect(r.dependencies.inventario).toBe('DOWN');
    register.removeSingleMetric('circuit_breaker_state');
  });

  it('dependencies incluye rabbitmq=UP cuando el broker está conectado', async () => {
    const r = await makeController(true, true).dependencies();
    expect(r.dependencies.rabbitmq).toBe('UP');
    expect(r.status).toBe('UP');
  });

  it('dependencies reporta rabbitmq=DOWN (y status DOWN) con el broker caído', async () => {
    const r = await makeController(true, false).dependencies();
    expect(r.dependencies.rabbitmq).toBe('DOWN');
    expect(r.status).toBe('DOWN');
  });

  it('sin broker inyectado (servicio sin RabbitMQ) omite la clave rabbitmq', async () => {
    const r = await makeController(true).dependencies();
    expect(r.dependencies.rabbitmq).toBeUndefined();
  });

  it('ready NO depende del broker (sigue UP con broker caído, evita flap del LB)', async () => {
    const r = await makeController(true, false).ready();
    expect(r.status).toBe('UP');
  });
});
