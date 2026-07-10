import { ServiceUnavailableException } from '@nestjs/common';
import http from 'node:http';
import https from 'node:https';
import pLimit from 'p-limit';
import { getOrCreateCounter, getOrCreateGauge } from '@org/observabilidad';

// Señales de pool (patrón → inglés). in_flight = saturación del pool;
// rejected_total = shed load cuando la cola se llena.
const inFlightGauge = getOrCreateGauge(
  'bulkhead_in_flight', 'Llamadas en vuelo por bulkhead (pool)', ['dependency'],
);
const rejectedCounter = getOrCreateCounter(
  'bulkhead_rejected_total', 'Llamadas rechazadas por bulkhead saturado (shed load)', ['dependency'],
);

export interface BulkheadOptions {
  /** Máximo de llamadas concurrentes en vuelo (= maxSockets del agente). */
  maxConcurrent: number;
  /** Máximo en cola esperando slot; al superarlo se rechaza con 503. */
  maxQueue: number;
}

export interface Bulkhead {
  /** Ejecuta fn dentro del pool; rechaza con 503 si la cola está llena. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Agentes con maxSockets = maxConcurrent para pasar a axios. */
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
}

/**
 * Bulkhead outbound por dependencia: aísla concurrencia y sockets para que una
 * dependencia lenta no agote los recursos de las demás. Por instancia (no
 * global; no hay Redis) — riesgo residual documentado en R-17.
 */
export function createBulkhead(name: string, opts: BulkheadOptions): Bulkhead {
  const limit = pLimit(opts.maxConcurrent);
  const httpAgent = new http.Agent({ maxSockets: opts.maxConcurrent });
  const httpsAgent = new https.Agent({ maxSockets: opts.maxConcurrent });
  const capacity = opts.maxConcurrent + opts.maxQueue;
  // Aceptadas y sin resolver (en ejecución + en cola). Contador propio porque el
  // pendingCount de p-limit se actualiza un microtask tarde y sería carrera.
  let inSystem = 0;

  return {
    httpAgent,
    httpsAgent,
    run<T>(fn: () => Promise<T>): Promise<T> {
      // Capacidad llena → shed load: fallar rápido es mejor que encolar sin límite.
      if (inSystem >= capacity) {
        rejectedCounter.inc({ dependency: name });
        return Promise.reject(
          new ServiceUnavailableException(`Dependencia ${name} saturada (bulkhead lleno). Reintente.`),
        );
      }
      inSystem++;
      return limit(() => {
        inFlightGauge.inc({ dependency: name });
        return Promise.resolve()
          .then(fn)
          .finally(() => inFlightGauge.dec({ dependency: name }));
      }).finally(() => {
        inSystem--;
      });
    },
  };
}
