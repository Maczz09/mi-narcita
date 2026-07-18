import { CronExpression } from '@nestjs/schedule';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Métricas: stubs que no tocan el registro real de Prometheus.
vi.mock('@org/observabilidad', () => ({
  getOrCreateGauge: () => ({ set: vi.fn() }),
  getOrCreateHistogram: () => ({ observe: vi.fn() }),
}));

// Alerta Slack: la espiamos para verificar el disparo en FAILED.
vi.mock('./outbox-alert', () => ({
  notifyOutboxFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@org/contracts', () => ({
  isRoutingKey: (k: string) => k !== 'evento.inexistente',
}));

import { OutboxProcessor, OutboxProcessorConfig } from './outbox.processor';
import { notifyOutboxFailed } from './outbox-alert';

const CRON_OPTIONS_METADATA = 'SCHEDULE_CRON_OPTIONS';
const PRODUCER = 'servicio-pedidos';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    routingKey: 'pedido.creado',
    payload: JSON.stringify({ pedidoId: 'p1' }),
    attempts: 0,
    status: 'PENDING',
    createdAt: new Date(Date.now() - 2000),
    ...overrides,
  };
}

function createProcessor(config: Partial<OutboxProcessorConfig> = {}) {
  const prisma = {
    outboxEvent: {
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // T-08: el claim del lote y el rescate van por SQL crudo.
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  };
  const rabbitmq = { publish: vi.fn().mockResolvedValue(undefined), isConnected: vi.fn().mockReturnValue(true) };
  return {
    prisma,
    rabbitmq,
    processor: new OutboxProcessor(prisma as import('./outbox.processor').OutboxProcessorDb, rabbitmq as unknown as import('@org/shared-rabbitmq').RabbitMQPublisherService, { producer: PRODUCER, ...config }),
  };
}

// ─── Metadatos de cron ────────────────────────────────────────────────────────

describe('OutboxProcessor — metadatos de cron', () => {
  it('processOutboxEvents corre cada segundo', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const meta = (Reflect as { getMetadata?: (k: string, t: unknown) => unknown }).getMetadata?.(CRON_OPTIONS_METADATA, OutboxProcessor.prototype.processOutboxEvents);
    expect(meta).toMatchObject({ cronTime: CronExpression.EVERY_SECOND });
  });

  it('refreshOutboxMetrics corre cada 10 segundos', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const meta = (Reflect as { getMetadata?: (k: string, t: unknown) => unknown }).getMetadata?.(CRON_OPTIONS_METADATA, OutboxProcessor.prototype.refreshOutboxMetrics);
    expect(meta).toMatchObject({ cronTime: CronExpression.EVERY_10_SECONDS });
  });

  it('purgarOutbox corre cada hora', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const meta = (Reflect as { getMetadata?: (k: string, t: unknown) => unknown }).getMetadata?.(CRON_OPTIONS_METADATA, OutboxProcessor.prototype.purgarOutbox);
    expect(meta).toMatchObject({ cronTime: CronExpression.EVERY_HOUR });
  });

  it('rescatarPublishing corre cada minuto', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const meta = (Reflect as { getMetadata?: (k: string, t: unknown) => unknown }).getMetadata?.(CRON_OPTIONS_METADATA, OutboxProcessor.prototype.rescatarPublishing);
    expect(meta).toMatchObject({ cronTime: CronExpression.EVERY_MINUTE });
  });
});

// ─── refreshOutboxMetrics ─────────────────────────────────────────────────────

describe('OutboxProcessor — refreshOutboxMetrics', () => {
  it('consulta pending y failed counts sin lanzar', async () => {
    const { prisma, processor } = createProcessor();
    prisma.outboxEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    await expect(processor.refreshOutboxMetrics()).resolves.toBeUndefined();

    expect(prisma.outboxEvent.count).toHaveBeenCalledTimes(2);
    expect(prisma.outboxEvent.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    expect(prisma.outboxEvent.count).toHaveBeenCalledWith({ where: { status: 'FAILED' } });
  });

  it('absorbe errores de BD sin lanzar', async () => {
    const { prisma, processor } = createProcessor();
    prisma.outboxEvent.count.mockRejectedValue(new Error('db down'));

    await expect(processor.refreshOutboxMetrics()).resolves.toBeUndefined();
  });
});

// ─── processOutboxEvents ──────────────────────────────────────────────────────

describe('OutboxProcessor — processOutboxEvents', () => {
  beforeEach(() => {
    vi.mocked(notifyOutboxFailed).mockClear();
  });

  it('sin eventos pendientes no llama publish ni update', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    await processor.processOutboxEvents();

    expect(rabbitmq.publish).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('reclama el lote con FOR UPDATE SKIP LOCKED y el batchSize por defecto (50)', async () => {
    const { prisma, processor } = createProcessor();
    await processor.processOutboxEvents();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = String(prisma.$queryRawUnsafe.mock.calls[0][0]);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("SET status = 'PUBLISHING'");
    expect(sql).toContain('LIMIT 50');
    expect(sql).toContain('RETURNING *');
  });

  it('batchSize configurable cambia el LIMIT del claim', async () => {
    const { prisma, processor } = createProcessor({ batchSize: 10 });
    await processor.processOutboxEvents();
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('LIMIT 10');
  });

  it('publica el evento reclamado y lo marca PROCESSED', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent()]);

    await processor.processOutboxEvents();

    expect(rabbitmq.publish).toHaveBeenCalledWith('pedido.creado', { pedidoId: 'p1' }, PRODUCER);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PROCESSED' },
    });
  });

  it('routingKey fuera del catálogo → FAILED sin publicar (T-18)', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent({ routingKey: 'evento.inexistente' })]);

    await processor.processOutboxEvents();

    expect(rabbitmq.publish).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'FAILED', attempts: 1, claimedAt: null },
    });
    expect(notifyOutboxFailed).toHaveBeenCalledWith(PRODUCER, 'evt-1', 'evento.inexistente', 1);
  });

  it('con injectEventId enriquece el payload antes de publicar', async () => {
    const { prisma, rabbitmq, processor } = createProcessor({ producer: 'servicio-inventario', injectEventId: true });
    prisma.$queryRawUnsafe.mockResolvedValue([
      makeEvent({ routingKey: 'stock.descontado', payload: JSON.stringify({ productoId: 'pr1' }) }),
    ]);

    await processor.processOutboxEvents();

    expect(rabbitmq.publish).toHaveBeenCalledWith(
      'stock.descontado',
      { productoId: 'pr1', eventId: 'evt-1' },
      'servicio-inventario',
    );
  });

  it('sin injectEventId no toca el payload', async () => {
    const { rabbitmq, prisma, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent()]);

    await processor.processOutboxEvents();

    expect(rabbitmq.publish).toHaveBeenCalledWith('pedido.creado', { pedidoId: 'p1' }, PRODUCER);
  });

  it('fallo antes de MAX_ATTEMPTS devuelve a PENDING e incrementa attempts', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent({ attempts: 3 })]); // intento 4 < 5
    rabbitmq.publish.mockRejectedValue(new Error('timeout'));

    await processor.processOutboxEvents();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'PENDING', attempts: 4, claimedAt: null },
    });
    expect(notifyOutboxFailed).not.toHaveBeenCalled();
  });

  it('fallo en MAX_ATTEMPTS marca FAILED y dispara notifyOutboxFailed', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent({ attempts: 4 })]); // intento 5 = MAX
    rabbitmq.publish.mockRejectedValue(new Error('timeout'));

    await processor.processOutboxEvents();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'FAILED', attempts: 5, claimedAt: null },
    });
    expect(notifyOutboxFailed).toHaveBeenCalledWith(PRODUCER, 'evt-1', 'pedido.creado', 5);
  });

  it('maxAttempts configurable adelanta el FAILED', async () => {
    const { prisma, rabbitmq, processor } = createProcessor({ maxAttempts: 2 });
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent({ attempts: 1 })]); // intento 2 = MAX
    rabbitmq.publish.mockRejectedValue(new Error('timeout'));

    await processor.processOutboxEvents();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'FAILED', attempts: 2, claimedAt: null },
    });
  });

  it('H-4: broker desconectado → no reclama el lote ni hace update (eventos quedan PENDING)', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    rabbitmq.isConnected.mockReturnValue(false);

    await processor.processOutboxEvents();

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
    expect(rabbitmq.publish).not.toHaveBeenCalled();
    // El lock se liberó pese al retorno temprano.
    expect((processor as unknown as { isProcessing: boolean }).isProcessing).toBe(false);
  });

  it('H-4: reconectado tras una pausa → el flujo normal procede', async () => {
    const { prisma, rabbitmq, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockResolvedValue([makeEvent()]);
    rabbitmq.isConnected.mockReturnValueOnce(false).mockReturnValue(true);

    await processor.processOutboxEvents(); // desconectado: pausa
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();

    await processor.processOutboxEvents(); // reconectado: procede
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(rabbitmq.publish).toHaveBeenCalledWith('pedido.creado', { pedidoId: 'p1' }, PRODUCER);
  });

  it('bloqueo concurrente: segunda llamada vuelve sin reclamar', async () => {
    const { prisma, processor } = createProcessor();
    (processor as unknown as { isProcessing: boolean }).isProcessing = true;

    await processor.processOutboxEvents();

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('error en el claim no lanza (capturado por bloque outer)', async () => {
    const { prisma, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('conn error'));

    await expect(processor.processOutboxEvents()).resolves.toBeUndefined();
  });

  it('libera el bloqueo isProcessing aunque haya un fallo interno', async () => {
    const { prisma, processor } = createProcessor();
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('boom'));

    await processor.processOutboxEvents();

    expect((processor as unknown as { isProcessing: boolean }).isProcessing).toBe(false);
  });
});

// ─── rescatarPublishing (T-08) ────────────────────────────────────────────────

describe('OutboxProcessor — rescatarPublishing', () => {
  it('devuelve a PENDING los PUBLISHING huérfanos (>60s)', async () => {
    const { prisma, processor } = createProcessor();
    prisma.$executeRawUnsafe.mockResolvedValue(2);

    await processor.rescatarPublishing();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = String(prisma.$executeRawUnsafe.mock.calls[0][0]);
    expect(sql).toContain("status = 'PUBLISHING'");
    expect(sql).toContain("SET status = 'PENDING'");
    expect(sql).toContain("interval '60 seconds'");
  });

  it('absorbe errores de BD sin lanzar', async () => {
    const { prisma, processor } = createProcessor();
    prisma.$executeRawUnsafe.mockRejectedValue(new Error('db down'));

    await expect(processor.rescatarPublishing()).resolves.toBeUndefined();
  });
});

// ─── purgarOutbox ─────────────────────────────────────────────────────────────

describe('OutboxProcessor — purgarOutbox', () => {
  it('elimina PROCESSED (24h) y FAILED (168h) con cutoffs correctos', async () => {
    const { prisma, processor } = createProcessor();
    prisma.outboxEvent.deleteMany.mockResolvedValue({ count: 2 });

    await processor.purgarOutbox();

    expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledTimes(2);
    const calls = prisma.outboxEvent.deleteMany.mock.calls as [{ where: { createdAt: { lt: Date } } }][];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(calls[0][0]).toMatchObject({ where: { status: 'PROCESSED', createdAt: { lt: expect.any(Date) } } });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(calls[1][0]).toMatchObject({ where: { status: 'FAILED', createdAt: { lt: expect.any(Date) } } });

    // La retención FAILED (168h) debe ser mayor que la de PROCESSED (24h)
    const cutoffProcessed: Date = calls[0][0].where.createdAt.lt;
    const cutoffFailed: Date = calls[1][0].where.createdAt.lt;
    expect(cutoffFailed.getTime()).toBeLessThan(cutoffProcessed.getTime());
  });
});
