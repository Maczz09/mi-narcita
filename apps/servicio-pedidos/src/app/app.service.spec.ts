/* eslint-disable */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';

// T-33: neutralizar el breaker en los specs del servicio (igual que en caja);
// el comportamiento del breaker se prueba aparte en http-clients.breaker.spec.ts.
jest.mock('@org/resiliencia', async () => {
  const actual = await jest.importActual('@org/resiliencia');
  return {
    ...actual,
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { AppService } from './app.service';
import { MesasHttpClient } from './mesas-http.client';
import { InventarioHttpClient } from './inventario-http.client';
import { PedidosSagaService } from './pedidos-saga.service';
import { PedidoEstado } from '@org/contracts';

function createMockPrismaService(overrides: Record<string, any> = {}): any {
  const mock: any = {
    $connect: async () => {},
    $disconnect: async () => {},
    checkAndRecordIdempotencyKey: async (_key: string) => true,
    ...overrides,
  };
  return mock;
}

function createMockPublisher() {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    generateServiceToken: jest.fn().mockReturnValue('service-token'),
  };
}

// T-33: los clientes HTTP reales con el token service mockeado, para que los
// specs sigan espiando axios de extremo a extremo.
function createService(prisma: any, tokenService: any) {
  return new AppService(
    prisma,
    new MesasHttpClient(tokenService),
    new InventarioHttpClient(tokenService),
    new PedidosSagaService(prisma),
  );
}

describe('AppService — Pedidos', () => {
  let service: AppService;
  let mockPrisma: any;
  let mockPublisher: ReturnType<typeof createMockPublisher>;

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

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService({
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ stockActual: 1 }]),
      pedido: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      pedidoItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      productoLocal: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      mesaLocal: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      idempotencyKey: {
        create: jest.fn().mockResolvedValue({}),
      },
      outboxEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(mockPrisma)),
    });
    mockPublisher = createMockPublisher();

    service = createService(mockPrisma as never, mockPublisher as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validarMesa', () => {
    it('usa la proyección local cuando la mesa ya está sincronizada', async () => {
      const mesaLocal = { id: 'mesa-1', numero: 1, updatedAt: new Date() };
      mockPrisma.mesaLocal.findUnique.mockResolvedValue(mesaLocal);
      const getSpy = jest.spyOn(axios, 'get');

      await expect((service as any).validarMesa('mesa-1')).resolves.toBe(mesaLocal);
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('sincroniza la mesa desde servicio-mesas cuando falta en pedidos', async () => {
      const mesaLocal = { id: 'mesa-1', numero: 1, updatedAt: new Date() };
      mockPrisma.mesaLocal.findUnique.mockResolvedValue(null);
      mockPrisma.mesaLocal.upsert.mockResolvedValue(mesaLocal);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { id: 'mesa-1', numero: 1 } });

      await expect((service as any).validarMesa('mesa-1')).resolves.toBe(mesaLocal);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/mesas/mesa-1'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer service-token' },
        }),
      );
      expect(mockPrisma.mesaLocal.upsert).toHaveBeenCalledWith({
        where: { id: 'mesa-1' },
        create: { id: 'mesa-1', numero: 1 },
        update: { numero: 1 },
      });
    });
  });

  describe('procesarPagoRecibido', () => {
    it('marca en lote los pedidos cobrables de la mesa como PAGADO', async () => {
      mockPrisma.pedido.updateMany.mockResolvedValue({ count: 2 });

      await service.procesarPagoRecibido({
        cuentaId: 'cuenta-1',
        mesaId: 'mesa-1',
        monto: 100,
        metodoPago: 'EFECTIVO'
      });

      expect(mockPrisma.pedido.updateMany).toHaveBeenCalledWith({
        where: {
          mesaId: 'mesa-1',
          estado: {
            notIn: [
              PedidoEstado.Pagado,
              PedidoEstado.Cancelado,
              PedidoEstado.RechazadoSinStock,
            ],
          },
        },
        data: { estado: PedidoEstado.Pagado },
      });
      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.pedido.update).not.toHaveBeenCalled();
    });

    it('es idempotente por convergencia en reentrega', async () => {
      mockPrisma.pedido.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.procesarPagoRecibido({ cuentaId: 'c-001', mesaId: 'm-1', monto: 100, metodoPago: 'EFECTIVO' });
      await expect(service.procesarPagoRecibido({ cuentaId: 'c-001', mesaId: 'm-empty', monto: 100, metodoPago: 'EFECTIVO' })).resolves.not.toThrow();
      expect(mockPrisma.pedido.updateMany).toHaveBeenCalledTimes(2);
    });

    it('es idempotente si atrapa error P2002 de base de datos', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.procesarPagoRecibido({ cuentaId: 'c-1', mesaId: 'm-1', monto: 1, metodoPago: 'EF' })).resolves.toBeUndefined();
    });

    it('re-lanza error si no es P2002', async () => {
      const err = new Error('test db crash');
      (err as any).code = 'P500';
      mockPrisma.$transaction.mockRejectedValueOnce(err);
      await expect(service.procesarPagoRecibido({ cuentaId: 'c-1', mesaId: 'm-1', monto: 1, metodoPago: 'EF' })).rejects.toThrow('test db crash');
    });
  });

  // T-40: los specs de transiciones y derivación viven ahora en
  // pedidos-saga.service.spec.ts, junto a la clase extraída.

  describe('listarPedidos', () => {
    it('debe listar solo pedidos activos por mesa', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([]);

      await service.listarPedidos({ mesaId: 'mesa-1' });

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          mesaId: 'mesa-1',
          estado: { notIn: [PedidoEstado.Pagado, PedidoEstado.Cancelado] },
        },
        take: 21,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }));
    });

    it('devuelve data y nextCursor cuando hay mas resultados', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([
        { ...basePedido, id: 'p-001' },
        { ...basePedido, id: 'p-002' },
        { ...basePedido, id: 'p-003' },
      ] as never);

      const result = await service.listarPedidos({ limit: 2 });

      expect(result.data.map((pedido) => pedido.id)).toEqual(['p-001', 'p-002']);
      expect(result.nextCursor).toBe('p-002');
      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 3,
      }));
    });

    it('aplica cursor, estado, updatedSince y tope maximo de limit', async () => {
      jest.spyOn(mockPrisma.pedido, 'findMany').mockResolvedValue([]);

      await service.listarPedidos({
        cursor: 'p-010',
        estado: PedidoEstado.Listo,
        updatedSince: '2026-01-01T00:00:00.000Z',
        limit: 500,
      });

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          estado: PedidoEstado.Listo,
          updatedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
        },
        cursor: { id: 'p-010' },
        skip: 1,
        take: 101,
      }));
    });
  });

  describe('upsertProductoLocal', () => {
    it('no debe re-inflar stock local si producto.actualizado de consumo llega stale-alto', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.upsertProductoLocal({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 12,
        categoriaNombre: 'COCINA',
        disponible: true,
        allowStockIncrease: false,
      });

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 7 }),
      }));
    });

    it('debe permitir aumento de stock local cuando la actualizacion es reposicion', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.upsertProductoLocal({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 12,
        categoriaNombre: 'COCINA',
        disponible: true,
        allowStockIncrease: true,
        stockDelta: 5,
        stockSyncMode: 'REPOSICION',
      });

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 12 }),
      }));
    });
  });

  describe('persistirPedido', () => {
    it('no debe reservar stock local para productos sin control de stock', async () => {
      mockPrisma.pedido.create.mockResolvedValue({
        ...basePedido,
        items: [
          {
            id: 'item-1',
            pedidoId: 'p-001',
            productoId: 'prod-libre',
            nombre: 'Ceviche',
            cantidad: 2,
            precioUnitario: 25,
            area: 'COCINA',
            notas: null,
            estado: PedidoEstado.Pendiente,
            comensal: 1,
          },
        ],
      } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          {
            productoId: 'prod-libre',
            nombre: 'Ceviche',
            cantidad: 2,
            precioUnitario: 25,
            stockActual: null,
            area: 'COCINA',
            comensal: 1,
          },
        ],
        total: 50,
      });

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.pedido.create).toHaveBeenCalled();
    });

    it('persiste y expone el mesero en pedido, items y eventos', async () => {
      mockPrisma.pedido.create.mockResolvedValue({
        ...basePedido,
        meseroId: 'u-mesero-1',
        meseroNombre: 'Ana Mesa',
        items: [
          {
            id: 'item-1',
            pedidoId: 'p-001',
            productoId: 'prod-1',
            nombre: 'Nachos',
            cantidad: 1,
            precioUnitario: 25,
            area: 'COCINA',
            notas: null,
            estado: PedidoEstado.Pendiente,
            comensal: 1,
            meseroId: 'u-mesero-1',
            meseroNombre: 'Ana Mesa',
          },
        ],
      } as any);

      await (service as any).persistirPedido({
        mesaId: 'mesa-1',
        numeroMesa: 1,
        items: [
          {
            productoId: 'prod-1',
            nombre: 'Nachos',
            cantidad: 1,
            precioUnitario: 25,
            stockActual: null,
            area: 'COCINA',
            comensal: 1,
          },
        ],
        total: 25,
        modalidad: 'MESA',
        mesero: { id: 'u-mesero-1', nombre: 'Ana Mesa' },
      });

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          meseroId: 'u-mesero-1',
          meseroNombre: 'Ana Mesa',
          items: expect.objectContaining({
            create: [
              expect.objectContaining({
                meseroId: 'u-mesero-1',
                meseroNombre: 'Ana Mesa',
              }),
            ],
          }),
        }),
      }));

      const eventos = mockPrisma.outboxEvent.createMany.mock.calls.at(-1)[0].data;
      const pedidoCreado = eventos.find((e: any) => e.routingKey === 'pedido.creado');
      const payload = JSON.parse(pedidoCreado.payload);
      expect(payload.pedido).toEqual(expect.objectContaining({
        meseroId: 'u-mesero-1',
        meseroNombre: 'Ana Mesa',
      }));
      expect(payload.pedido.items[0]).toEqual(expect.objectContaining({
        meseroId: 'u-mesero-1',
        meseroNombre: 'Ana Mesa',
      }));
    });
  });

  describe('procesarProductoActualizado', () => {
    it('debe aplicar reposicion como delta una sola vez si hay redelivery secuencial', async () => {
      const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockPrisma.idempotencyKey.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(duplicate);
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      const payload = {
        eventId: 'evt-repo-1',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 20,
        stockDelta: 5,
        stockSyncMode: 'REPOSICION',
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any;

      await service.procesarProductoActualizado(payload);
      await service.procesarProductoActualizado(payload);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 12 }),
      }));
    });

    it('no debe inflar si un consumo stale-alto viene mal etiquetado como reposicion sin delta positivo', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 7,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.procesarProductoActualizado({
        eventId: 'evt-bad-label',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 20,
        stockDelta: -4,
        stockSyncMode: 'REPOSICION',
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 7 }),
      }));
    });

    it('no debe modificar stock local ante eco de consumo desde inventario', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 4,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.procesarProductoActualizado({
        eventId: 'evt-consumo',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 2,
        stockDelta: -1,
        stockSyncMode: 'CONSUMO_PEDIDO',
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 4 }),
      }));
    });
  });

  describe('procesarProductoCreado', () => {
    it('no debe re-inflar stock local si producto.creado llega tarde sobre una proyeccion existente', async () => {
      mockPrisma.productoLocal.findUnique.mockResolvedValue({
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 3,
        categoriaNombre: 'COCINA',
        disponible: true,
      });
      mockPrisma.productoLocal.upsert.mockResolvedValue({});

      await service.procesarProductoCreado({
        eventId: 'evt-created-late',
        id: 'prod-1',
        nombre: 'Nachos',
        precio: 10,
        stockActual: 20,
        categoriaNombre: 'COCINA',
        disponible: true,
      } as any);

      expect(mockPrisma.productoLocal.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ stockActual: 3 }),
      }));
    });
  });

  // T-40: los specs de procesarStockInsuficiente viven ahora en
  // pedidos-saga.service.spec.ts, junto a la clase extraída.
});
