import { Controller, Logger, Get, Query, UseInterceptors, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Roles, RolesGuard } from '@org/shared-auth';
import { AppService } from './app.service';
import { CuentaCerradaPayload, RoutingKeys } from '@org/contracts';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog } from '@org/observabilidad';
import { ReporteRangoQuery } from './reporte.dto';

// RBAC por método: el controller también atiende eventos RMQ (@EventPattern),
// por eso el guard de roles no va a nivel de clase.
@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  healthCheck() {
    return { status: 'OK', service: 'Reportes' };
  }

  // Reportes/dashboard: administración y gerencia.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('resumen')
  async getResumen() {
    return this.appService.obtenerResumenDiario();
  }

  // Reportes ricos (plan 6.3): por producto / turno / mesero, con rango opcional.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('por-producto')
  async porProducto(@Query() query: ReporteRangoQuery) {
    return this.appService.obtenerPorProducto(query);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('por-turno')
  async porTurno(@Query() query: ReporteRangoQuery) {
    return this.appService.obtenerPorTurno(query);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('por-mesero')
  async porMesero(@Query() query: ReporteRangoQuery) {
    return this.appService.obtenerPorMesero(query);
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(@Payload() payload: CuentaCerradaPayload) {
    this.logger.log({
      operation: RoutingKeys.CuentaCerrada,
      aggregateId: payload.cuentaId,
      message: 'Procesando evento de reporte.',
    } satisfies OperableLog);
    await this.appService.registrarVenta(payload);
  }
}
