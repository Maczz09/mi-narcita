/* eslint-disable */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';

jest.mock('axios', () => ({
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@org/resiliencia', async () => {
  const actual = await jest.importActual('@org/resiliencia');
  return {
    ...actual,
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { AppService } from './app.service';
import { CuentasHttpClient } from './cuentas-http.client';

function createMockPrismaService() {
  const mock = {
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
    $transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mock)),
    checkAndRecordIdempotencyKey: () => Promise.resolve(true),
    transaccion: {
      create: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    cuentaAbierta: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    turnoCaja: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    movimientoCaja: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  return mock;
}

describe('AppService — Caja', () => {
  let service: AppService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockTokenService: { generateServiceToken: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTokenService = { generateServiceToken: jest.fn().mockReturnValue('mock-service-token') };

    mockPrisma = createMockPrismaService();

    process.env['CUENTAS_SERVICE_URL'] = 'http://localhost:3005/api';

    // T-40: el cliente HTTP real con el token service mockeado, para que los
    // specs sigan espiando axios de extremo a extremo.
    service = new AppService(mockPrisma as never, new CuentasHttpClient(mockTokenService as never));
  });

  describe('registrarPago', () => {
    const turnoAbierto = {
      id: 'turno-001',
      cajaId: 'T01',
      cajaNombre: 'Terminal 01',
      usuarioId: 'u-001',
      cajeroNombre: 'Caja',
      fondoInicial: 300,
      estado: 'ABIERTA',
      abiertoAt: new Date(),
      cerradoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('debe registrar un pago y publicar evento', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      const transaccionCreada = {
        id: 't-001',
        cuentaId: 'c-001',
        turnoId: 'turno-001',
        mesaId: 'm-001',
        monto: 50,
        metodo: 'EFECTIVO',
        referencia: null,
        notas: null,
        createdAt: new Date(),
      };
      mockPrisma.transaccion.create.mockResolvedValue(transaccionCreada);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.registrarPago({
        cuentaId: 'c-001',
        montoRecibido: 50,
        metodo: 'EFECTIVO',
      });

      expect(result.transaccion).toBeDefined();
      expect(result.transaccion.monto).toBe(50);
      expect(mockPrisma.movimientoCaja.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'VENTA',
            turnoId: 'turno-001',
            transaccionId: 't-001',
          }),
        }),
      );
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routingKey: 'pago.registrado',
          })
        })
      );
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3005/api/c-001/cerrar',
        { descuento: 0 },
        expect.any(Object),
      );
    });

    it('debe consultar cuenta remota antes de abrir la transacción con lock', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });
      jest.mocked(axios.post).mockResolvedValue({ data: { ticket: { id: 'tk-001', total: 50 } } });
      mockPrisma.cuentaAbierta.upsert.mockResolvedValue({ cuentaId: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' });
      mockPrisma.cuentaAbierta.update.mockResolvedValue({});
      mockPrisma.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      mockPrisma.transaccion.create.mockResolvedValue({
        id: 't-001',
        cuentaId: 'c-001',
        turnoId: 'turno-001',
        mesaId: 'm-001',
        monto: 50,
        metodo: 'EFECTIVO',
        referencia: null,
        notas: null,
        createdAt: new Date(),
      });
      mockPrisma.movimientoCaja.create.mockResolvedValue({});
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.registrarPago({
        cuentaId: 'c-001',
        montoRecibido: 50,
        metodo: 'EFECTIVO',
      });

      expect(jest.mocked(axios.get).mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it('debe rechazar si el monto no cubre el total exacto de la cuenta', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);
      jest.mocked(axios.get).mockResolvedValue({ data: { id: 'c-001', mesaId: 'm-001', total: 50, estado: 'ABIERTA' } });

      await expect(
        service.registrarPago({ cuentaId: 'c-001', montoRecibido: 60, metodo: 'EFECTIVO' })
      ).rejects.toThrow('total exacto');
    });
  });

  describe('abrirTurno — T-25 carrera', () => {
    const turnoAbierto = {
      id: 'turno-001',
      cajaId: 'T01',
      cajaNombre: 'Terminal 01',
      usuarioId: 'u-001',
      cajeroNombre: 'Caja',
      fondoInicial: 300,
      estado: 'ABIERTA',
      abiertoAt: new Date(),
      cerradoAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('devuelve el turno existente si ya hay uno ABIERTA (sin crear)', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValue(turnoAbierto);

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001');

      expect(result.id).toBe('turno-001');
      expect(mockPrisma.turnoCaja.create).not.toHaveBeenCalled();
    });

    it('crea un turno nuevo cuando no hay ninguno abierto', async () => {
      mockPrisma.turnoCaja.findFirst.mockResolvedValueOnce(null);
      mockPrisma.turnoCaja.create.mockResolvedValue(turnoAbierto);
      mockPrisma.movimientoCaja.create.mockResolvedValue({});

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-001');

      expect(result.id).toBe('turno-001');
      expect(mockPrisma.turnoCaja.create).toHaveBeenCalled();
    });

    it('ante carrera (P2002 del índice único) devuelve el turno ganador', async () => {
      // 1ª lectura: no hay turno → intenta crear; el índice rechaza con P2002;
      // 2ª lectura: el turno del ganador ya está ABIERTA.
      mockPrisma.turnoCaja.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(turnoAbierto);
      mockPrisma.turnoCaja.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.abrirTurno({ fondoInicial: 300 } as any, 'u-002');

      expect(result.id).toBe('turno-001');
    });
  });

  describe('listarTransacciones', () => {
    it('debe retornar lista de transacciones', async () => {
      mockPrisma.transaccion.findMany.mockResolvedValue([
        { id: 't-001', cuentaId: 'c-001', monto: 50, metodo: 'EFECTIVO', referencia: null, notas: null, createdAt: new Date() },
        { id: 't-002', cuentaId: 'c-002', monto: 80, metodo: 'TARJETA', referencia: 'ref-1', notas: null, createdAt: new Date() },
      ]);

      const result = await service.listarTransacciones();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].monto).toBe(50);
      expect(result.data[1].monto).toBe(80);
    });
  });
});
