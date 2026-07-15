import { OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { getOrCreateGauge } from '@org/observabilidad';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBasePrismaService<T extends new (...args: any[]) => any>(PrismaClientClass: T) {
  abstract class BasePrismaService extends PrismaClientClass implements OnModuleInit, OnModuleDestroy {
    abstract readonly serviceName: string;

    readonly pgPool: Pool;
    private poolMetricsTimer?: NodeJS.Timeout;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL is not defined in the environment');
      }

      // Auditoría de carga (B-1): sin `connectionTimeoutMillis` el default de pg
      // es 0 = espera infinita por una conexión → bajo saturación las peticiones
      // se cuelgan sin techo en vez de fallar rápido. `max` conserva el default
      // de pg (10) pero queda calibrable por servicio vía env.
      const pool = new Pool({
        connectionString,
        max: Number(process.env.PG_POOL_MAX ?? 10),
        connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_TIMEOUT_MS ?? 5000),
      });
      const adapter = new PrismaPg(pool);
      // Medido bajo carga (2026-07-13): el maxWait default de Prisma (2s) hace
      // que bajo saturación las transacciones fallen con P2028 (→ HTTP 500 en
      // masa) aunque el pool tenga hueco: la cola de adquisición supera los 2s.
      // Esperar más = backpressure (respuestas lentas), no errores. Calibrable
      // por env; el timeout de tx (duración) también sube acorde.
      super({
        adapter,
        transactionOptions: {
          maxWait: Number(process.env.PG_TX_MAXWAIT_MS ?? 10_000),
          timeout: Number(process.env.PG_TX_TIMEOUT_MS ?? 30_000),
        },
        ...args[0],
      });
      this.pgPool = pool;
    }

    async onModuleInit() {
      await (this as unknown as { $connect(): Promise<void> }).$connect();
      const connectionString = process.env.DATABASE_URL ?? '';
      const dbName = connectionString.split('/').pop()?.split('?')[0] ?? 'desconocida';
      Logger.log(`Conectado a ${dbName} vía PrismaPg`, this.serviceName);

      // B-2: el pool es el cuello de botella n.º 1 bajo carga y era invisible.
      // waiting_count > 0 sostenido = pool saturado (peticiones esperando conexión).
      const total = getOrCreateGauge('pg_pool_total_count', 'Conexiones abiertas del pg.Pool', ['service']);
      const idle = getOrCreateGauge('pg_pool_idle_count', 'Conexiones ociosas del pg.Pool', ['service']);
      const waiting = getOrCreateGauge('pg_pool_waiting_count', 'Peticiones esperando conexión del pg.Pool', ['service']);
      this.poolMetricsTimer = setInterval(() => {
        total.set({ service: this.serviceName }, this.pgPool.totalCount);
        idle.set({ service: this.serviceName }, this.pgPool.idleCount);
        waiting.set({ service: this.serviceName }, this.pgPool.waitingCount);
      }, 5000);
      this.poolMetricsTimer.unref();
    }

    async onModuleDestroy() {
      if (this.poolMetricsTimer) clearInterval(this.poolMetricsTimer);
      await (this as unknown as { $disconnect(): Promise<void> }).$disconnect();
    }
  }

  return BasePrismaService;
}
