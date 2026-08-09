// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */
import { AppService } from './app.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CuentaEstado, PedidoEstado } from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrismaService(): any {
  const mock = {
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
    $transaction: jest.fn<any>((cb: (m: unknown) => unknown) => cb(mock)),
    checkAndRecordIdempotencyKey: () => Promise.resolve(true),
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
    },
    cuenta: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  return mock;
}

const pedidoBase = {
  id: 'p-001',
  mesaId: 'm-001',
  numeroMesa: 1,
  estado: PedidoEstado.Pendiente,
  total: 50,
  items: [{ id: 'i-001', productoId: 'prod-1', precioUnitario: 25, cantidad: 2, nombre: 'Cerveza' }],
  createdAt: new Date().toISOString(),
};

const cuentaAbierta = {
  id: 'c-001',
  mesaId: 'm-001',
  estado: CuentaEstado.Abierta,
  total: 50,
  pedidos: [{ ...pedidoBase, items: [{ id: 'i-001', productoId: 'prod-1', precioUnitario: 25, cantidad: 2, nombre: 'Cerveza' }] }],
  ticket: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AppService — Cuentas (comprehensive)', () => {
  let service: AppService;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService();
    service = new AppService(mockPrisma as unknown as PrismaService);
  });

  // ─── listarCuentas ────────────────────────────────────────────────────────

  describe('listarCuentas', () => {
    it('devuelve array vacío cuando no hay cuentas', async () => {
      mockPrisma.cuenta.findMany.mockResolvedValue([] as any);
      const result = await service.listarCuentas();
      expect(result.cuentas).toEqual([]);
    });

    it('mapea correctamente cada cuenta a DTO', async () => {
      const now = new Date();
      mockPrisma.cuenta.findMany.mockResolvedValue([
        {
          id: 'c-001',
          mesaId: 'm-001',
          estado: CuentaEstado.Abierta,
          total: 100,
          pedidos: [],
          ticket: 'ticket-1',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'c-002',
          mesaId: 'm-002',
          estado: CuentaEstado.Cerrada,
          total: 200,
          pedidos: [],
          ticket: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.listarCuentas();

      expect(result.cuentas).toHaveLength(2);
      expect(result.cuentas[0].id).toBe('c-001');
      expect(result.cuentas[0].total).toBe(100);
      expect(result.cuentas[1].total).toBe(200);
    });

    it('parsea pedidos string JSON correctamente', async () => {
      const now = new Date();
      const pedidosJson = JSON.stringify([pedidoBase]);
      mockPrisma.cuenta.findMany.mockResolvedValue([
        {
          id: 'c-001',
          mesaId: 'm-001',
          estado: CuentaEstado.Abierta,
          total: 50,
          pedidos: pedidosJson,
          ticket: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.listarCuentas();
      expect(result.cuentas[0].pedidos).toHaveLength(1);
      expect(result.cuentas[0].pedidos[0].id).toBe('p-001');
    });
  });

  // ─── abrirCuenta ──────────────────────────────────────────────────────────

  describe('abrirCuenta', () => {
    it('debe crear una cuenta nueva si la mesa no tiene una abierta', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue(null);
      mockPrisma.cuenta.create.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        total: 0,
        pedidos: [],
        ticket: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.abrirCuenta({ mesaId: 'm-001' });

      expect(result.cuenta.id).toBe('c-001');
      expect(result.cuenta.estado).toBe(CuentaEstado.Abierta);
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });

    it('rechaza si la mesa ya tiene una cuenta abierta y origen es manual', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue({ id: 'c-existing', estado: CuentaEstado.Abierta });

      await expect(
        service.abrirCuenta({ mesaId: 'm-001' }, 'manual'),
      ).rejects.toThrow(BadRequestException);
    });

    it('no rechaza en fallback si la mesa ya tiene una cuenta abierta', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-existing',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        total: 0,
        pedidos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.abrirCuenta({ mesaId: 'm-001' }, 'fallback');
      expect(result.message).toBe('Cuenta abierta exitosamente');
      expect(result.cuenta.id).toBe('c-existing');
    });
  });

  // ─── obtenerCuenta ────────────────────────────────────────────────────────

  describe('obtenerCuenta', () => {
    it('devuelve la cuenta si existe', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      const result = await service.obtenerCuenta('c-001');
      expect(result.id).toBe('c-001');
    });

    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(null);
      await expect(service.obtenerCuenta('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── obtenerCuentaPorMesa ─────────────────────────────────────────────────

  describe('obtenerCuentaPorMesa', () => {
    it('devuelve la cuenta abierta de la mesa', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue({ id: 'c-001', mesaId: 'm-001', estado: CuentaEstado.Abierta });
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);

      const result = await service.obtenerCuentaPorMesa('m-001');
      expect(result.id).toBe('c-001');
    });

    it('lanza NotFoundException si no hay cuenta abierta para la mesa', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue(null);
      await expect(service.obtenerCuentaPorMesa('mesa-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── cerrarCuenta ─────────────────────────────────────────────────────────

  describe('cerrarCuenta', () => {
    it('cierra correctamente y emite outbox', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      mockPrisma.cuenta.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.outboxEvent.createMany.mockResolvedValue({ count: 2 });

      const result = await service.cerrarCuenta('c-001', {});
      expect(result.ticket.total).toBe(50);
      expect(mockPrisma.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    });

    it('aplica descuento correctamente', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      mockPrisma.cuenta.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.outboxEvent.createMany.mockResolvedValue({ count: 2 });

      const result = await service.cerrarCuenta('c-001', { descuento: 10 });
      expect(result.ticket.total).toBe(40);
      expect(result.ticket.descuento).toBe(10);
    });

    it('lanza NotFoundException si la cuenta no existe', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(null);
      await expect(service.cerrarCuenta('no-existe', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si la cuenta no está abierta', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue({ ...cuentaAbierta, estado: CuentaEstado.Cerrada });
      await expect(service.cerrarCuenta('c-001', {})).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si la cuenta no tiene pedidos', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue({ ...cuentaAbierta, pedidos: [] });
      await expect(service.cerrarCuenta('c-001', {})).rejects.toThrow('no tiene pedidos');
    });

    it('rechaza cierre concurrente (updateMany count 0)', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      mockPrisma.cuenta.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cerrarCuenta('c-001', {})).rejects.toThrow('ya fue cerrada');
      expect(mockPrisma.outboxEvent.createMany).not.toHaveBeenCalled();
    });

    it('propaga mesero del pedido al evento cuenta.cerrada', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue({
        ...cuentaAbierta,
        pedidos: [
          {
            ...pedidoBase,
            meseroId: 'u-mesero-1',
            meseroNombre: 'Ana Mesa',
            items: [{ id: 'i-001', productoId: 'prod-1', precioUnitario: 25, cantidad: 2, nombre: 'Cerveza' }],
          },
        ],
      });
      mockPrisma.cuenta.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.outboxEvent.createMany.mockResolvedValue({ count: 2 });

      await service.cerrarCuenta('c-001', {});

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data as { routingKey: string; payload: string }[];
      const cuentaCerrada = eventos.find((e) => e.routingKey === 'cuenta.cerrada');
      const payload = JSON.parse(cuentaCerrada!.payload);
      expect(payload.meseroId).toBe('u-mesero-1');
      expect(payload.meseroNombre).toBe('Ana Mesa');
    });

    it('el descuento no puede hacer el total negativo (mínimo 0)', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      mockPrisma.cuenta.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.outboxEvent.createMany.mockResolvedValue({ count: 2 });

      const result = await service.cerrarCuenta('c-001', { descuento: 999 });
      expect(result.ticket.total).toBe(0);
    });
  });

  // ─── dividirCuenta ────────────────────────────────────────────────────────

  describe('dividirCuenta', () => {
    const cuentaConPedidos = {
      id: 'c-001',
      estado: CuentaEstado.Abierta,
      mesaId: 'm-001',
      total: 150,
      pedidos: [
        {
          id: 'p-1',
          mesaId: 'm-001',
          estado: PedidoEstado.Entregado,
          total: 150,
          items: [
            { id: 'i-001', productoId: 'prod-1', precioUnitario: 50, cantidad: 1, nombre: 'A', comensal: 1 },
            { id: 'i-002', productoId: 'prod-2', precioUnitario: 100, cantidad: 1, nombre: 'B', comensal: 2 },
          ],
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      jest.spyOn(service, 'obtenerCuenta').mockResolvedValue(cuentaConPedidos as any);
    });

    it('divide en partes iguales (IGUALES)', async () => {
      const result = await service.dividirCuenta('c-001', { metodo: 'IGUALES', numPartes: 3 });
      expect(result.metodo).toBe('IGUALES');
      expect(result.partes).toHaveLength(3);
      if (result.metodo === 'IGUALES') {
        expect(result.partes[0].monto).toBe(50);
      }
    });

    it('divide con numPartes=1 por defecto si no se especifica', async () => {
      const result = await service.dividirCuenta('c-001', { metodo: 'IGUALES' });
      expect(result.metodo).toBe('IGUALES');
      expect(result.partes).toHaveLength(1);
    });

    it('divide por comensales (POR_ITEMS)', async () => {
      const result = await service.dividirCuenta('c-001', { metodo: 'POR_ITEMS' });
      expect(result.metodo).toBe('POR_ITEMS');
      if (result.metodo === 'POR_ITEMS') {
        expect(result.partes).toHaveLength(2);
        const comensal1 = result.partes.find((p) => p.comensal === 1);
        const comensal2 = result.partes.find((p) => p.comensal === 2);
        expect(comensal1?.monto).toBe(50);
        expect(comensal2?.monto).toBe(100);
      }
    });

    it('POR_ITEMS usa identificadorComensal como fallback', async () => {
      jest.spyOn(service, 'obtenerCuenta').mockResolvedValue({
        ...cuentaConPedidos,
        pedidos: [
          {
            id: 'p-1',
            mesaId: 'm-001',
            estado: PedidoEstado.Entregado,
            total: 50,
            items: [{ id: 'i-001', productoId: 'prod-1', precioUnitario: 25, cantidad: 2, nombre: 'A', identificadorComensal: 3 }],
            createdAt: new Date().toISOString(),
          },
        ],
      } as any);

      const result = await service.dividirCuenta('c-001', { metodo: 'POR_ITEMS' });
      if (result.metodo === 'POR_ITEMS') {
        expect(result.partes[0].comensal).toBe(3);
      }
    });

    it('lanza BadRequestException si no hay pedidos', async () => {
      jest.spyOn(service, 'obtenerCuenta').mockResolvedValue({
        ...cuentaConPedidos,
        pedidos: [],
      } as any);

      await expect(service.dividirCuenta('c-001', { metodo: 'IGUALES' })).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException para método no soportado', async () => {
      await expect(
        service.dividirCuenta('c-001', { metodo: 'OTRO' as any }),
      ).rejects.toThrow('no soportado');
    });
  });

  // ─── procesarPedidoCreado ─────────────────────────────────────────────────

  describe('procesarPedidoCreado', () => {
    it('ignora payload sin mesaId', async () => {
      await service.procesarPedidoCreado({ pedido: null as any });
      expect(mockPrisma.cuenta.findFirst).not.toHaveBeenCalled();
    });

    it('ignora payload sin id', async () => {
      await service.procesarPedidoCreado({ pedido: { mesaId: 'm-1' } as any });
      expect(mockPrisma.cuenta.findFirst).not.toHaveBeenCalled();
    });

    it('consolida pedido en cuenta existente', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [],
        total: 0,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});
      mockPrisma.cuenta.update.mockResolvedValue({});

      await service.procesarPedidoCreado({ pedido: pedidoBase });

      expect(mockPrisma.cuenta.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-001' },
          data: expect.objectContaining({ pedidos: [pedidoBase] }),
        }),
      );
    });

    it('crea cuenta (fallback inline) cuando no existe una cuenta abierta', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue(null);
      mockPrisma.cuenta.create.mockResolvedValue({
        id: 'c-new',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [],
        total: 0,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});
      mockPrisma.cuenta.update.mockResolvedValue({});

      await service.procesarPedidoCreado({ pedido: pedidoBase });

      expect(mockPrisma.cuenta.create).toHaveBeenCalled();
      expect(mockPrisma.cuenta.update).toHaveBeenCalled();
    });

    it('ignora (idempotente) si el pedido ya está en la cuenta', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [pedidoBase],
        total: 50,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.procesarPedidoCreado({ pedido: pedidoBase });
      expect(mockPrisma.cuenta.update).not.toHaveBeenCalled();
    });

    it('trata P2002 como idempotente y no lanza', async () => {
      const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockPrisma.$transaction.mockRejectedValue(p2002);

      await expect(service.procesarPedidoCreado({ pedido: pedidoBase })).resolves.not.toThrow();
    });

    it('relanza errores no-P2002', async () => {
      const err = new Error('Unexpected DB error');
      mockPrisma.$transaction.mockRejectedValue(err);

      await expect(service.procesarPedidoCreado({ pedido: pedidoBase })).rejects.toThrow('Unexpected DB error');
    });

    it('excluye pedidos CANCELADO del total calculado', async () => {
      const pedidoCancelado = { ...pedidoBase, id: 'p-cancel', estado: PedidoEstado.Cancelado };
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [],
        total: 0,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});
      mockPrisma.cuenta.update.mockResolvedValue({});

      await service.procesarPedidoCreado({ pedido: pedidoCancelado });

      const data = mockPrisma.cuenta.update.mock.calls[0][0].data as any;
      expect(data.total.toNumber()).toBe(0);
    });
  });

  // ─── procesarPedidoActualizado ────────────────────────────────────────────

  describe('procesarPedidoActualizado', () => {
    it('ignora payload sin mesaId', async () => {
      await service.procesarPedidoActualizado({ pedido: {} as any });
      expect(mockPrisma.cuenta.findFirst).not.toHaveBeenCalled();
    });

    it('ignora si la cuenta abierta no existe', async () => {
      mockPrisma.cuenta.findFirst.mockResolvedValue(null);
      await service.procesarPedidoActualizado({ pedido: pedidoBase });
      expect(mockPrisma.cuenta.update).not.toHaveBeenCalled();
    });

    it('actualiza snapshot del pedido existente', async () => {
      const pedidoActualizado = { ...pedidoBase, total: 75 };
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [pedidoBase],
        total: 50,
      });
      mockPrisma.cuenta.update.mockResolvedValue({});

      await service.procesarPedidoActualizado({ pedido: pedidoActualizado });

      expect(mockPrisma.cuenta.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pedidos: [pedidoActualizado] }),
        }),
      );
    });

    it('agrega pedido al snapshot si no existía', async () => {
      const nuevoPedido = { ...pedidoBase, id: 'p-nuevo', total: 30 };
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [],
        total: 0,
      });
      mockPrisma.cuenta.update.mockResolvedValue({});

      await service.procesarPedidoActualizado({ pedido: nuevoPedido });

      const data = mockPrisma.cuenta.update.mock.calls[0][0].data as any;
      expect(data.pedidos).toHaveLength(1);
    });

    it('excluye pedidos RECHAZADO_SIN_STOCK del total', async () => {
      const pedidoRechazado = { ...pedidoBase, estado: PedidoEstado.RechazadoSinStock, total: 50 };
      mockPrisma.cuenta.findFirst.mockResolvedValue({
        id: 'c-001',
        mesaId: 'm-001',
        estado: CuentaEstado.Abierta,
        pedidos: [pedidoBase],
        total: 50,
      });
      mockPrisma.cuenta.update.mockResolvedValue({});

      await service.procesarPedidoActualizado({ pedido: pedidoRechazado });

      const data = mockPrisma.cuenta.update.mock.calls[0][0].data as any;
      expect(data.total.toNumber()).toBe(0);
    });

    it('trata P2002 como idempotente', async () => {
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrisma.$transaction.mockRejectedValue(p2002);

      await expect(service.procesarPedidoActualizado({ pedido: pedidoBase })).resolves.not.toThrow();
    });

    it('relanza errores no-P2002', async () => {
      const err = new Error('DB crash');
      mockPrisma.$transaction.mockRejectedValue(err);

      await expect(service.procesarPedidoActualizado({ pedido: pedidoBase })).rejects.toThrow('DB crash');
    });
  });

  // ─── procesarPagoRegistrado ───────────────────────────────────────────────

  describe('procesarPagoRegistrado', () => {
    const payload = {
      transaccionId: 'tx-001',
      cuentaId: 'c-001',
      mesaId: 'm-001',
      monto: 50,
      metodo: 'EFECTIVO' as const,
      pendiente: 0,
    };

    it('ignora si la cuenta no existe en la BD', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(null);
      await service.procesarPagoRegistrado(payload);
      // No throws, no cerrarCuenta called
      expect(mockPrisma.cuenta.findUnique).toHaveBeenCalled();
    });

    it('ignora si la cuenta ya está cerrada', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue({
        ...cuentaAbierta,
        estado: CuentaEstado.Cerrada,
      });
      const cerrarSpy = jest.spyOn(service, 'cerrarCuenta');
      await service.procesarPagoRegistrado(payload);
      expect(cerrarSpy).not.toHaveBeenCalled();
    });

    it('cierra la cuenta automáticamente cuando está abierta', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      const cerrarSpy = jest.spyOn(service, 'cerrarCuenta').mockResolvedValue({ message: 'ok', ticket: {} as any });

      await service.procesarPagoRegistrado(payload);

      expect(cerrarSpy).toHaveBeenCalledWith('c-001', {});
    });

    it('T-16: no cierra la cuenta si el pago fue parcial (pendiente > 0)', async () => {
      mockPrisma.cuenta.findUnique.mockResolvedValue(cuentaAbierta);
      const cerrarSpy = jest.spyOn(service, 'cerrarCuenta');

      await service.procesarPagoRegistrado({ ...payload, pendiente: 27 });

      expect(cerrarSpy).not.toHaveBeenCalled();
    });
  });
});
