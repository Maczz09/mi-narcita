import { getOrCreateCounter } from '@org/observabilidad';

// Comparte el contador de R-07 con surface:'http' (el broker usa surface:'broker').
const retryCounter = getOrCreateCounter(
  'retry_attempts_total', 'Reintentos ejecutados', ['surface'],
);

export interface RetryOptions {
  /** Reintentos tras el primer intento (default 1 → hasta 2 intentos). */
  retries?: number;
  /** Base del backoff exponencial en ms. */
  baseMs?: number;
  /** Clasifica si un error merece reintento. Default: red/5xx sí, 4xx nunca. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Reintentable por defecto: errores de red/timeout (sin respuesta) y 5xx.
 * Nunca 4xx (incluye 404/409/429 → tienen su propio manejo, reintentar amplifica).
 */
export function defaultIsRetryable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number') return status >= 500;
  return true; // sin respuesta = red/timeout
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintenta fn con backoff exponencial + jitter. Pensado para lecturas GET
 * idempotentes (R-16); no usar en escrituras sin idempotencia.
 */
export async function retryAsync<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 1, baseMs = 250, isRetryable = defaultIsRetryable } = options;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) {
        // Expone los reintentos ya ejecutados para que el call site lo loguee
        // como `retryAttempt` (log operable, sesión 29). No altera el tipo del
        // error ni su propagación.
        if (attempt > 0 && error && typeof error === 'object') {
          (error as { retryAttempts?: number }).retryAttempts = attempt;
        }
        throw error;
      }
      attempt++;
      retryCounter.inc({ surface: 'http' });
      const backoff = baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseMs);
      await sleep(backoff);
    }
  }
}

/** Lee los reintentos que `retryAsync` adjuntó a un error propagado (0 si ninguno). */
export function retryAttemptsOf(error: unknown): number {
  return (error as { retryAttempts?: number })?.retryAttempts ?? 0;
}
