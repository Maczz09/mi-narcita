import { DynamicModule, Inject, Injectable, Logger, Module, Type } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RabbitMQPublisherService } from '@org/shared-rabbitmq';
import { getOrCreateGauge, getOrCreateHistogram } from '@org/observabilidad';
import { isRoutingKey } from '@org/contracts';
import { notifyOutboxFailed } from './outbox-alert';
import { OUTBOX_DB } from './outbox-admin';

/**
 * Procesador del Transactional Outbox (ADR-002), unificado en `libs/resiliencia`.
 *
 * Antes existían 7 copias byte-a-byte (una por servicio productor) que solo
 * diferían en la constante `PRODUCER`. T-07 las consolida aquí sin cambiar la
 * semántica: el `SKIP LOCKED` (T-08) y la purga de idempotency keys (T-06) se
 * abordan en tareas separadas.
 *
 * Cada servicio registra el módulo con `OutboxModule.forService(PrismaService, { producer })`.
 */
export const OUTBOX_CONFIG = Symbol('OUTBOX_CONFIG');

export interface OutboxProcessorConfig {
  /** Nombre del servicio productor (etiqueta de métricas y `x-producer`). */
  producer: string;
  /** Reintentos antes de marcar FAILED (default 5). */
  maxAttempts?: number;
  /** Tamaño de lote por tick (default 50). */
  batchSize?: number;
  /** Retención de eventos PROCESSED en horas (default 24). */
  retencionProcessedHoras?: number;
  /** Retención de eventos FAILED en horas (default 168 = 7 días). */
  retencionFailedHoras?: number;
  /**
   * Si el payload es un objeto, fija `payload.eventId ??= event.id` antes de
   * publicar (lo usaba servicio-inventario para deduplicar en el consumidor).
   */
  injectEventId?: boolean;
}

interface OutboxEventRow {
  id: string;
  routingKey: string;
  payload: string;
  attempts: number;
  createdAt: Date | string;
}

export interface OutboxProcessorDb {
  outboxEvent: {
    count(args: unknown): Promise<number>;
    update(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/** Tabla mapeada (idéntica en los 7 schemas: `@@map("outbox_events")`). */
const OUTBOX_TABLE = '"outbox_events"';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isProcessing = false;
  // H-4: evita loguear el broker caído en cada tick (una vez por transición).
  private brokerDesconectadoLogueado = false;

  private readonly producer: string;
  private readonly maxAttempts: number;
  private readonly batchSize: number;
  private readonly retencionProcessedHoras: number;
  private readonly retencionFailedHoras: number;
  private readonly injectEventId: boolean;

  private readonly outboxPendingGauge = getOrCreateGauge(
    'outbox_pending_total',
    'Eventos del outbox pendientes de publicar',
    ['service'],
  );
  private readonly outboxFailedGauge = getOrCreateGauge(
    'outbox_failed_total',
    'Eventos del outbox en estado FAILED (dead-letter en BD)',
    ['service'],
  );

  private readonly outboxPublishLag = getOrCreateHistogram(
    'outbox_publish_lag_seconds',
    'Latencia desde la creación del evento hasta su publicación',
    [0.5, 1, 2, 5, 10, 30, 60, 300],
    ['service'],
  );

  constructor(
    @Inject(OUTBOX_DB) private readonly prisma: OutboxProcessorDb,
    private readonly rabbitmq: RabbitMQPublisherService,
    @Inject(OUTBOX_CONFIG) config: OutboxProcessorConfig,
  ) {
    this.producer = config.producer;
    this.maxAttempts = config.maxAttempts ?? 5;
    // B-5: el tick de 1 s × batchSize impone un techo de eventos/s por productor
    // (~50 con el default). Calibrable por env para pruebas de carga de escritura.
    this.batchSize = config.batchSize ?? Number(process.env.OUTBOX_BATCH_SIZE ?? 50);
    this.retencionProcessedHoras = config.retencionProcessedHoras ?? 24;
    this.retencionFailedHoras = config.retencionFailedHoras ?? 168;
    this.injectEventId = config.injectEventId ?? false;
  }

  /**
   * Canario de salud del sistema event-driven: publica la profundidad del outbox
   * como gauges Prometheus por servicio. Alimenta el panel/alerta de
   * outbox_pending_total / outbox_failed_total (plan 3.1).
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async refreshOutboxMetrics() {
    try {
      const [pending, failed] = await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
        this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
      ]);
      this.outboxPendingGauge.set({ service: this.producer }, pending);
      this.outboxFailedGauge.set({ service: this.producer }, failed);
    } catch (error) {
      this.logger.warn(`No se pudieron actualizar métricas de outbox: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async processOutboxEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      // H-4: con el broker desconectado, publicar fallaría y quemaría `attempts`,
      // convirtiendo eventos sanos en FAILED en ~5s. Se pausa el tick sin reclamar
      // el lote: los eventos quedan PENDING con attempts intactos. Se loguea una
      // vez por transición (no por tick).
      if (!this.rabbitmq.isConnected()) {
        if (!this.brokerDesconectadoLogueado) {
          this.logger.warn('Broker RabbitMQ desconectado: se pausa el tick del outbox (eventos quedan PENDING).');
          this.brokerDesconectadoLogueado = true;
        }
        return;
      }
      if (this.brokerDesconectadoLogueado) {
        this.logger.log('Broker RabbitMQ reconectado: se reanuda el tick del outbox.');
        this.brokerDesconectadoLogueado = false;
      }

      // T-08: claim atómico del lote. El UPDATE...FOR UPDATE SKIP LOCKED marca
      // los eventos como PUBLISHING y los devuelve, de modo que dos réplicas del
      // processor sobre el mismo store nunca tomen el mismo evento (cada una
      // salta las filas bloqueadas por la otra). batchSize es un entero interno.
      const claimedEvents = await this.prisma.$queryRawUnsafe<OutboxEventRow[]>(
        `UPDATE ${OUTBOX_TABLE} SET status = 'PUBLISHING', "claimedAt" = now()
         WHERE id IN (
           SELECT id FROM ${OUTBOX_TABLE} WHERE status = 'PENDING'
           ORDER BY "createdAt" ASC LIMIT ${Math.trunc(this.batchSize)} FOR UPDATE SKIP LOCKED
         ) RETURNING *`,
      );

      for (const event of claimedEvents) {
        const routingKey = event.routingKey;
        // T-18: routing key fuera del catálogo de contratos = dato corrupto;
        // no se publica (fallaría el binding) y se marca FAILED de inmediato.
        if (!isRoutingKey(routingKey)) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'FAILED', attempts: event.attempts + 1, claimedAt: null },
          });
          this.logger.error(
            `[ALERTA][OUTBOX_FAILED] ${this.producer} evento ${event.id} con routingKey desconocida "${routingKey}" → FAILED (no está en el catálogo de contratos)`,
          );
          void notifyOutboxFailed(this.producer, event.id, routingKey, event.attempts + 1);
          continue;
        }
        try {
          const payload = JSON.parse(event.payload) as Record<string, unknown> | null;
          if (this.injectEventId && payload && typeof payload === 'object' && !Array.isArray(payload)) {
            payload['eventId'] ??= event.id;
          }
          await this.rabbitmq.publish(routingKey, payload, this.producer);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PROCESSED' },
          });
          this.outboxPublishLag.observe(
            { service: this.producer },
            Math.max(0, (Date.now() - new Date(event.createdAt).getTime()) / 1000),
          );
        } catch (error) {
          const attempts = event.attempts + 1;
          if (attempts >= this.maxAttempts) {
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'FAILED', attempts, claimedAt: null },
            });
            this.logger.error(
              `[ALERTA][OUTBOX_FAILED] ${this.producer} evento ${event.id} (${event.routingKey}) marcado FAILED tras ${attempts} intentos`,
              error as Error,
            );
            void notifyOutboxFailed(this.producer, event.id, event.routingKey, attempts);
          } else {
            // Devuelve el evento a PENDING (sale de PUBLISHING) para reintentar.
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PENDING', attempts, claimedAt: null },
            });
            this.logger.warn(`Evento ${event.id} falló (intento ${attempts}/${this.maxAttempts}) — se reintentará`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error procesando Outbox:', error as Error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Rescate de eventos PUBLISHING huérfanos (T-08): si una réplica murió a mitad
   * de lote, sus eventos quedan en PUBLISHING. Tras 60s sin progresar vuelven a
   * PENDING para que otra réplica los retome (at-least-once; el duplicado lo
   * absorbe la idempotencia del consumidor).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async rescatarPublishing() {
    try {
      const n = await this.prisma.$executeRawUnsafe(
        `UPDATE ${OUTBOX_TABLE} SET status = 'PENDING', "claimedAt" = NULL
         WHERE status = 'PUBLISHING' AND "claimedAt" < now() - interval '60 seconds'`,
      );
      if (n > 0) {
        this.logger.warn(`Rescate outbox: ${n} evento(s) PUBLISHING huérfano(s) devuelto(s) a PENDING`);
      }
    } catch (error) {
      this.logger.warn(`No se pudo ejecutar el rescate de outbox: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgarOutbox() {
    const cutoffProcessed = new Date(Date.now() - this.retencionProcessedHoras * 3_600_000);
    const cutoffFailed = new Date(Date.now() - this.retencionFailedHoras * 3_600_000);
    const r1 = await this.prisma.outboxEvent.deleteMany({
      where: { status: 'PROCESSED', createdAt: { lt: cutoffProcessed } },
    });
    const r2 = await this.prisma.outboxEvent.deleteMany({
      where: { status: 'FAILED', createdAt: { lt: cutoffFailed } },
    });
    if (r1.count + r2.count > 0) {
      this.logger.log(`Purga outbox: ${r1.count} PROCESSED + ${r2.count} FAILED eliminados`);
    }
  }
}

/**
 * Registra el procesador del outbox para un servicio productor concreto.
 *
 * `prismaService` debe exponer el modelo `outboxEvent` y estar disponible
 * globalmente (PrismaModule @Global) para el `useExisting`.
 */
@Module({})
export class OutboxModule {
  static forService(prismaService: Type<unknown>, config: OutboxProcessorConfig): DynamicModule {
    return {
      module: OutboxModule,
      providers: [
        OutboxProcessor,
        { provide: OUTBOX_DB, useExisting: prismaService },
        { provide: OUTBOX_CONFIG, useValue: config },
      ],
      exports: [OutboxProcessor],
    };
  }
}
