import { Controller, Logger, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CuentaAbiertaPayload, CuentaCerradaPayload, RoutingKeys } from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog } from '@org/observabilidad';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @EventPattern(RoutingKeys.CuentaAbierta)
  async handleCuentaAbierta(
    @Payload() payload: CuentaAbiertaPayload,
  ) {
    await this.prisma.cuentaAbierta.upsert({
      where: { cuentaId: payload.cuentaId },
      create: { cuentaId: payload.cuentaId, mesaId: payload.mesaId, total: 0, estado: 'ABIERTA' },
      update: { estado: 'ABIERTA', mesaId: payload.mesaId },
    });

    this.logger.log({
      operation: 'handleCuentaAbierta',
      aggregateId: payload.cuentaId,
      message: `Cuenta abierta; proyección local de caja actualizada (mesa ${payload.mesaId}).`,
    } satisfies OperableLog);
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(
    @Payload() payload: CuentaCerradaPayload,
  ) {
    await this.prisma.cuentaAbierta.update({
      where: { cuentaId: payload.cuentaId },
      data: { estado: 'CERRADA', total: payload.total },
    }).catch(() => {
      this.logger.warn({
        operation: 'handleCuentaCerrada',
        aggregateId: payload.cuentaId,
        errorCode: 'PROYECCION_NO_ENCONTRADA',
        message: 'Cuenta no encontrada en la proyección local de caja al intentar cerrarla.',
      } satisfies OperableLog);
    });

    this.logger.log({
      operation: 'handleCuentaCerrada',
      aggregateId: payload.cuentaId,
      message: `Cuenta cerrada; proyección local de caja actualizada (mesa ${payload.mesaId}, total S/ ${payload.total}).`,
    } satisfies OperableLog);
  }
}
