import { Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { getOrCreateCounter, getOrCreateGauge, getOrCreateHistogram, OperableLog } from '@org/observabilidad';

export const CIRCUIT_BREAKER_REGISTRY = new Map<string, CircuitBreaker>();

// Latencia de toda llamada con breaker → p95/p99 por dependencia desde un único
// sitio. opossum no abre por percentil (R-17), pero aquí queda medido/alertable.
const dependencyDuration = getOrCreateHistogram(
  'dependency_request_duration_seconds',
  'Latencia de llamadas a dependencias con breaker',
  [0.05, 0.1, 0.3, 0.5, 1, 2, 3, 5, 10],
  ['breaker'],
);

// Estado del circuito por breaker, dirigido por los eventos de opossum (refleja
// también HALF_OPEN, cosa que un set manual 1/0 en el cliente no puede). Se
// etiqueta con `breaker` (identidad fina: `Clase.metodo`) y con `dependency`
// (nombre canónico agregable: 'inventario'), para que alertas y dashboards
// puedan consultar por dependencia (`circuit_breaker_state{dependency="inventario"}`)
// sin conocer el método concreto, y `/health/dependencies` muestre el nombre legible.
const circuitStateGauge = getOrCreateGauge(
  'circuit_breaker_state',
  'Estado del circuito por breaker (0=CLOSED, 0.5=HALF_OPEN, 1=OPEN)',
  ['breaker', 'dependency'],
);

// Acumulados (el gauge de arriba solo da el estado actual): cuántas veces
// abrió el circuito, cuántos fallbacks se sirvieron y cuántas llamadas
// vencieron por timeout de opossum, por breaker/dependencia.
const circuitOpenCounter = getOrCreateCounter(
  'circuit_breaker_open_total', 'Aperturas de circuito acumuladas', ['breaker', 'dependency'],
);
const circuitFallbackCounter = getOrCreateCounter(
  'circuit_fallback_total', 'Fallbacks ejecutados por el circuito', ['breaker', 'dependency'],
);
const circuitTimeoutCounter = getOrCreateCounter(
  'circuit_timeout_total', 'Llamadas vencidas por timeout del circuito', ['breaker', 'dependency'],
);

export function CircuitBreakerOptions(options?: CircuitBreaker.Options) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const breakerName = `${target.constructor.name}.${propertyKey}`;
    const logger = new Logger('CircuitBreaker');
    // Nombre canónico de la dependencia = clase sin sufijo HttpClient, en
    // minúsculas ('CuentasHttpClient' → 'cuentas'). Coincide con el label
    // `dependency` de las métricas para poder cruzar log ↔ métrica.
    const dependency = target.constructor.name.replace(/HttpClient$/, '').toLowerCase();

    const defaultOptions: CircuitBreaker.Options = {
      timeout: 3000, 
      errorThresholdPercentage: 50, 
      resetTimeout: 30_000, 
      ...options,
    };

    descriptor.value = async function (...args: unknown[]) {
      let breaker = CIRCUIT_BREAKER_REGISTRY.get(breakerName);
      
      if (!breaker) {
        // Envolvemos el método original, asegurando que `this` se mantenga
        const fn = originalMethod.bind(this);
        breaker = new CircuitBreaker(fn, defaultOptions);

        breaker.on('open', () => {
          logger.warn({
            operation: breakerName,
            dependency,
            circuitBreakerState: 'OPEN',
            message: 'Circuito abierto; rechazando peticiones a la dependencia.',
          } satisfies OperableLog);
          circuitStateGauge.set({ breaker: breakerName, dependency }, 1);
          circuitOpenCounter.inc({ breaker: breakerName, dependency });
        });
        breaker.on('halfOpen', () => {
          logger.log({
            operation: breakerName,
            dependency,
            circuitBreakerState: 'HALF_OPEN',
            message: 'Circuito medio abierto; probando una petición de sondeo.',
          } satisfies OperableLog);
          circuitStateGauge.set({ breaker: breakerName, dependency }, 0.5);
        });
        breaker.on('close', () => {
          logger.log({
            operation: breakerName,
            dependency,
            circuitBreakerState: 'CLOSED',
            message: 'Circuito cerrado; tráfico normal restablecido.',
          } satisfies OperableLog);
          circuitStateGauge.set({ breaker: breakerName, dependency }, 0);
        });
        breaker.on('fallback', () => {
          logger.warn({
            operation: breakerName,
            dependency,
            message: 'Fallback ejecutado por el circuito.',
          } satisfies OperableLog);
          circuitFallbackCounter.inc({ breaker: breakerName, dependency });
        });
        breaker.on('timeout', () => {
          logger.warn({
            operation: breakerName,
            dependency,
            message: 'Llamada vencida por timeout del circuito.',
          } satisfies OperableLog);
          circuitTimeoutCounter.inc({ breaker: breakerName, dependency });
        });

        // Estado inicial: CLOSED, para que el gauge sea visible desde el arranque.
        circuitStateGauge.set({ breaker: breakerName, dependency }, 0);
        CIRCUIT_BREAKER_REGISTRY.set(breakerName, breaker);
      }

      const start = Date.now();
      try {
        return await breaker.fire(...args);
      } finally {
        dependencyDuration.observe({ breaker: breakerName }, (Date.now() - start) / 1000);
      }
    };

    return descriptor;
  };
}
