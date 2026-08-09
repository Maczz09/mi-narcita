import { Injectable, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { CuentaCerradaPayload, PedidoSnapshotItem } from '@org/contracts';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrarVenta(data: CuentaCerradaPayload) {
    this.logger.log({
      operation: 'registrarVenta',
      aggregateId: data.cuentaId,
      message: `Registrando venta para mesa ${data.mesaId} por total S/ ${data.total}.`,
    } satisfies OperableLog);

    await this.prisma.ventaDiaria.upsert({
      where: { cuentaId: data.cuentaId },
      create: {
        cuentaId: data.cuentaId,
        mesaId: data.mesaId,
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
      update: {
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
    });
  }

  /** Rango de fechas: usa desde/hasta si vienen, si no el día de hoy. */
  private rango(query?: { desde?: string; hasta?: string }): { gte: Date; lte: Date } {
    if (query?.desde || query?.hasta) {
      return {
        gte: query.desde ? new Date(query.desde) : new Date(0),
        lte: query.hasta ? new Date(query.hasta) : new Date(),
      };
    }
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return { gte: hoy, lte: new Date() };
  }

  /** Deriva el turno a partir de la hora de la venta (plan 6.3). */
  private turnoDe(fecha: Date): 'ALMUERZO' | 'CENA' | 'OTRO' {
    const h = fecha.getHours();
    if (h >= 12 && h < 17) return 'ALMUERZO';
    if (h >= 18) return 'CENA';
    return 'OTRO';
  }

  /** Reporte por producto en un rango: cantidad e ingresos, ordenado por ingresos. */
  async obtenerPorProducto(query?: { desde?: string; hasta?: string }) {
    const { gte, lte } = this.rango(query);
    const ventas = await this.prisma.ventaDiaria.findMany({ where: { fecha: { gte, lte } } });
    const stats = new Map<string, { nombre: string; cantidad: number; ingresos: number }>();
    for (const v of ventas) {
      if (!Array.isArray(v.items)) continue;
      for (const item of v.items as PedidoSnapshotItem[]) {
        const pid = item.productoId;
        if (!pid) continue;
        const cur = stats.get(pid) ?? { nombre: item.nombre ?? pid, cantidad: 0, ingresos: 0 };
        cur.cantidad += Number(item.cantidad ?? 0);
        cur.ingresos += Number(item.cantidad ?? 0) * Number(item.precioUnitario ?? 0);
        stats.set(pid, cur);
      }
    }
    return {
      desde: gte,
      hasta: lte,
      productos: Array.from(stats.entries())
        .map(([productoId, s]) => ({ productoId, ...s }))
        .sort((a, b) => b.ingresos - a.ingresos),
    };
  }

  /** Reporte por turno (ALMUERZO/CENA/OTRO) en un rango. */
  async obtenerPorTurno(query?: { desde?: string; hasta?: string }) {
    const { gte, lte } = this.rango(query);
    const ventas = await this.prisma.ventaDiaria.findMany({ where: { fecha: { gte, lte } } });
    const turnos = new Map<string, { totalVentas: number; ingresos: number }>();
    for (const v of ventas) {
      const t = this.turnoDe(new Date(v.fecha));
      const cur = turnos.get(t) ?? { totalVentas: 0, ingresos: 0 };
      cur.totalVentas += 1;
      cur.ingresos += Number(v.total);
      turnos.set(t, cur);
    }
    return {
      desde: gte,
      hasta: lte,
      turnos: Array.from(turnos.entries()).map(([turno, s]) => ({ turno, ...s })),
    };
  }

  /** Reporte por mesero en un rango (agrupa lo sin asignar aparte). */
  async obtenerPorMesero(query?: { desde?: string; hasta?: string }) {
    const { gte, lte } = this.rango(query);
    const ventas = await this.prisma.ventaDiaria.findMany({ where: { fecha: { gte, lte } } });
    const meseros = new Map<string, { meseroNombre: string; totalVentas: number; ingresos: number }>();
    for (const v of ventas) {
      const key = v.meseroId ?? '(sin asignar)';
      const cur = meseros.get(key) ?? {
        meseroNombre: v.meseroNombre ?? '(sin asignar)',
        totalVentas: 0,
        ingresos: 0,
      };
      cur.totalVentas += 1;
      cur.ingresos += Number(v.total);
      meseros.set(key, cur);
    }
    return {
      desde: gte,
      hasta: lte,
      meseros: Array.from(meseros.entries())
        .map(([meseroId, s]) => ({ meseroId, ...s }))
        .sort((a, b) => b.ingresos - a.ingresos),
    };
  }

  async obtenerResumenDiario(query?: { desde?: string; hasta?: string }) {
    const { gte, lte } = this.rango(query);

    const ventas = await this.prisma.ventaDiaria.findMany({
      where: {
        fecha: { gte, lte },
      },
    });

    const totalIngresos = ventas.reduce((acc, v) => acc + Number(v.total), 0);

    // 1. Agrupar Ventas por Hora reales del día
    const horasMap = new Map<string, number>();
    // Inicializar horas comunes de almuerzo y cena
    for (let h = 12; h <= 22; h++) {
      horasMap.set(`${String(h).padStart(2, '0')}:00`, 0);
    }
    
    for (const v of ventas) {
      const fechaVenta = new Date(v.fecha);
      const hora = fechaVenta.getHours();
      const horaKey = `${String(hora).padStart(2, '0')}:00`;
      
      horasMap.set(horaKey, (horasMap.get(horaKey) || 0) + Number(v.total));
    }

    const ventasPorHora = Array.from(horasMap.entries()).map(([hora, total]) => ({
      hora,
      total,
    }));

    // 2. Generar Ranking de Productos determinista según ventas reales del día
    const productStats = new Map<string, { nombre: string; cantidad: number; ingresos: number }>();

    for (const v of ventas) {
      if (Array.isArray(v.items)) {
        for (const item of v.items as PedidoSnapshotItem[]) {
          const pid = item.productoId;
          if (!pid) continue;
          const current = productStats.get(pid) || { nombre: item.nombre || pid, cantidad: 0, ingresos: 0 };
          current.cantidad += Number(item.cantidad || 0);
          current.ingresos += Number(item.cantidad || 0) * Number(item.precioUnitario || 0);
          productStats.set(pid, current);
        }
      }
    }

    const topProductos = Array.from(productStats.entries())
      .map(([productoId, stats]) => ({
        productoId,
        nombre: stats.nombre,
        cantidad: stats.cantidad,
        ingresos: stats.ingresos,
      }))
      .filter(p => p.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    return {
      fecha: gte,
      hasta: lte,
      totalVentas: ventas.length,
      ingresosTotales: totalIngresos,
      ventasPorHora,
      topProductos,
    };
  }

}
