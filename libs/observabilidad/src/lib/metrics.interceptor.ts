import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';
import { RmqContext } from '@nestjs/microservices';

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
    });
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

      const endTimer = this.rmqDuration.startTimer();

      return next.handle().pipe(
        tap({
          next: () => {
            this.rmqCounter.inc({ queue, routing_key: routingKey, status: 'success' });
            endTimer({ queue, routing_key: routingKey });
          },
          error: () => {
            this.rmqCounter.inc({ queue, routing_key: routingKey, status: 'error' });
            endTimer({ queue, routing_key: routingKey });
          },
        })
      );
    }

    if (ctxType === 'http') {
      const req = context.switchToHttp().getRequest<{ method: string, route?: { path: string }, url: string }>();
      const res = context.switchToHttp().getResponse<{ statusCode: number }>();
      const { method, route, url } = req;
      const path = route ? route.path : url;
      
      const endTimer = this.requestDuration.startTimer();

      return next.handle().pipe(
        tap({
          next: () => {
            const statusCode = res.statusCode;
            this.requestCounter.inc({ method, route: path, status_code: statusCode });
            endTimer({ method, route: path, status_code: statusCode });
          },
          error: (err: unknown) => {
            const statusCode = (err as { status?: number }).status || 500;
            this.requestCounter.inc({ method, route: path, status_code: statusCode });
            endTimer({ method, route: path, status_code: statusCode });
          },
        })
      );
    }

    return next.handle();
  }
}
