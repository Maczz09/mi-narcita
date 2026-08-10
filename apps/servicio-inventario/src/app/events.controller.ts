import { Controller, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';
import { CompraRecibidaPayload, PedidoCreadoPayload, RoutingKeys } from '@org/contracts';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class EventsController {
  constructor(private readonly appService: AppService) {}

  @EventPattern(RoutingKeys.PedidoCreado)
  async handlePedidoCreado(
    @Payload() payload: PedidoCreadoPayload,
  ) {
    await this.appService.procesarPedidoCreado(payload.pedido);
  }

  @EventPattern(RoutingKeys.CompraRecibida)
  async handleCompraRecibida(
    @Payload() payload: CompraRecibidaPayload,
  ) {
    await this.appService.procesarCompraRecibida(payload);
  }
}
