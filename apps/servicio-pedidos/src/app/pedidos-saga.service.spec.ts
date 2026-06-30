/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PedidosSagaService } from './pedidos-saga.service';
import { PedidoEstado } from '@org/contracts';

// T-40: specs de transiciones de estado y compensación de saga, movidos junto a
// la clase extraída de AppService (antes vivían en app.service.spec.ts).

function createMockPrismaService(overrides: Record<string, any> = {}) {
  const prisma: any = {
    $connect: async () => {},
    $disconnect: async () => {},
    $executeRaw: jest.fn().mockResolvedValue(1),
    pedido: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    pedidoItem: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    ...overrides,
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
}

const basePedido = {
  id: 'p-001',
  mesaId: 'm-001',
  numeroMesa: 5,
  estado: PedidoEstado.Pendiente,
  total: 100,
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PedidosSagaService — Pedidos', () => {
  let service: PedidosSagaService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService();
    service = new PedidosSagaService(mockPrisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('actualizarEstado — guard de transiciones', () => {
    it('permite el avance comercial LISTO → ENTREGADO', async () => {
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({ ...basePedido, estado: PedidoEstado.Listo } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'updateMany').mockResolvedValue({ count: 1 } as never);

      await service.actualizarEstado('p-001', { estado: PedidoEstado.Entregado });

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'p-001', estado: PedidoEstado.Listo },
        data: { estado: PedidoEstado.Entregado },
      }));
    });

    it('rechaza una transición inválida (PAGADO → EN_PREPARACION)', async () => {
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({ ...basePedido, estado: PedidoEstado.Pagado } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'updateMany');

      await expect(
        service.actualizarEstado('p-001', { estado: PedidoEstado.EnPreparacion }),
      ).rejects.toThrow(/inválida/i);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('actualizarEstadoItem — cocina manda (derivación)', () => {
    const itemBase = { id: 'i-1', pedidoId: 'p-001', nombre: 'Plato', cantidad: 1, precioUnitario: 10, area: 'COCINA', notas: null };

    it('sube el pedido a EN_PREPARACION cuando arranca el primer ítem', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Pendiente,
        items: [
          { ...itemBase, id: 'i-1', estado: PedidoEstado.EnPreparacion },
          { ...itemBase, id: 'i-2', estado: PedidoEstado.Pendiente },
        ],
      } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, estado: PedidoEstado.EnPreparacion, items: [],
      } as never);

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.EnPreparacion });

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        data: { estado: PedidoEstado.EnPreparacion },
      }));
    });

    it('marca el pedido LISTO y emite pedido.listo cuando todos los ítems están listos', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-2', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.EnPreparacion,
        items: [
          { ...itemBase, id: 'i-1', estado: PedidoEstado.Listo },
          { ...itemBase, id: 'i-2', estado: PedidoEstado.Listo },
        ],
      } as never);
      jest.spyOn(mockPrisma.pedido, 'update').mockResolvedValue({
        ...basePedido, estado: PedidoEstado.Listo, items: [],
      } as never);

      await service.actualizarEstadoItem('i-2', { estado: PedidoEstado.Listo });

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      expect(eventos.some((e: any) => e.routingKey === 'pedido.listo')).toBe(true);
    });

    it('no pisa un estado comercial (ENTREGADO) al tocar un ítem', async () => {
      jest.spyOn(mockPrisma.pedidoItem, 'update').mockResolvedValue({ id: 'i-1', pedidoId: 'p-001' } as never);
      jest.spyOn(mockPrisma.pedido, 'findUnique').mockResolvedValue({
        ...basePedido,
        estado: PedidoEstado.Entregado,
        items: [{ ...itemBase, id: 'i-1', estado: PedidoEstado.Listo }],
      } as never);
      const updateSpy = jest.spyOn(mockPrisma.pedido, 'update');

      await service.actualizarEstadoItem('i-1', { estado: PedidoEstado.Listo });

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('procesarStockInsuficiente — compensación de saga', () => {
    const itemRechazado = (over: Record<string, any> = {}) => ({
      id: 'it-1', productoId: 'prod-a', nombre: 'A', cantidad: 1, precioUnitario: 10,
      area: 'COCINA', notas: null, estado: 'RECHAZADO_SIN_STOCK', ...over,
    });

    it('recalcula total y emite PedidoActualizado con total corregido si quedan ítems vivos', async () => {
      const pedidoActualizado = {
        id: 'ped-1', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.Pendiente,
        total: 20, createdAt: new Date(), updatedAt: new Date(),
        items: [
          itemRechazado(),
          itemRechazado({ id: 'it-2', productoId: 'prod-b', nombre: 'B', estado: 'PENDIENTE', precioUnitario: 20 }),
        ],
      };
      const prisma = createMockPrismaService({
        pedidoItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        pedido: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ped-1', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.Pendiente,
            total: 30, createdAt: new Date(), updatedAt: new Date(),
            items: [
              itemRechazado(),
              itemRechazado({ id: 'it-2', productoId: 'prod-b', nombre: 'B', estado: 'PENDIENTE', precioUnitario: 20 }),
            ],
          }),
          update: jest.fn().mockResolvedValue(pedidoActualizado),
        },
        outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        idempotencyKey: { create: jest.fn().mockResolvedValue({}) },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarStockInsuficiente({ pedidoId: 'ped-1', productoId: 'prod-a', solicitado: 5, disponible: 1 });

      expect(prisma.pedidoItem.updateMany).toHaveBeenCalledWith({
        where: { pedidoId: 'ped-1', productoId: 'prod-a', estado: { not: 'RECHAZADO_SIN_STOCK' } },
        data: { estado: 'RECHAZADO_SIN_STOCK' },
      });
      expect(prisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'ped-1' },
        data: { total: 20 },
      }));
      expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.outboxEvent.create.mock.calls[0][0].data.routingKey).toBe('pedido.actualizado');
      const payload = JSON.parse(prisma.outboxEvent.create.mock.calls[0][0].data.payload);
      expect(payload.pedido.total).toBe(20);
    });

    it('pasa el pedido entero a RECHAZADO_SIN_STOCK cuando todos los ítems quedan rechazados', async () => {
      const items = [itemRechazado()];
      const prisma = createMockPrismaService({
        pedidoItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        pedido: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ped-2', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.Pendiente,
            total: 10, createdAt: new Date(), items,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'ped-2', mesaId: 'm-1', numeroMesa: 3, estado: PedidoEstado.RechazadoSinStock,
            total: 0, createdAt: new Date(), updatedAt: new Date(), items,
          }),
        },
        outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        idempotencyKey: { create: jest.fn().mockResolvedValue({}) },
      });
      const svc = new PedidosSagaService(prisma as never);

      await svc.procesarStockInsuficiente({ pedidoId: 'ped-2', productoId: 'prod-a', solicitado: 5, disponible: 0 });

      expect(prisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'ped-2' },
        data: { estado: PedidoEstado.RechazadoSinStock, total: 0 },
      }));
      const payload = JSON.parse(prisma.outboxEvent.create.mock.calls[0][0].data.payload);
      expect(payload.pedido.total).toBe(0);
    });

    it('es idempotente: una clave duplicada (P2002) no propaga ni re-marca', async () => {
      const prisma = createMockPrismaService({
        idempotencyKey: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
        pedidoItem: { updateMany: jest.fn() },
        pedido: { findUnique: jest.fn(), update: jest.fn() },
        outboxEvent: { create: jest.fn() },
      });
      const svc = new PedidosSagaService(prisma as never);

      await expect(
        svc.procesarStockInsuficiente({ pedidoId: 'ped-3', productoId: 'prod-a', solicitado: 1, disponible: 0 }),
      ).resolves.toBeUndefined();
      expect(prisma.pedidoItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('hace early return y loguea si el pedido no se encuentra', async () => {
      const prisma = createMockPrismaService({
        pedidoItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        pedido: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      });
      const svc = new PedidosSagaService(prisma as never);
      
      await expect(
        svc.procesarStockInsuficiente({ pedidoId: 'ped-not-found', productoId: 'prod-a', solicitado: 1, disponible: 0 })
      ).resolves.toBeUndefined();
      expect(prisma.pedido.update).not.toHaveBeenCalled();
    });

    it('re-lanza cualquier error que no sea P2002', async () => {
      const errorMock = new Error('Database crash');
      (errorMock as any).code = 'P5000';
      const prisma = createMockPrismaService({
        idempotencyKey: { create: jest.fn().mockRejectedValue(errorMock) }
      });
      const svc = new PedidosSagaService(prisma as never);

      await expect(
        svc.procesarStockInsuficiente({ pedidoId: 'ped-crash', productoId: 'prod-a', solicitado: 1, disponible: 0 })
      ).rejects.toThrow('Database crash');
    });
  });
});
