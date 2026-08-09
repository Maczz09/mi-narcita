import { Controller, Get, Post, Body, Query, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { IdempotencyInterceptor } from '@org/resiliencia';
import { AppService } from './app.service';
import { ListarTransaccionesQuery, ListarTurnosQuery, TransaccionListResponse, TurnoListResponse } from '@org/contracts';
import { UsuarioActual } from '@org/observabilidad';
import {
  AbrirTurnoCajaCommand,
  CerrarTurnoCajaCommand,
  CrearMovimientoCajaCommand,
  PagarCuentaCajaCommand,
  RegistrarArqueoCajaCommand,
} from './caja.dto';

// Caja: operada por el cajero; admin/sistema con acceso total.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // /api/health lo sirve el HealthController compartido (@org/observabilidad).

  // Idempotencia HTTP (plan 1.3): evita pagos duplicados por doble-click/retry.
  @UseInterceptors(IdempotencyInterceptor)
  @Post('pagos')
  registrarPago(
    @Body() body: PagarCuentaCajaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
  ) {
    return this.appService.registrarPago(
      body,
      usuarioId,
      usuarioNombre ?? usuarioEmail ?? usuarioId,
    );
  }

  @Get()
  listarTransacciones(@Query() query: ListarTransaccionesQuery): Promise<TransaccionListResponse> {
    return this.appService.listarTransacciones(query);
  }

  @Post('turnos/abrir')
  abrirTurno(@Body() body: AbrirTurnoCajaCommand, @UsuarioActual() usuarioId: string | null) {
    return this.appService.abrirTurno(body, usuarioId);
  }

  // Historial de turnos (p.ej. cierres de caja pasados) — solo admin/sistema.
  @Roles('ADMIN', 'SISTEMA')
  @Get('turnos')
  listarTurnos(@Query() query: ListarTurnosQuery): Promise<TurnoListResponse> {
    return this.appService.listarTurnos(query);
  }

  @Get('turnos/activo')
  obtenerTurnoActivo(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @UsuarioActual() _usuarioId: string | null,
  ) {
    return this.appService.obtenerTurnoActivo();
  }

  @Get('turnos/activo/resumen')
  obtenerResumenTurnoActivo(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @UsuarioActual() _usuarioId: string | null,
  ) {
    return this.appService.obtenerResumenTurnoActivo();
  }

  @Get('turnos/:id/resumen')
  obtenerResumenTurno(@Param('id') id: string) {
    return this.appService.obtenerResumenTurno(id);
  }

  @Get('turnos/:id/movimientos')
  listarMovimientosTurno(@Param('id') id: string) {
    return this.appService.listarMovimientosTurno(id);
  }

  @Post('turnos/:id/movimientos')
  crearMovimiento(
    @Param('id') id: string,
    @Body() body: CrearMovimientoCajaCommand,
  ) {
    return this.appService.crearMovimiento(id, body);
  }

  @Post('turnos/:id/arqueo')
  registrarArqueo(
    @Param('id') id: string,
    @Body() body: RegistrarArqueoCajaCommand,
    @UsuarioActual() usuarioId: string | null,
  ) {
    return this.appService.registrarArqueo(id, body, usuarioId);
  }

  @Post('turnos/:id/cerrar')
  cerrarTurno(
    @Param('id') id: string,
    @Body() body: CerrarTurnoCajaCommand,
    @UsuarioActual() usuarioId: string | null,
  ) {
    return this.appService.cerrarTurno(id, body, usuarioId);
  }
}
