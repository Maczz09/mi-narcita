import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async obtenerNotificaciones() {
    return this.prisma.notificacion.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: 50,
    });
  }

  async registrarNotificacion(pattern: string, data: unknown) {
    const contenido = this.formatContenido(pattern, data);
    this.logger.log(`Guardando notificación en BD para el evento: ${pattern}`);

    try {
      const notificacion = await this.prisma.notificacion.create({
        data: {
          eventoOrigen: pattern,
          destinatario: 'TODOS',
          canal: 'UI',
          contenido,
          estado: 'PENDIENTE',
        },
      });
      return notificacion;
    } catch (err) {
      this.logger.error(`Error al persistir notificación: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Texto seguro para interpolar: solo strings/números del payload; nunca '[object Object]'. */
  private texto(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return fallback;
  }

  private resolveMesa(data: Record<string, unknown>): string {
    if (data['numeroMesa'] != null) return `Mesa ${this.texto(data['numeroMesa'], '??')}`;
    if (data['mesaNumero'] != null) return `Mesa ${this.texto(data['mesaNumero'], '??')}`;
    return `Mesa ${this.texto(data['mesaId'], '??')}`;
  }

  private formatPedidoCreado(data: Record<string, unknown>): string {
    const mesa = this.resolveMesa(data);
    return `Nuevo pedido registrado para la ${mesa} por un total de S/ ${Number(data['total'] || 0).toFixed(2)}.`;
  }

  private formatPedidoActualizado(data: Record<string, unknown>): string {
    const mesa = this.resolveMesa(data);
    const estadoStr = this.texto(data['estado']).replaceAll('_', ' ').toLowerCase();
    return `El pedido de la ${mesa} ha cambiado al estado ${estadoStr}.`;
  }

  private formatContenido(pattern: string, data: unknown): string {
    try {
      if (!data) return `Actualización de ${pattern}`;
      const d = data as Record<string, unknown>;
      if (pattern.includes('pedido.creado') || pattern.includes('creado')) return this.formatPedidoCreado(d);
      if (pattern.includes('pedido.actualizado') || pattern.includes('actualizado')) return this.formatPedidoActualizado(d);
      if (pattern.includes('reserva.cancelada')) {
        return `La reserva a nombre de ${this.texto(d['clienteNombre'], 'Cliente')} ha sido cancelada.`;
      }
      if (pattern.includes('reserva.creada') || pattern.includes('reserva')) {
        return `Nueva reserva registrada a nombre de ${this.texto(d['clienteNombre'], 'Cliente')} para el ${this.texto(d['fecha'])} a las ${this.texto(d['hora'])}.`;
      }
      return typeof data === 'object' ? JSON.stringify(data) : this.texto(data);
    } catch {
      return `Actualización de ${pattern} recibida.`;
    }
  }
}
