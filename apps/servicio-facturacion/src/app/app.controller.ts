import { Controller, Get, Logger, UseGuards, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Roles, RolesGuard } from '@org/shared-auth';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog } from '@org/observabilidad';
import { AppService } from './app.service';
import { CuentaCerradaPayload, RoutingKeys } from '@org/contracts';

// RBAC por método: el controller también atiende el evento RMQ (@EventPattern),
// por eso el guard de roles no va a nivel de clase (mismo patrón que reportes).
@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  healthCheck() {
    return { status: 'OK', service: 'Facturacion' };
  }

  // Listado para el selector de caja/admin: "¿qué comprobante de pago subo
  // como boleta o factura?".
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO')
  @Get('comprobantes-pago')
  listarDisponibles() {
    return this.appService.listarDisponibles();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO')
  @Get('comprobantes-pago/todos')
  listarTodos() {
    return this.appService.listarTodos();
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(@Payload() payload: CuentaCerradaPayload) {
    this.logger.log({
      operation: RoutingKeys.CuentaCerrada,
      aggregateId: payload.cuentaId,
      message: 'Comprobante de pago recibido.',
    } satisfies OperableLog);
    await this.appService.registrarComprobantePago(payload);
  }
}
