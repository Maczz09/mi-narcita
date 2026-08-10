import { Controller, Get, Post, Body, Param, Patch, Delete, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { AppService } from './app.service';
import { CrearMesaCommand, ActualizarEstadoMesaCommand, CrearUbicacionCommand, ActualizarUbicacionCommand, UnirMesasCommand } from '@org/contracts';

// Salón: lo consultan/operan mesero, cajero y recepción (mapa de roles del PWA).
// T-23 (multi-sede): las rutas de listado/alta reciben `sedeId` por query —
// el servicio la resuelve contra `req.user.sedeId` (usuario pineado gana
// siempre; el admin general debe indicarla).
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'RECEPCION')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  listarMesas(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.appService.listarMesas(usuarioSedeId, sedeId);
  }

  // --- UBICACIONES --- (antes de ':id' para que no lo capture esa ruta)

  @Get('ubicaciones')
  listarUbicaciones(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.appService.listarUbicaciones(usuarioSedeId, sedeId);
  }

  // Gestión de zonas = configuración del salón, reservada a administración.
  @Roles('ADMIN', 'SISTEMA')
  @Post('ubicaciones')
  crearUbicacion(
    @Body() body: CrearUbicacionCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.crearUbicacion(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA')
  @Patch('ubicaciones/:id')
  actualizarUbicacion(@Param('id', ParseUUIDPipe) id: string, @Body() body: ActualizarUbicacionCommand) {
    return this.appService.actualizarUbicacion(id, body);
  }

  @Roles('ADMIN', 'SISTEMA')
  @Delete('ubicaciones/:id')
  eliminarUbicacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.appService.eliminarUbicacion(id);
  }

  @Get(':id')
  obtenerMesa(@Param('id', ParseUUIDPipe) id: string) {
    return this.appService.obtenerMesa(id);
  }

  // Alta de mesas = configuración del salón, reservada a administración.
  @Roles('ADMIN', 'SISTEMA')
  @Post()
  crearMesa(
    @Body() body: CrearMesaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.crearMesa(body, usuarioSedeId, sedeId);
  }

  @Patch(':id/estado')
  actualizarEstado(@Param('id', ParseUUIDPipe) id: string, @Body() body: ActualizarEstadoMesaCommand) {
    return this.appService.actualizarEstado(id, body);
  }

  // Unir/separar mesas: tarea operativa de salón, mismo alcance de roles que el resto del recurso.
  @Post('unir')
  unirMesas(@Body() body: UnirMesasCommand) {
    return this.appService.unirMesas(body.mesaIds);
  }

  @Post(':id/separar')
  separarMesas(@Param('id', ParseUUIDPipe) id: string) {
    return this.appService.separarMesas(id);
  }
}
