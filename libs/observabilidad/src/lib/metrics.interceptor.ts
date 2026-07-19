import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram, register, Registry, type RegistryContentType } from 'prom-client';
import { RmqContext } from '@nestjs/microservices';
import { trace } from '@opentelemetry/api';

// Exemplars (granularidad atómica): cada observación de latencia lleva adjunto
// el trace_id del span activo, de modo que en Grafana un punto del histograma
// enlaza a la traza CONCRETA en Jaeger (el datasource ya define
// exemplarTraceIdDestinations: trace_id → jaeger). prom-client sólo emite
// exemplars si el registro está en formato OpenMetrics, y además exige que ese
// formato esté fijado ANTES de construir un métrico con `enableExemplars`
// (si no, lanza en el constructor). Por eso se fija aquí, a nivel de módulo,
// que se importa vía el barrel muy temprano en el arranque —bastante antes de
// que la instancia singleton del interceptor construya sus histogramas y de que
// el endpoint /telemetry/metrics responda el primer scrape—.
//
// Efecto colateral controlado: TODO el endpoint pasa a OpenMetrics. Prometheus
// negocia formato por contenido y lo scrapea igual; y como los 12 counters ya
// terminan en `_total`, OpenMetrics no renombra ninguna serie existente.
// El `register` global está tipado a PrometheusContentType; lo ensanchamos a
// RegistryContentType (acepta ambos formatos) para poder fijar OpenMetrics.
(register as Registry<RegistryContentType>).setContentType(Registry.OPENMETRICS_CONTENT_TYPE);

const TRACE_ID_INVALIDO = '00000000000000000000000000000000';

/**
 * trace_id del span en curso, o `undefined` si no hay traza válida. La
 * auto-instrumentación de OpenTelemetry ya abrió un span para el request
 * HTTP / mensaje RMQ, así que en la práctica siempre hay uno.
 */
function traceIdActivo(): string | undefined {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  return traceId && traceId !== TRACE_ID_INVALIDO ? traceId : undefined;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly requestCounter: Counter<string>;
  private readonly requestDuration: Histogram<string>;
  private readonly rmqCounter: Counter<string>;
  private readonly rmqDuration: Histogram<string>;

  constructor() {
    this.requestCounter = new Counter({
      name: 'http_requests_total',
      help: 'Número total de peticiones HTTP',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.requestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duración de peticiones HTTP en segundos',
      labelNames: ['method', 'route', 'status_code'],
      // Buckets extendidos (B-3): bajo saturación todo caía en +Inf y el p99
      // perdía resolución justo durante las pruebas de carga.
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
      enableExemplars: true,
    });

    this.rmqCounter = new Counter({
      name: 'rabbitmq_messages_processed_total',
      help: 'Número total de mensajes RabbitMQ procesados',
      labelNames: ['queue', 'routing_key', 'status'],
    });

    this.rmqDuration = new Histogram({
      name: 'rabbitmq_message_processing_duration_seconds',
      help: 'Duración de procesamiento de mensajes RabbitMQ en segundos',
      labelNames: ['queue', 'routing_key'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
      enableExemplars: true,
    });
  }

  /**
   * Observa la latencia adjuntando el trace_id activo como exemplar (si lo hay).
   * Con `enableExemplars`, `startTimer()` no permite pasar exemplarLabels, así
   * que cronometramos a mano con `performance.now()` (buckets en segundos).
   */
  private observarDuracion(
    histogram: Histogram<string>,
    startMs: number,
    labels: Record<string, string | number>,
  ): void {
    const value = (performance.now() - startMs) / 1000;
    const traceId = traceIdActivo();
    if (traceId) {
      histogram.observe({ value, labels, exemplarLabels: { trace_id: traceId } });
    } else {
      histogram.observe({ value, labels });
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctxType = context.getType();

    if (ctxType === 'rpc' || (ctxType as string) === 'rmq') {
      const rmqContext = ctxType === 'rpc'
        ? context.switchToRpc().getContext<RmqContext>()
        : (context as { args?: unknown[] }).args?.[1] as RmqContext | undefined;

      const msg = rmqContext?.getMessage?.() as { fields?: { routingKey?: string, exchange?: string } } | undefined;
      const routingKey = msg?.fields?.routingKey || 'unknown';
      const queue = msg?.fields?.exchange || 'unknown'; // Using exchange as queue fallback or we could use consumer queue

      const startMs = performance.now();

      return next.handle().pipe(
        tap({
          next: () => {
            this.rmqCounter.inc({ queue, routing_key: routingKey, status: 'success' });
            this.observarDuracion(this.rmqDuration, startMs, { queue, routing_key: routingKey });
          },
          error: () => {
            this.rmqCounter.inc({ queue, routing_key: routingKey, status: 'error' });
            this.observarDuracion(this.rmqDuration, startMs, { queue, routing_key: routingKey });
          },
        })
      );
    }

    if (ctxType === 'http') {
      const req = context.switchToHttp().getRequest<{ method: string, route?: { path: string }, url: string }>();
      const res = context.switchToHttp().getResponse<{ statusCode: number }>();
      const { method, route, url } = req;
      const path = route ? route.path : url;

      const startMs = performance.now();

      return next.handle().pipe(
        tap({
          next: () => {
            const statusCode = res.statusCode;
            this.requestCounter.inc({ method, route: path, status_code: statusCode });
            this.observarDuracion(this.requestDuration, startMs, { method, route: path, status_code: statusCode });
          },
          error: (err: unknown) => {
            const statusCode = (err as { status?: number }).status || 500;
            this.requestCounter.inc({ method, route: path, status_code: statusCode });
            this.observarDuracion(this.requestDuration, startMs, { method, route: path, status_code: statusCode });
          },
        })
      );
    }

    return next.handle();
  }
}
