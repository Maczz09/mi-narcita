import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Public, Roles, RolesGuard } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { PrintQueueService, type DestinationInput } from './print-queue.service';

@Controller('impresion')
export class PrintController {
  constructor(private readonly queue: PrintQueueService) {}

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('destinos')
  listDestinations(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.queue.listDestinations(this.queue.resolveSede(usuarioSedeId, sedeId));
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('destinos/:station')
  saveDestination(@UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Param('station') station: string, @Body() body: DestinationInput, @Query('sedeId') sedeId?: string) {
    return this.queue.saveDestination(this.queue.resolveSede(usuarioSedeId, sedeId), station, body);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Get('trabajos')
  listJobs(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Query('sedeId') sedeId?: string) {
    return this.queue.listJobs(this.queue.resolveSede(usuarioSedeId, sedeId));
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('trabajos/:id/reintentar')
  retry(@UsuarioActual('sedeId') usuarioSedeId: string | null, @Param('id') id: string, @Query('sedeId') sedeId?: string) {
    return this.queue.retry(this.queue.resolveSede(usuarioSedeId, sedeId), id);
  }

  @Public()
  @Get('agente/next')
  next(@Headers('x-print-agent-key') key: string | undefined, @Query('agentId') agentId: string) {
    this.queue.assertAgentKey(key);
    return this.queue.claim(agentId);
  }

  @Public()
  @Post('agente/:id/ack')
  ack(@Headers('x-print-agent-key') key: string | undefined, @Param('id') id: string,
    @Body() body: { agentId?: string; leaseToken?: string; ok?: boolean; error?: string }) {
    this.queue.assertAgentKey(key);
    return this.queue.acknowledge(body.agentId || '', id, body.leaseToken || '', body.ok === true, body.error);
  }
}
