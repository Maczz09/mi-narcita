import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { EmisionService } from './emision.service';
import { EmitirComprobanteDto } from './dto/emitir-comprobante.dto';

// Solo caja/admin deciden qué comprobante de pago sube como boleta o factura
// electrónica (y con qué RUC emisor, cuando hay dos empresas operando).
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO')
@Controller('comprobantes')
export class EmisionController {
  constructor(private readonly emisionService: EmisionService) {}

  @Post(':cuentaId/emitir')
  emitir(@Param('cuentaId') cuentaId: string, @Body() dto: EmitirComprobanteDto) {
    return this.emisionService.emitir(cuentaId, dto);
  }
}
