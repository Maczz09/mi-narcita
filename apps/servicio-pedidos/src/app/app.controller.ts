import { Controller, Get, Post, Body, Param, Patch, Query, UseInterceptors, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Roles, RolesGuard } from '@org/shared-auth';
import { AppService } from './app.service';
import { CrearPedidoCommand, ActualizarEstadoPedidoCommand, ActualizarEstadoItemCommand, RoutingKeys, PagoRegistradoPayload, ListarPedidosQuery } from '@org/contracts';
import { RabbitMQRetryInterceptor, IdempotencyInterceptor } from '@org/resiliencia';
import { UsuarioActual } from '@org/observabilidad';

// RBAC por método: este controller también atiende eventos RMQ (@EventPattern),
// así que el guard de roles NO se aplica a nivel de clase para no afectarlos.
@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Crean pedidos meseros y cajeros (comandero); cocina solo despacha.
  // Idempotencia HTTP (plan 1.3): doble-click/retry con la misma Idempotency-Key
  // devuelve el mismo pedido en vez de crear duplicados.
  @UseInterceptors(IdempotencyInterceptor)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO')
  @Post()
  crearPedido(
    @Body() body: CrearPedidoCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
  ) {
    return this.appService.crearPedido(
      body,
      usuarioId
        ? { id: usuarioId, nombre: usuarioNombre ?? usuarioEmail ?? usuarioId }
        : null,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA')
  @Get()
  listarPedidos(@Query() query: ListarPedidosQuery, @UsuarioActual('sedeId') usuarioSedeId: string | null) {
    return this.appService.listarPedidos(query, usuarioSedeId);
  }

  // Cocina (KDS) actualiza el estado de pedidos e ítems.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA')
  @Patch(':id/estado')
  actualizarEstado(@Param('id') id: string, @Body() body: ActualizarEstadoPedidoCommand) {
    return this.appService.actualizarEstado(id, body);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA')
  @Patch('items/:itemId/estado')
  actualizarEstadoItem(@Param('itemId') itemId: string, @Body() body: ActualizarEstadoItemCommand) {
    return this.appService.actualizarEstadoItem(itemId, body);
  }

  @EventPattern(RoutingKeys.PagoRegistrado)
  async procesarPago(@Payload() payload: PagoRegistradoPayload) {
    await this.appService.procesarPagoRecibido(payload);
  }
}
