import { Controller, Get, HttpException, HttpStatus, Inject, Optional, Type } from '@nestjs/common';
import { DynamicModule, Module } from '@nestjs/common';
import { register } from 'prom-client';
import { RabbitMQPublisherService } from '@org/shared-rabbitmq';

/**
 * Health check serio compartido (S33 · FF-DEP-02 / G2).
 *
 * Reemplaza los `{ status: 'OK' }` "débiles" que el material de la sesión 33
 * rechaza. Expone el trío recomendado `/health/live · /health/ready ·
 * /health/dependencies` con `status/service/version/dependencies`.
 *
 * - live:         el proceso está arriba (no toca dependencias) → siempre UP.
 * - ready:        listo para recibir tráfico → exige la BD alcanzable (503 si no).
 * - dependencies: BD + estado de cada circuit breaker (dependencias síncronas).
 *
 * El estado de las dependencias síncronas (pedidos→inventario/mesas,
 * caja→cuentas) se lee del gauge `circuit_breaker_state` que ya publica
 * `libs/resiliencia` — así no hay wiring nuevo por servicio: si el breaker de
 * inventario está abierto, aparece `"inventario": "DOWN"` sin tocar el código
 * del servicio. Se registra por servicio con `HealthModule.forRoot(PrismaService)`.
 */
export const HEALTH_DB = Symbol('HEALTH_DB');

interface HealthDb {
  serviceName: string;
  $queryRawUnsafe(query: string): Promise<unknown>;
}

const VERSION = process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? '0.0.0';

type Estado = 'UP' | 'DEGRADED' | 'DOWN';

// Orden de severidad para colapsar varios breakers de una misma dependencia al
// peor estado observado (DOWN > DEGRADED > UP).
const SEVERIDAD: Record<Estado, number> = { UP: 0, DEGRADED: 1, DOWN: 2 };
function peorEstado(actual: Estado | undefined, nuevo: Estado): Estado {
  if (!actual) return nuevo;
  return SEVERIDAD[nuevo] > SEVERIDAD[actual] ? nuevo : actual;
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HEALTH_DB) private readonly db: HealthDb,
    // Opcional: los servicios sin RabbitMQ (p. ej. identidad) no lo proveen, y
    // entonces el broker simplemente no aparece entre las dependencias. El
    // RabbitMQModule es @Global, así que donde existe se inyecta sin wiring extra.
    @Optional() private readonly broker?: RabbitMQPublisherService,
  ) {}

  private get service(): string {
    return this.db.serviceName.replace(/^servicio-/, '');
  }

  @Get('live')
  live() {
    return { status: 'UP', service: this.service, version: VERSION };
  }

  @Get('ready')
  async ready() {
    const database = await this.checkDb();
    const body = {
      status: database === 'UP' ? 'UP' : 'DOWN',
      service: this.service,
      version: VERSION,
      dependencies: { database },
    };
    if (body.status !== 'UP') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  @Get('dependencies')
  async dependencies() {
    const dependencies: Record<string, Estado> = {
      database: await this.checkDb(),
      ...this.brokerState(),
      ...(await this.breakerStates()),
    };
    const valores = Object.values(dependencies);
    const status: Estado = valores.includes('DOWN')
      ? 'DOWN'
      : valores.includes('DEGRADED')
        ? 'DEGRADED'
        : 'UP';
    return { status, service: this.service, version: VERSION, dependencies };
  }

  // `/health` a secas → respuesta rica (nunca `{ ok: true }`).
  @Get()
  root() {
    return this.dependencies();
  }

  private async checkDb(): Promise<Estado> {
    try {
      await this.db.$queryRawUnsafe('SELECT 1');
      return 'UP';
    } catch {
      return 'DOWN';
    }
  }

  /**
   * Conexión con el broker RabbitMQ (verdad en tiempo real vía
   * `amqp-connection-manager`). Deliberadamente NO participa en `/ready`: un
   * blip del broker no debe sacar al servicio del balanceador (sigue sirviendo
   * HTTP y el outbox retiene los eventos), pero sí debe ser visible aquí.
   * Se omite en servicios que no usan RabbitMQ.
   */
  private brokerState(): Record<string, Estado> {
    if (!this.broker) return {};
    return { rabbitmq: this.broker.isConnected() ? 'UP' : 'DOWN' };
  }

  private async breakerStates(): Promise<Record<string, Estado>> {
    const metric = register.getSingleMetric('circuit_breaker_state') as
      | { get(): Promise<{ values: { value: number; labels: Record<string, string> }[] }> }
      | undefined;
    if (!metric) return {};
    const out: Record<string, Estado> = {};
    const data = await metric.get();
    for (const v of data.values) {
      // Se agrupa por `dependency` (nombre canónico legible: 'inventario'); si el
      // gauge aún no lo trae, cae a `breaker`. Varios breakers de la misma
      // dependencia (p. ej. consultarStock/reservarStock) colapsan al PEOR estado.
      const nombre = v.labels.dependency ?? v.labels.breaker ?? 'dependencia';
      const estado: Estado = v.value >= 1 ? 'DOWN' : v.value >= 0.5 ? 'DEGRADED' : 'UP';
      out[nombre] = peorEstado(out[nombre], estado);
    }
    return out;
  }
}

/**
 * Registra el health check serio para un servicio.
 * `prismaService` debe estar disponible globalmente (PrismaModule @Global) para
 * el `useExisting`, mismo idiom que `OutboxModule.forService(PrismaService)`.
 */
@Module({})
export class HealthModule {
  static forRoot(prismaService: Type<unknown>): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: HEALTH_DB, useExisting: prismaService }],
    };
  }
}
