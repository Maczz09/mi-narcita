import { Injectable, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { SEDE_PRINCIPAL_ID } from '@org/shared-auth';
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

    // T-23 Fase 2: los eventos RMQ no pasan por el ValidationPipe global — un
    // productor legado (rollout en curso) puede publicar sin sedeId.
    if (!data.sedeId) {
      this.logger.warn({
        operation: 'registrarComprobantePago',
        aggregateId: data.cuentaId,
        errorCode: 'EVENTO_SIN_SEDE',
        message: 'Evento CuentaCerrada sin sedeId; se asigna Sede Principal.',
      } satisfies OperableLog);
    }
    const sedeId = data.sedeId ?? SEDE_PRINCIPAL_ID;

    await this.prisma.comprobantePago.upsert({
      where: { cuentaId: data.cuentaId },
      create: {
        cuentaId: data.cuentaId,
        sedeId,
        mesaId: data.mesaId,
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
      // Si ya está EMITIDO no se toca el total/items (el comprobante SUNAT ya
      // se firmó con esos datos); solo se actualiza mientras sigue DISPONIBLE.
      // Tampoco se rescribe sedeId: una re-entrega no debe reasignar la sede.
      update: {
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
      },
    });
  }

  /**
   * T-23 Fase 2 — LENIENTE (mismo criterio que reportes/identidad): usuario
   * pineado → siempre su sede; admin general → la que pida, o TODAS (sin
   * pantalla en pwa-cliente hoy que use el filtro, pero la API ya lo soporta).
   */
  async listarDisponibles(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado;
    return this.prisma.comprobantePago.findMany({
      where: { estado: 'DISPONIBLE', ...(sedeId ? { sedeId } : {}) },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
  }

  async listarTodos(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado;
    return this.prisma.comprobantePago.findMany({
      where: { ...(sedeId ? { sedeId } : {}) },
      orderBy: { fecha: 'desc' },
      take: 200,
      include: { comprobante: true },
    });
  }
}
