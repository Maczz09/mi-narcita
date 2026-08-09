import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { CrearReservaCommand, ListarReservasQuery } from '@org/contracts';
import { ReservasService } from './reservas.service';

// Reservas: gestionadas por recepción y meseros; gerencia las consulta.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'MESERO', 'RECEPCION')
@Controller()
export class AppController {
  constructor(private readonly reservas: ReservasService) {}

  @Get()
  listar(@Query() query: ListarReservasQuery) {
    return this.reservas.listar(query);
  }

  @Get('disponibilidad')
  disponibilidad(
    @Query('fecha') fecha: string,
    @Query('hora') hora: string,
    @Query('mesaPreferida') mesaPreferida?: string,
  ) {
    return this.reservas.consultarDisponibilidad(fecha, hora, mesaPreferida);
  }

  @Post()
  crear(
    @Body() body: CrearReservaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
  ) {
    return this.reservas.crear(
      body,
      usuarioId ? { id: usuarioId, nombre: usuarioNombre ?? usuarioEmail ?? usuarioId } : null,
    );
  }

  @Patch(':id/confirmar')
  confirmar(@Param('id') id: string) {
    return this.reservas.confirmar(id);
  }

  @Delete(':id')
  cancelar(@Param('id') id: string, @Query('motivo') motivo?: string) {
    return this.reservas.cancelar(id, motivo);
  }
}
