// @ts-nocheck
import { describe, expect, it, beforeEach } from '@jest/globals';
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppService — Reportes', () => {
  const prisma = {
    ventaDiaria: {
      upsert: jest.fn() as any,
      findMany: jest.fn() as any,
    },
  };

  let service: AppService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppService(prisma as unknown as PrismaService);
  });

  it('registra ventas con upsert idempotente por cuenta', async () => {
    await service.registrarVenta({
      cuentaId: 'cuenta-1',
      mesaId: 'mesa-1',
      total: 50,
      items: [{ productoId: 'prod-1', nombre: 'Nachos', cantidad: 2, precioUnitario: 25 }],
    });

    expect(prisma.ventaDiaria.upsert).toHaveBeenCalledWith({
      where: { cuentaId: 'cuenta-1' },
      create: expect.objectContaining({
        cuentaId: 'cuenta-1',
        mesaId: 'mesa-1',
        total: 50,
        items: [{ productoId: 'prod-1', nombre: 'Nachos', cantidad: 2, precioUnitario: 25 }],
      }) as unknown,
      update: expect.objectContaining({
        total: 50,
      }) as unknown,
    });
  });

  it('resume ingresos, horas y top productos del dia', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-02T15:00:00.000Z'));
    prisma.ventaDiaria.findMany.mockResolvedValue([
      {
        total: 80,
        fecha: new Date('2026-01-02T18:10:00.000Z'),
        items: [
          { productoId: 'prod-1', nombre: 'Nachos', cantidad: 2, precioUnitario: 20 },
          { productoId: 'prod-2', nombre: 'Limonada', cantidad: 1, precioUnitario: 40 },
        ],
      },
      {
        total: 20,
        fecha: new Date('2026-01-02T18:45:00.000Z'),
        items: [{ productoId: 'prod-1', nombre: 'Nachos', cantidad: 1, precioUnitario: 20 }],
      },
    ]);

    const resumen = await service.obtenerResumenDiario();

    const inicioDiaLocal = new Date('2026-01-02T15:00:00.000Z');
    inicioDiaLocal.setHours(0, 0, 0, 0);
    expect(prisma.ventaDiaria.findMany).toHaveBeenCalledWith({
      where: { fecha: { gte: inicioDiaLocal } },
    });
    expect(resumen.totalVentas).toBe(2);
    expect(resumen.ingresosTotales).toBe(100);
    expect(resumen.ventasPorHora.find((item) => item.hora === '13:00')).toEqual({
      hora: '13:00',
      total: 100,
    });
    expect(resumen.topProductos[0]).toEqual({
      productoId: 'prod-1',
      nombre: 'Nachos',
      cantidad: 3,
      ingresos: 60,
    });

    jest.useRealTimers();
  });

  describe('reportes ricos (plan 6.3)', () => {
    it('registra el mesero en la venta', async () => {
      await service.registrarVenta({
        cuentaId: 'c1', mesaId: 'm1', total: 30, items: [],
        meseroId: 'u-1', meseroNombre: 'Ana',
      });
      expect(prisma.ventaDiaria.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ meseroId: 'u-1', meseroNombre: 'Ana' }) as unknown,
        }) as unknown,
      );
    });

    it('por-producto agrega cantidad e ingresos y ordena por ingresos', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([
        { total: 100, fecha: new Date(), items: [
          { productoId: 'p1', nombre: 'Nachos', cantidad: 2, precioUnitario: 20 },
          { productoId: 'p2', nombre: 'Pizza', cantidad: 1, precioUnitario: 60 },
        ] },
        { total: 40, fecha: new Date(), items: [
          { productoId: 'p1', nombre: 'Nachos', cantidad: 2, precioUnitario: 20 },
        ] },
      ]);
      const r = await service.obtenerPorProducto({ desde: '2026-01-01', hasta: '2026-12-31' });
      expect(r.productos[0]).toEqual({ productoId: 'p1', nombre: 'Nachos', cantidad: 4, ingresos: 80 });
      expect(r.productos[1]).toEqual({ productoId: 'p2', nombre: 'Pizza', cantidad: 1, ingresos: 60 });
    });

    it('por-turno deriva ALMUERZO/CENA/OTRO de la hora', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([
        { total: 50, fecha: new Date('2026-01-02T13:00:00') },
        { total: 30, fecha: new Date('2026-01-02T14:00:00') },
        { total: 90, fecha: new Date('2026-01-02T20:00:00') },
        { total: 20, fecha: new Date('2026-01-02T09:00:00') }, // antes del almuerzo → OTRO
      ]);
      const r = await service.obtenerPorTurno({});
      const almuerzo = r.turnos.find((t) => t.turno === 'ALMUERZO');
      const cena = r.turnos.find((t) => t.turno === 'CENA');
      const otro = r.turnos.find((t) => t.turno === 'OTRO');
      expect(almuerzo).toEqual({ turno: 'ALMUERZO', totalVentas: 2, ingresos: 80 });
      expect(cena).toEqual({ turno: 'CENA', totalVentas: 1, ingresos: 90 });
      expect(otro).toEqual({ turno: 'OTRO', totalVentas: 1, ingresos: 20 });
    });

    it('por-mesero agrupa por meseroId y separa lo sin asignar', async () => {
      prisma.ventaDiaria.findMany.mockResolvedValue([
        { total: 100, fecha: new Date(), meseroId: 'u-1', meseroNombre: 'Ana' },
        { total: 50, fecha: new Date(), meseroId: 'u-1', meseroNombre: 'Ana' },
        { total: 70, fecha: new Date(), meseroId: null, meseroNombre: null },
      ]);
      const r = await service.obtenerPorMesero({});
      expect(r.meseros[0]).toEqual({ meseroId: 'u-1', meseroNombre: 'Ana', totalVentas: 2, ingresos: 150 });
      expect(r.meseros.find((m) => m.meseroId === '(sin asignar)')).toEqual({
        meseroId: '(sin asignar)', meseroNombre: '(sin asignar)', totalVentas: 1, ingresos: 70,
      });
    });
  });
});
