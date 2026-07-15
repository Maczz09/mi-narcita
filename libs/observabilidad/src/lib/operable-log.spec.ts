import { describe, it, expect } from 'vitest';
import * as winston from 'winston';
import { otelTraceFormat } from './log-trace.format';
import type { OperableLog } from './operable-log';

const MESSAGE = Symbol.for('message');

/**
 * Contrato del que depende todo el diseño de logs operables: al pasar un
 * OperableLog a `logger.warn(...)`, nest-winston coloca sus props en el `info`
 * top-level; este pipeline (el mismo de observabilidad.module.ts) NO debe
 * anidarlas ni perderlas, para que sigan siendo queryables en Loki con
 * `| json | errorCode="..."`.
 */
describe('OperableLog — contrato de serialización (sesión 29)', () => {
  it('mantiene los campos operables top-level tras el pipeline de Winston', () => {
    const fmt = winston.format.combine(
      winston.format.timestamp(),
      otelTraceFormat(),
      winston.format.json(),
    );

    const log: OperableLog = {
      operation: 'cerrarCuenta',
      message: 'cierre pendiente',
      aggregateId: 'cuenta-1',
      dependency: 'cuentas',
      durationMs: 4200,
      errorCode: 'CIERRE_REMOTO_FAILED',
      resultingState: 'PAGO_SIN_CIERRE_CONFIRMADO',
    };

    const info = fmt.transform({ level: 'warn', ...log }) as Record<PropertyKey, unknown>;
    const json = JSON.parse(info[MESSAGE] as string) as Record<string, unknown>;

    expect(json.operation).toBe('cerrarCuenta');
    expect(json.aggregateId).toBe('cuenta-1');
    expect(json.dependency).toBe('cuentas');
    expect(json.durationMs).toBe(4200);
    expect(json.errorCode).toBe('CIERRE_REMOTO_FAILED');
    expect(json.resultingState).toBe('PAGO_SIN_CIERRE_CONFIRMADO');
  });
});
