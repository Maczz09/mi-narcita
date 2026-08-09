// @ts-nocheck
/* eslint-disable */

import axios from 'axios';

// Mocks de borde (igual que app.service.spec.ts): axios para la cuenta remota y
// el decorador de circuit-breaker como passthrough.
jest.mock('axios', () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  return {
    __esModule: true,
    default: { get: mockGet, post: mockPost },
    get: mockGet,
    post: mockPost,
  };
});

jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    CircuitBreakerOptions: () => (_t: any, _k: string, d: PropertyDescriptor) => d,
  };
});

import { AppService } from './app.service';
import { CuentasHttpClient } from './cuentas-http.client';

const baseTurno = {
  id: 'turno-001',
  cajaId: 'T01',
  cajaNombre: 'Terminal 01',
  usuarioId: 'u-001',
  cajeroNombre: 'Caja',
  fondoInicial: 300,
  estado: 'ABIERTA' as string,
  abiertoAt: new Date('2026-06-10T08:00:00Z'),
  cerradoAt: null as Date | null,
  createdAt: new Date('2026-06-10T08:00:00Z'),
  updatedAt: new Date('2026-06-10T08:00:00Z'),
};

function mov(overrides: Record<string, any> = {}) {
  return {
    id: 'mov-1',
    turnoId: 'turno-001',
    tipo: 'VENTA',
    cuentaId: null,
    transaccionId: null,
    mesaId: null,
    donde: 'Mesa 1',
    metodo: 'EFECTIVO',
    monto: 50,
    descuento: 0,
    propina: 0,
    motivo: null,
    createdAt: new Date('2026-06-10T09:00:00Z'),
    ...overrides,
  };
}

function createMockPrisma(overrides: Record<string, any> = {}): any {
  const prisma: any = {
    $connect: async () => {},
    $disconnect: async () => {},
    checkAndRecordIdempotencyKey: async () => true,
    turnoCaja: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    movimientoCaja: { create: jest.fn(), findMany: jest.fn() },
    arqueoCaja: { create: jest.fn() },
    cierreCaja: { create: jest.fn() },
    transaccion: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
    cuentaAbierta: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $executeRaw: jest.fn(),
    ...overrides,
  };
  prisma.$transaction = jest.fn<any>(async (cb: any) => cb(prisma));
  return prisma;
}

describe('AppService — Caja (turnos, movimientos, arqueo, cierre)', () => {
  let service: AppService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    process.env['CUENTAS_SERVICE_URL'] = 'http://localhost:3005/api';
    service = new AppService(
      prisma as any,
      new CuentasHttpClient({ generateServiceToken: jest.fn().mockReturnValue('tok') } as any),
    );
  });

  describe('obtenerTurnoActivo', () => {
    it('devuelve null cuando no hay turno abierto', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue(null);
      expect(await service.obtenerTurnoActivo()).toBeNull();
    });

    it('mapea el turno abierto cuando existe', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ ...baseTurno });
      const turno = await service.obtenerTurnoActivo();
      expect(turno?.id).toBe('turno-001');
      expect(turno?.estado).toBe('ABIERTA');
    });
  });

  describe('listarTurnos', () => {
    it('lista turnos sin filtro (todos los estados)', async () => {
      prisma.turnoCaja.findMany.mockResolvedValue([{ ...baseTurno, estado: 'CERRADA' }]);

      const result = await service.listarTurnos();

      expect(prisma.turnoCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: [{ abiertoAt: 'desc' }, { id: 'desc' }] }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].estado).toBe('CERRADA');
      expect(result.nextCursor).toBeNull();
    });

    it('filtra por estado', async () => {
      prisma.turnoCaja.findMany.mockResolvedValue([]);
      await service.listarTurnos({ estado: 'CERRADA' });
      expect(prisma.turnoCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'CERRADA' } }),
      );
    });

    it('filtra por rango de cerradoAt (desde/hasta)', async () => {
      prisma.turnoCaja.findMany.mockResolvedValue([]);
      await service.listarTurnos({ desde: '2026-06-01', hasta: '2026-06-30' });
      expect(prisma.turnoCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cerradoAt: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30') } },
        }),
      );
    });

    it('pagina con cursor y respeta el límite', async () => {
      const turnos = Array.from({ length: 3 }, (_, i) => ({ ...baseTurno, id: `t-${i}` }));
      prisma.turnoCaja.findMany.mockResolvedValue(turnos);

      const result = await service.listarTurnos({ limit: 2, cursor: 't-0' });

      expect(prisma.turnoCaja.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3, cursor: { id: 't-0' }, skip: 1 }),
      );
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe('t-1');
    });
  });

  describe('obtenerResumenTurnoActivo', () => {
    it('devuelve un resumen vacío si no hay turno', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue(null);
      const resumen = await service.obtenerResumenTurnoActivo();
      expect(resumen.turno).toBeNull();
      expect(resumen.totalVentas).toBe(0);
      expect(resumen.porMetodo).toMatchObject({ EFECTIVO: 0, TARJETA: 0 });
    });

    it('delega en obtenerResumenTurno cuando hay turno', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ ...baseTurno });
      prisma.turnoCaja.findUnique.mockResolvedValue({
        ...baseTurno,
        movimientos: [mov({ tipo: 'VENTA', metodo: 'EFECTIVO', monto: 50 })],
        arqueos: [],
        cierre: null,
      });
      const resumen = await service.obtenerResumenTurnoActivo();
      expect(resumen.turno?.id).toBe('turno-001');
      expect(resumen.totalVentas).toBe(50);
    });
  });

  describe('obtenerResumenTurno', () => {
    it('lanza NotFound si el turno no existe', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue(null);
      await expect(service.obtenerResumenTurno('x')).rejects.toThrow('no encontrado');
    });

    it('agrega ventas, ingresos, egresos, propinas y efectivo esperado', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({
        ...baseTurno,
        movimientos: [
          mov({ tipo: 'APERTURA', metodo: 'EFECTIVO', monto: 300, donde: 'Fondo inicial' }),
          mov({ tipo: 'VENTA', metodo: 'EFECTIVO', monto: 50, propina: 5 }),
          mov({ tipo: 'VENTA', metodo: 'TARJETA', monto: 80 }),
          mov({ tipo: 'INGRESO', metodo: 'EFECTIVO', monto: 20 }),
          mov({ tipo: 'EGRESO', metodo: 'EFECTIVO', monto: -10 }),
        ],
        arqueos: [],
        cierre: null,
      });

      const resumen = await service.obtenerResumenTurno('turno-001');

      expect(resumen.totalVentas).toBe(130); // 50 + 80
      expect(resumen.totalIngresos).toBe(20);
      expect(resumen.totalEgresos).toBe(-10);
      expect(resumen.propinas).toBe(5);
      expect(resumen.porMetodo.EFECTIVO).toBe(50);
      expect(resumen.porMetodo.TARJETA).toBe(80);
      expect(resumen.comprobantes).toBe(2);
      // Efectivo esperado: aperturas/ventas/ingresos/egresos EFECTIVO + propinas EFECTIVO
      expect(resumen.efectivoEsperado).toBe(365); // 300 + 50 + 5 + 20 - 10
    });
  });

  describe('listarMovimientosTurno', () => {
    it('mapea los movimientos del turno', async () => {
      prisma.movimientoCaja.findMany.mockResolvedValue([mov({ id: 'm-1' }), mov({ id: 'm-2', tipo: 'EGRESO', monto: -10 })]);
      const res = await service.listarMovimientosTurno('turno-001');
      expect(res.data).toHaveLength(2);
      expect(res.data[1].monto).toBe(-10);
    });
  });

  describe('crearMovimiento', () => {
    it('lanza NotFound si el turno no existe', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue(null);
      await expect(service.crearMovimiento('x', { tipo: 'INGRESO', monto: 10, donde: 'caja' } as any)).rejects.toThrow('no encontrado');
    });

    it('rechaza movimientos sobre un turno cerrado', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({ ...baseTurno, estado: 'CERRADA' });
      await expect(service.crearMovimiento('turno-001', { tipo: 'INGRESO', monto: 10, donde: 'caja' } as any)).rejects.toThrow('cerrado');
    });

    it('un EGRESO se persiste con monto negativo', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({ ...baseTurno });
      prisma.movimientoCaja.create.mockResolvedValue(mov({ tipo: 'EGRESO', monto: -25 }));
      const res = await service.crearMovimiento('turno-001', { tipo: 'EGRESO', monto: 25, donde: 'compra' } as any);
      expect(res.monto).toBe(-25);
      expect(prisma.movimientoCaja.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'EGRESO' }) }),
      );
    });

    it('un INGRESO se persiste con monto positivo', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({ ...baseTurno });
      prisma.movimientoCaja.create.mockResolvedValue(mov({ tipo: 'INGRESO', monto: 40 }));
      const res = await service.crearMovimiento('turno-001', { tipo: 'INGRESO', monto: 40, donde: 'extra' } as any);
      expect(res.monto).toBe(40);
    });
  });

  describe('registrarArqueo', () => {
    it('lanza NotFound si el turno no existe', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue(null);
      await expect(service.registrarArqueo('x', { denominaciones: {} } as any)).rejects.toThrow('no encontrado');
    });

    it('calcula la diferencia entre lo contado y lo esperado', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({
        ...baseTurno,
        movimientos: [mov({ tipo: 'APERTURA', metodo: 'EFECTIVO', monto: 100 })],
      });
      prisma.arqueoCaja.create.mockImplementation(async ({ data }: any) => ({
        id: 'arq-1', createdAt: new Date('2026-06-10T10:00:00Z'), ...data,
      }));

      const arqueo = await service.registrarArqueo('turno-001', { denominaciones: { '100': 1, '20': 1 } } as any, 'u-001');

      expect(arqueo.efectivoEsperado).toBe(100);
      expect(arqueo.efectivoContado).toBe(120);
      expect(arqueo.diferencia).toBe(20);
    });
  });

  describe('cerrarTurno', () => {
    it('lanza NotFound si el turno no existe', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue(null);
      await expect(service.cerrarTurno('x', { denominaciones: {} } as any)).rejects.toThrow('no encontrado');
    });

    it('rechaza cerrar un turno ya cerrado', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({ ...baseTurno, estado: 'CERRADA', movimientos: [], arqueos: [], cierre: null });
      await expect(service.cerrarTurno('turno-001', { denominaciones: {} } as any)).rejects.toThrow('ya está cerrado');
    });

    it('cierra el turno, genera arqueo y cierre con la diferencia', async () => {
      prisma.turnoCaja.findUnique.mockResolvedValue({
        ...baseTurno,
        movimientos: [mov({ tipo: 'APERTURA', metodo: 'EFECTIVO', monto: 200 })],
        arqueos: [],
        cierre: null,
      });
      prisma.arqueoCaja.create.mockImplementation(async ({ data }: any) => ({ id: 'arq-1', createdAt: new Date('2026-06-10T10:00:00Z'), ...data }));
      prisma.cierreCaja.create.mockImplementation(async ({ data }: any) => ({ id: 'cie-1', createdAt: new Date('2026-06-10T10:00:00Z'), ...data }));
      prisma.turnoCaja.update.mockResolvedValue({ ...baseTurno, estado: 'CERRADA', cerradoAt: new Date('2026-06-10T10:00:00Z') });

      const res = await service.cerrarTurno('turno-001', { denominaciones: { '200': 1 } } as any, 'u-001');

      expect(res.turno.estado).toBe('CERRADA');
      expect(res.cierre.montoEsperado).toBe(200);
      expect(res.cierre.montoReal).toBe(200);
      expect(res.cierre.diferencia).toBe(0);
      expect(prisma.turnoCaja.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'CERRADA' }) }),
      );
    });
  });

  describe('registrarPago — caminos de error', () => {
    it('rechaza si no hay turno de caja abierto', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue(null);
      await expect(
        service.registrarPago({ cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' } as any),
      ).rejects.toThrow('No hay turno de caja abierto');
    });

    it('traduce un 404 de la cuenta remota a NotFound', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ ...baseTurno });
      jest.mocked(axios.get).mockRejectedValue({ response: { status: 404 } });
      await expect(
        service.registrarPago({ cuentaId: 'c-404', montoRecibido: 50, metodo: 'EFECTIVO' } as any),
      ).rejects.toThrow('no encontrada');
    });

    it('traduce un fallo de red en ServiceUnavailable', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ ...baseTurno });
      jest.mocked(axios.get).mockRejectedValue({ code: 'ECONNREFUSED' });
      await expect(
        service.registrarPago({ cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' } as any),
      ).rejects.toThrow('No se pudo obtener la cuenta');
    });

    it('rechaza un segundo pago sobre una cuenta que ya pagó (idempotencia de negocio)', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ ...baseTurno });
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      prisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      prisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 50 } });

      await expect(
        service.registrarPago({ cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' } as any),
      ).rejects.toThrow('ya tiene un pago registrado');
    });

    it('rechaza el pago si la cuenta ya no está ABIERTA', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ ...baseTurno });
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'CERRADA' } });
      prisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'CERRADA' });

      await expect(
        service.registrarPago({ cuentaId: 'c-001', montoRecibido: 50, metodo: 'EFECTIVO' } as any),
      ).rejects.toThrow('ya está cerrada');
    });
  });
});
