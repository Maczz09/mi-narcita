import { Injectable, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { CuentaCerradaPayload } from '@org/contracts';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-model local del cierre de cuenta (consume cuenta.cerrada), mismo
   * patrón que VentaDiaria en servicio-reportes. Es el "comprobante de pago"
   * que caja/admin ve para elegir qué emitir como boleta o factura SUNAT.
   */
  async registrarComprobantePago(data: CuentaCerradaPayload): Promise<void> {
    this.logger.log({
      operation: 'registrarComprobantePago',
      aggregateId: data.cuentaId,
      message: `Comprobante de pago disponible para mesa ${data.mesaId}, total S/ ${data.total}.`,
    } satisfies OperableLog);

    await this.prisma.comprobantePago.upsert({
      where: { cuentaId: data.cuentaId },
      create: {
        cuentaId: data.cuentaId,
        mesaId: data.mesaId,
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
      // Si ya está EMITIDO no se toca el total/items (el comprobante SUNAT ya
      // se firmó con esos datos); solo se actualiza mientras sigue DISPONIBLE.
      update: {
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
      },
    });
  }

  async listarDisponibles() {
    return this.prisma.comprobantePago.findMany({
      where: { estado: 'DISPONIBLE' },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
  }

  async listarTodos() {
    return this.prisma.comprobantePago.findMany({
      orderBy: { fecha: 'desc' },
      take: 200,
      include: { comprobante: true },
    });
  }
}
