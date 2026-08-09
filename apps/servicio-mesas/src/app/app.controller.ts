import { Controller, Get, Post, Body, Param, Patch, Delete, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { AppService } from './app.service';
import { CrearMesaCommand, ActualizarEstadoMesaCommand, CrearUbicacionCommand, ActualizarUbicacionCommand } from '@org/contracts';

// Salón: lo consultan/operan mesero, cajero y recepción (mapa de roles del PWA).
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'RECEPCION')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  listarMesas() {
    return this.appService.listarMesas();
  }

  // --- UBICACIONES --- (antes de ':id' para que no lo capture esa ruta)

  @Get('ubicaciones')
  listarUbicaciones() {
    return this.appService.listarUbicaciones();
  }

  // Gestión de zonas = configuración del salón, reservada a administración.
  @Roles('ADMIN', 'SISTEMA')
  @Post('ubicaciones')
  crearUbicacion(@Body() body: CrearUbicacionCommand) {
    return this.appService.crearUbicacion(body);
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
  crearMesa(@Body() body: CrearMesaCommand) {
    return this.appService.crearMesa(body);
  }

  @Patch(':id/estado')
  actualizarEstado(@Param('id', ParseUUIDPipe) id: string, @Body() body: ActualizarEstadoMesaCommand) {
    return this.appService.actualizarEstado(id, body);
  }
}
