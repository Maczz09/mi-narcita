import { Controller, Get, Logger, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  PedidoCreadoPayload,
  PedidoActualizadoPayload,
  PedidoListoPayload,
  TicketGeneradoPayload,
  CuentaAbiertaPayload,
  CuentaCerradaPayload,
  MesaActualizadaPayload,
  ReservaCanceladaPayload,
  ReservaCreadaPayload,
  RoutingKeys,
} from '@org/contracts';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { OperableLog } from '@org/observabilidad';
import { AppService } from './app.service';
import { NotificationsGateway } from './notifications.gateway';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly gateway: NotificationsGateway,
  ) {}

  @Get()
  async obtenerNotificaciones() {
    return this.appService.obtenerNotificaciones();
  }

  @EventPattern(RoutingKeys.PedidoCreado)
  async handlePedidoCreado(
    @Payload() payload: PedidoCreadoPayload,
  ) {
    await this.handleEvent(RoutingKeys.PedidoCreado, payload);
  }

  @EventPattern(RoutingKeys.PedidoActualizado)
  async handlePedidoActualizado(
    @Payload() payload: PedidoActualizadoPayload,
  ) {
    await this.handleEvent(RoutingKeys.PedidoActualizado, payload);
  }

  @EventPattern(RoutingKeys.PedidoListo)
  async handlePedidoListo(
    @Payload() payload: PedidoListoPayload,
  ) {
    await this.handleEvent(RoutingKeys.PedidoListo, payload);
  }

  @EventPattern(RoutingKeys.TicketGenerado)
  async handleTicketGenerado(
    @Payload() payload: TicketGeneradoPayload,
  ) {
    await this.handleEvent(RoutingKeys.TicketGenerado, payload);
  }

  @EventPattern(RoutingKeys.CuentaAbierta)
  async handleCuentaAbierta(
    @Payload() payload: CuentaAbiertaPayload,
  ) {
    await this.handleEvent(RoutingKeys.CuentaAbierta, payload);
  }

  @EventPattern(RoutingKeys.CuentaCerrada)
  async handleCuentaCerrada(
    @Payload() payload: CuentaCerradaPayload,
  ) {
    await this.handleEvent(RoutingKeys.CuentaCerrada, payload);
  }

  @EventPattern(RoutingKeys.MesaActualizada)
  async handleMesaActualizada(
    @Payload() payload: MesaActualizadaPayload,
  ) {
    await this.handleEvent(RoutingKeys.MesaActualizada, payload);
  }

  @EventPattern(RoutingKeys.ReservaCreada)
  async handleReservaCreada(
    @Payload() payload: ReservaCreadaPayload,
  ) {
    await this.handleEvent(RoutingKeys.ReservaCreada, payload);
  }

  @EventPattern(RoutingKeys.ReservaCancelada)
  async handleReservaCancelada(
    @Payload() payload: ReservaCanceladaPayload,
  ) {
    await this.handleEvent(RoutingKeys.ReservaCancelada, payload);
  }

  /**
   * Extrae un id de negocio reconocible sin asumir la forma exacta del
   * payload (cada RoutingKey trae una distinta). Deliberadamente NO se loguea
   * el payload completo (sesión 29: "los logs guardan todo el payload" es el
   * anti-patrón a evitar) — solo el id necesario para buscar el caso.
   */
  private extractAggregateId(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const d = data as Record<string, unknown>;
    const pedido = d['pedido'] as Record<string, unknown> | undefined;
    const mesa = d['mesa'] as Record<string, unknown> | undefined;
    const candidato =
      pedido?.['id'] ?? d['cuentaId'] ?? d['mesaId'] ?? mesa?.['id'] ?? d['ticketId'] ?? d['reservaId'];
    return typeof candidato === 'string' ? candidato : undefined;
  }

  private async handleEvent(
    pattern: string,
    data: unknown,
  ): Promise<void> {
    this.logger.log({
      operation: pattern,
      aggregateId: this.extractAggregateId(data),
      message: 'Evento de negocio recibido; se registra y notifica en tiempo real.',
    } satisfies OperableLog);

    // Guardar en la base de datos de manera persistente
    const notif = await this.appService.registrarNotificacion(pattern, data);

    // Emitir por WebSocket para tiempo real
    this.gateway.emitPedidoUpdate({
      pattern,
      data: {
        ...(typeof data === 'object' ? data : {}),
        notificacionId: notif?.id,
        contenido: notif?.contenido,
      },
    });
  }
}
