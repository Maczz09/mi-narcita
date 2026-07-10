import { Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { getOrCreateGauge } from '@org/observabilidad';

export const CIRCUIT_BREAKER_REGISTRY = new Map<string, CircuitBreaker>();

// Estado del circuito por breaker, dirigido por los eventos de opossum (refleja
// también HALF_OPEN, cosa que un set manual 1/0 en el cliente no puede).
const circuitStateGauge = getOrCreateGauge(
  'circuit_breaker_state',
  'Estado del circuito por breaker (0=CLOSED, 0.5=HALF_OPEN, 1=OPEN)',
  ['breaker'],
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
          logger.warn(`Circuito ABIERTO en ${breakerName}. Rechazando peticiones.`);
          circuitStateGauge.set({ breaker: breakerName }, 1);
        });
        breaker.on('halfOpen', () => {
          logger.log(`Circuito MEDIO ABIERTO en ${breakerName}. Probando conexión...`);
          circuitStateGauge.set({ breaker: breakerName }, 0.5);
        });
        breaker.on('close', () => {
          logger.log(`Circuito CERRADO en ${breakerName}. Tráfico normal.`);
          circuitStateGauge.set({ breaker: breakerName }, 0);
        });
        breaker.on('fallback', () => logger.warn(`Fallback ejecutado en ${breakerName}`));

        // Estado inicial: CLOSED, para que el gauge sea visible desde el arranque.
        circuitStateGauge.set({ breaker: breakerName }, 0);
        CIRCUIT_BREAKER_REGISTRY.set(breakerName, breaker);
      }

      return breaker.fire(...args);
    };

    return descriptor;
  };
}
