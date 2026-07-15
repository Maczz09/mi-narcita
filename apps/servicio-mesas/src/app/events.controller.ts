import { Controller, Logger, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CuentaCerradaPayload, CuentaAbiertaPayload, RoutingKeys } from '@org/contracts';
import { AppService } from './app.service';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog } from '@org/observabilidad';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly appService: AppService,
  ) {}

  @EventPattern(RoutingKeys.CuentaAbierta)
  async handleCuentaAbierta(
    @Payload() payload: CuentaAbiertaPayload,
  ) {
    this.logger.log({
      operation: 'handleCuentaAbierta',
      aggregateId: payload.mesaId,
      message: `Cuenta abierta (${payload.cuentaId}); ocupando mesa...`,
    } satisfies OperableLog);

    await this.appService.actualizarEstado(payload.mesaId, {
      estado: 'OCUPADA',
      cuentaAsociada: payload.cuentaId,
    });
    this.logger.log({
      operation: 'handleCuentaAbierta',
      aggregateId: payload.mesaId,
      resultingState: 'OCUPADA',
      message: `Mesa marcada como OCUPADA con cuenta ${payload.cuentaId}.`,
    } satisfies OperableLog);
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(
    @Payload() payload: CuentaCerradaPayload,
  ) {
    this.logger.log({
      operation: 'handleCuentaCerrada',
      aggregateId: payload.mesaId,
      message: 'Cuenta cerrada; liberando mesa...',
    } satisfies OperableLog);

    await this.appService.actualizarEstado(payload.mesaId, {
      estado: 'LIBRE',
      cuentaAsociada: null,
    });
    this.logger.log({
      operation: 'handleCuentaCerrada',
      aggregateId: payload.mesaId,
      resultingState: 'LIBRE',
      message: 'Mesa liberada.',
    } satisfies OperableLog);
  }
}
