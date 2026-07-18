import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, throwError, timer } from 'rxjs';
import { retry, tap } from 'rxjs/operators';
import { RmqContext } from '@nestjs/microservices';
import { context, propagation } from '@opentelemetry/api';
import { getOrCreateCounter, getOrCreateHistogram } from '@org/observabilidad';

/**
 * Backoff exponencial + jitter (evita reintentos sincronizados entre réplicas).
 * delayMs ∈ [base, base + initialDelay) con base = initialDelay * 2**(retryCount-1).
 */
export function backoffConJitter(retryCount: number, initialDelay: number): number {
  const base = initialDelay * Math.pow(2, retryCount - 1);
  return base + Math.floor(Math.random() * initialDelay);
}

/**
 * H-5: un error que nunca tendrá éxito reintentando (validación/parseo del
 * payload) no debe quemar los 3 reintentos (~7s) antes de la DLQ. Es permanente
 * si es un HttpException 4xx (incluye BadRequestException del ValidationPipe) o
 * un error de parseo (SyntaxError de JSON). El resto conserva el backoff.
 */
export function esErrorPermanenteConsumidor(error: unknown): boolean {
  const e = error as { getStatus?: () => number; status?: number; name?: string };
  const status = typeof e?.getStatus === 'function' ? e.getStatus() : e?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return true;
  return e?.name === 'SyntaxError';
}

@Injectable()
export class RabbitMQRetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RabbitMQRetryInterceptor.name);

  // Cuánto tiempo pasó un mensaje en el broker (publicado → recogido por este
  // consumidor). Distinto de outbox_publish_lag_seconds (creación → publicación).
  private readonly brokerConsumerLag = getOrCreateHistogram(
    'broker_consumer_lag_seconds',
    'Latencia desde la publicación de un mensaje hasta que un consumidor lo recibe',
    [0.5, 1, 2, 5, 10, 30, 60, 300],
  );
  // Mensajes que agotaron los reintentos del consumidor y fueron enviados a la DLQ.
  private readonly dlqMessagesCounter = getOrCreateCounter(
    'dlq_messages_total', 'Mensajes RabbitMQ enviados a la dead-letter queue tras agotar reintentos',
  );
  // Reintentos ejecutados por superficie (broker aquí; http en R-16). Detecta
  // amplificación de reintentos.
  private readonly retryCounter = getOrCreateCounter(
    'retry_attempts_total', 'Reintentos ejecutados', ['surface'],
  );

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctxType = executionContext.getType();

    if (ctxType !== 'rpc' && (ctxType as string) !== 'rmq') {
      return next.handle();
    }

    const rmqContext = ctxType === 'rpc'
      ? executionContext.switchToRpc().getContext<RmqContext>()
      : executionContext.getArgByIndex<RmqContext | undefined>(1);

    const channel = (rmqContext?.getChannelRef?.() || null) as { ack?: (msg: unknown) => void; nack?: (msg: unknown, all: boolean, requeue: boolean) => void } | null;
    const originalMsg = (rmqContext?.getMessage?.() || null) as { properties?: { headers?: Record<string, string> } } | null;

    const maxRetries = 3;
    const initialDelay = 1000;

    const publishedAt = Number(originalMsg?.properties?.headers?.['x-published-at']);
    if (Number.isFinite(publishedAt) && publishedAt > 0) {
      this.brokerConsumerLag.observe(Math.max(0, (Date.now() - publishedAt) / 1000));
    }

    // Extracción de OpenTelemetry
    let currentCtx = context.active();
    if (originalMsg?.properties?.headers) {
      currentCtx = propagation.extract(currentCtx, originalMsg.properties.headers);
    }

    return context.with(currentCtx, () => {
      return next.handle().pipe(
      tap(() => {
        if (channel && originalMsg) {
          try { channel?.ack?.(originalMsg); } catch { /* ignore */ }
        }
      }),
      retry({
        delay: (error: Error, retryCount: number) => {
          // H-5: error permanente del consumidor → DLQ al primer intento, sin
          // quemar los reintentos. Mismo camino que "reintentos agotados".
          if (esErrorPermanenteConsumidor(error)) {
            this.dlqMessagesCounter.inc();
            this.logger.error({
              operation: 'rabbitmqRetry',
              errorCode: 'PERMANENT_CONSUMER_ERROR',
              message: `Error permanente del consumidor; a DLQ sin reintentar: ${error.message}`,
            });
            if (channel && originalMsg) {
              try { channel?.nack?.(originalMsg, false, false); } catch { /* ignore */ }
            }
            return throwError(() => error);
          }

          if (retryCount > maxRetries) {
            this.dlqMessagesCounter.inc();
            this.logger.error(
              `Reintentos agotados (${maxRetries}). Mandando a DLQ. Error: ${error.message}`
            );
            if (channel && originalMsg) {
              try { channel?.nack?.(originalMsg, false, false); } catch { /* ignore */ }
            }
            return throwError(() => error);
          }

          this.retryCounter.inc({ surface: 'broker' });
          const delayMs = backoffConJitter(retryCount, initialDelay);
          this.logger.warn(
            `Fallo en el consumidor. Reintento ${retryCount}/${maxRetries} en ${delayMs}ms. Error: ${error.message}`
          );
          return timer(delayMs);
        },
      }),
    );
    });
  }
}
