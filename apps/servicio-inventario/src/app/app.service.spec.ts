/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AppService } from './app.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PedidoEstado } from '@org/contracts';

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  const mock: Record<string, unknown> = {
    $connect: async () => {},
    $disconnect: async () => {},
    checkAndRecordIdempotencyKey: (_key: string) => Promise.resolve(true),
    producto: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    categoria: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn(),
    ...overrides,
  };
  mock.$transaction = jest.fn((cb: unknown) => Promise.resolve((cb as (arg: unknown) => unknown)(mock)));
  return mock as any;
}

function pedidoDto(id: string, items: Array<Record<string, unknown>>) {
  return {
    id,
    mesaId: 'mesa-1',
    total: 0,
    estado: PedidoEstado.Pendiente,
    createdAt: new Date().toISOString(),
    numeroMesa: 1,
    items: items.map((item, index) => ({
      id: `item-${index + 1}`,
      productoId: String(item['productoId']),
      nombre: String(item['nombre'] ?? item['productoId']),
      cantidad: Number(item['cantidad']),
      precioUnitario: Number(item['precioUnitario'] ?? 0),
      notas: typeof item['notas'] === 'string' ? item['notas'] : undefined,
    })),
  };
}

const productoBase = {
  id: 'prod-001',
  categoriaId: 'cat-001',
  categoria: { id: 'cat-001', nombre: 'Bebidas', descripcion: null },
  nombre: 'Cerveza',
  descripcion: null,
  precio: { toNumber: () => 8.5 },
  disponible: true,
  stockActual: 10,
};

describe('AppService — Inventario (comprehensive)', () => {
  let service: AppService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService();
    service = new AppService(mockPrisma);
  });

  // ─── getHello ─────────────────────────────────────────────────────────────

  describe('getHello', () => {
    it('devuelve mensaje y nombre de servicio', () => {
      const result = service.getHello();
      expect(result.message).toBe('Servicio de Inventario activo');
      expect(result.service).toBe('servicio-inventario');
    });
  });

  // ─── listarCategorias ─────────────────────────────────────────────────────

  describe('listarCategorias', () => {
    it('devuelve lista de categorías', async () => {
      mockPrisma.categoria.findMany.mockResolvedValue([
        { id: 'cat-1', nombre: 'Bebidas', descripcion: null },
        { id: 'cat-2', nombre: 'Cocina', descripcion: 'Platos calientes' },
      ]);
      const result = await service.listarCategorias();
      expect(result.categorias).toHaveLength(2);
      expect(result.categorias[0].nombre).toBe('Bebidas');
    });

    it('devuelve array vacío si no hay categorías', async () => {
      mockPrisma.categoria.findMany.mockResolvedValue([]);
      const result = await service.listarCategorias();
      expect(result.categorias).toEqual([]);
    });
  });

  // ─── crearCategoria ───────────────────────────────────────────────────────

  describe('crearCategoria', () => {
    it('crea y devuelve la categoría', async () => {
      mockPrisma.categoria.create.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', descripcion: 'desc' });
      const result = await service.crearCategoria({ nombre: 'Bebidas', descripcion: 'desc' });
      expect(result.message).toBe('Categoría creada exitosamente');
      expect(result.categoria.id).toBe('cat-1');
    });

    it('crea categoría sin descripción', async () => {
      mockPrisma.categoria.create.mockResolvedValue({ id: 'cat-2', nombre: 'Postres', descripcion: null });
      const result = await service.crearCategoria({ nombre: 'Postres' });
      expect(result.categoria.nombre).toBe('Postres');
    });
  });

  // ─── listarProductos ──────────────────────────────────────────────────────

  describe('listarProductos', () => {
    it('devuelve data y nextCursor cuando hay más productos', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([
        { ...productoBase, id: 'prod-001' },
        { ...productoBase, id: 'prod-002' },
        { ...productoBase, id: 'prod-003' },
      ]);
      const result = await service.listarProductos({ limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe('prod-002');
    });

    it('nextCursor es null cuando caben todos los resultados', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ ...productoBase, id: 'prod-001' }]);
      const result = await service.listarProductos({ limit: 10 });
      expect(result.nextCursor).toBeNull();
    });

    it('aplica filtro por categoría', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ categoriaId: 'cat-001' });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoriaId: 'cat-001' }) }),
      );
    });

    it('aplica filtro disponible=false', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ disponible: false });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ disponible: false }) }),
      );
    });

    it('aplica filtro conStock=true (stockActual not null)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ conStock: true });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stockActual: { not: null } }),
        }),
      );
    });

    it('aplica filtro conStock=false (stockActual null)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ conStock: false });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stockActual: null }),
        }),
      );
    });

    it('aplica búsqueda de texto', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ search: 'limon' });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nombre: { contains: 'limon', mode: 'insensitive' } },
              { descripcion: { contains: 'limon', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('limita el máximo a 100', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ limit: 500 });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );
    });

    it('sin parámetros usa defaults (limit 20)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos();
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 21 }),
      );
    });

    it('aplica cursor de paginación', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ cursor: 'prod-010' });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'prod-010' }, skip: 1 }),
      );
    });

    it('aplica filtro updatedSince', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      await service.listarProductos({ updatedSince: '2026-01-01T00:00:00.000Z' });
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
          }),
        }),
      );
    });
  });

  // ─── obtenerProducto ──────────────────────────────────────────────────────

  describe('obtenerProducto', () => {
    it('devuelve el producto si existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(productoBase);
      const result = await service.obtenerProducto('prod-001');
      expect(result.id).toBe('prod-001');
      expect(result.nombre).toBe('Cerveza');
    });

    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      await expect(service.obtenerProducto('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── obtenerProductosLote ─────────────────────────────────────────────────

  describe('obtenerProductosLote', () => {
    it('devuelve lista de productos por IDs', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([productoBase]);
      const result = await service.obtenerProductosLote(['prod-001']);
      expect(result.productos).toHaveLength(1);
      expect(result.productos[0].id).toBe('prod-001');
    });

    it('devuelve array vacío para IDs no encontrados', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      const result = await service.obtenerProductosLote(['no-existe']);
      expect(result.productos).toEqual([]);
    });
  });

  // ─── crearProducto ────────────────────────────────────────────────────────

  describe('crearProducto', () => {
    it('lanza NotFoundException si la categoría no existe', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue(null);
      await expect(
        service.crearProducto({ categoriaId: 'cat-no-existe', nombre: 'Prod', precio: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea el producto y emite evento en outbox', async () => {
      const categoria = { id: 'cat-001', nombre: 'Bebidas', descripcion: null };
      mockPrisma.categoria.findUnique.mockResolvedValue(categoria);
      const productoCreado = {
        id: 'prod-new',
        categoriaId: 'cat-001',
        nombre: 'Agua',
        descripcion: null,
        precio: { toNumber: () => 5 },
        disponible: true,
        stockActual: null,
      };
      mockPrisma.producto.create.mockResolvedValue(productoCreado);
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.crearProducto({
        categoriaId: 'cat-001',
        nombre: 'Agua',
        precio: 5,
      });

      expect(result.message).toBe('Producto creado exitosamente');
      expect(result.producto.id).toBe('prod-new');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ routingKey: 'producto.creado' }) }),
      );
    });

    it('establece disponible=true por defecto', async () => {
      const categoria = { id: 'cat-001', nombre: 'Bebidas', descripcion: null };
      mockPrisma.categoria.findUnique.mockResolvedValue(categoria);
      mockPrisma.producto.create.mockResolvedValue({
        ...productoBase,
        precio: { toNumber: () => 8.5 },
        categoria,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.crearProducto({ categoriaId: 'cat-001', nombre: 'Cerveza', precio: 8.5 });

      expect(mockPrisma.producto.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ disponible: true }),
        }),
      );
    });

    it('respeta disponible=false si se especifica', async () => {
      const categoria = { id: 'cat-001', nombre: 'Bebidas', descripcion: null };
      mockPrisma.categoria.findUnique.mockResolvedValue(categoria);
      mockPrisma.producto.create.mockResolvedValue({
        ...productoBase,
        disponible: false,
        precio: { toNumber: () => 8.5 },
        categoria,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.crearProducto({ categoriaId: 'cat-001', nombre: 'Cerveza', precio: 8.5, disponible: false });

      expect(mockPrisma.producto.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ disponible: false }),
        }),
      );
    });
  });

  // ─── actualizarProducto ───────────────────────────────────────────────────

  describe('actualizarProducto', () => {
    it('lanza NotFoundException si la categoría nueva no existe', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue(null);
      await expect(
        service.actualizarProducto('prod-001', { categoriaId: 'cat-no-existe' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      await expect(
        service.actualizarProducto('prod-no-existe', { nombre: 'Nuevo' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('actualiza el producto exitosamente', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, categoria: productoBase.categoria });
      const actualizado = { ...productoBase, nombre: 'Cerveza Premium', precio: { toNumber: () => 10 } };
      mockPrisma.producto.update.mockResolvedValue({ ...actualizado, categoria: productoBase.categoria });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.actualizarProducto('prod-001', { nombre: 'Cerveza Premium' });

      expect(result.message).toBe('Producto actualizado');
      expect(result.producto.nombre).toBe('Cerveza Premium');
    });

    it('actualiza sin verificar categoría si categoriaId no se proporciona', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, categoria: productoBase.categoria });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, precio: { toNumber: () => 9 }, categoria: productoBase.categoria });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.actualizarProducto('prod-001', { precio: 9 });
      expect(mockPrisma.categoria.findUnique).not.toHaveBeenCalled();
    });

    it('emite evento producto.actualizado en outbox', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, categoria: productoBase.categoria });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, precio: { toNumber: () => 8.5 }, categoria: productoBase.categoria });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.actualizarProducto('prod-001', { nombre: 'Test' });

      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ routingKey: 'producto.actualizado' }) }),
      );
    });
  });

  // ─── actualizarStock ──────────────────────────────────────────────────────

  describe('actualizarStock', () => {
    it('actualiza stock y emite evento', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 10 });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 15, precio: { toNumber: () => 8.5 } });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      const result = await service.actualizarStock('prod-001', 5);

      expect(result.message).toBe('Stock actualizado');
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('no baja de 0 (Math.max(0, …))', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 3 });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 0, disponible: false, precio: { toNumber: () => 8.5 } });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.actualizarStock('prod-001', -100);

      expect(mockPrisma.producto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stockActual: 0 }) }),
      );
    });

    it('marca como no disponible cuando llega a 0', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 5 });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 0, disponible: false, precio: { toNumber: () => 8.5 } });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.actualizarStock('prod-001', -5);

      expect(mockPrisma.producto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ disponible: false }) }),
      );
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      await expect(service.actualizarStock('no-existe', 5)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reducirStockAutomatico ───────────────────────────────────────────────

  describe('reducirStockAutomatico', () => {
    it('reduce stock y publica evento', async () => {
      mockPrisma.producto.findUnique
        .mockResolvedValueOnce({ ...productoBase, stockActual: 15 })
        .mockResolvedValueOnce({ id: 'prod-001', nombre: 'Cerveza', stockActual: 5, disponible: true });
      mockPrisma.producto.updateMany.mockResolvedValue({ count: 1 });

      await service.reducirStockAutomatico('prod-001', 10);

      expect(mockPrisma.producto.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'prod-001' }),
        data: expect.objectContaining({ stockActual: { decrement: 10 } }),
      });
    });

    it('no hace nada si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      await expect(service.reducirStockAutomatico('inexistente', 5)).resolves.not.toThrow();
      expect(mockPrisma.producto.updateMany).not.toHaveBeenCalled();
    });

    it('no reduce si stockActual es null (sin control de stock)', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: null });
      await service.reducirStockAutomatico('prod-001', 5);
      expect(mockPrisma.producto.updateMany).not.toHaveBeenCalled();
    });

    it('publica disponible=false cuando el stock llega a 0', async () => {
      mockPrisma.producto.findUnique
        .mockResolvedValueOnce({ ...productoBase, stockActual: 1 })
        .mockResolvedValueOnce({ id: 'prod-001', nombre: 'Cerveza', stockActual: 0, disponible: true });
      mockPrisma.producto.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.producto.update.mockResolvedValue({ id: 'prod-001', stockActual: 0, disponible: false });

      await service.reducirStockAutomatico('prod-001', 1);

      const payload = JSON.parse(mockPrisma.outboxEvent.create.mock.calls[0][0].data.payload);
      expect(payload.disponible).toBe(false);
      expect(payload.stockActual).toBe(0);
    });

    it('lanza BadRequestException si cantidad <= 0', async () => {
      await expect(service.reducirStockAutomatico('prod-001', 0)).rejects.toThrow(BadRequestException);
      await expect(service.reducirStockAutomatico('prod-001', -5)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── procesarPedidoCreado ─────────────────────────────────────────────────

  describe('procesarPedidoCreado', () => {
    it('ignora payload sin id', async () => {
      await service.procesarPedidoCreado({ id: '', mesaId: 'm-1', items: [], total: 0, estado: PedidoEstado.Pendiente, createdAt: '' } as any);
      expect(mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('ignora payload sin items array', async () => {
      await service.procesarPedidoCreado({ id: 'p-1', mesaId: 'm-1', items: null, total: 0, estado: PedidoEstado.Pendiente, createdAt: '' } as any);
      expect(mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('lanza error con marcador __QA_INVENTARIO_FORCE_DLQ__', async () => {
      await expect(
        service.procesarPedidoCreado(pedidoDto('pedido-force-dlq', [
          { productoId: 'prod-003', cantidad: 1, notas: '__QA_INVENTARIO_FORCE_DLQ__' },
        ])),
      ).rejects.toThrow('Fallo QA controlado');
      expect(mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('ignora redelivery con P2002 (idempotente)', async () => {
      const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockPrisma.idempotencyKey.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(duplicate);
      mockPrisma.producto.findUnique
        .mockResolvedValueOnce({ ...productoBase, stockActual: 10 })
        .mockResolvedValueOnce({ id: 'prod-001', stockActual: 7, disponible: true });
      mockPrisma.producto.updateMany.mockResolvedValue({ count: 1 });

      const pedido = pedidoDto('pedido-redelivery-1', [{ productoId: 'prod-001', cantidad: 3 }]);

      await service.procesarPedidoCreado(pedido);
      await service.procesarPedidoCreado(pedido);

      expect(mockPrisma.producto.updateMany).toHaveBeenCalledTimes(1);
    });

    it('relanza errores no-P2002', async () => {
      const err = new Error('DB down');
      (mockPrisma.$transaction as jest.Mock).mockRejectedValue(err);
      await expect(
        service.procesarPedidoCreado(pedidoDto('ped-err', [{ productoId: 'p-1', cantidad: 1 }])),
      ).rejects.toThrow('DB down');
    });

    it('emite StockInsuficiente cuando el descuento falla (count===0)', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 1 });
      mockPrisma.producto.updateMany.mockResolvedValue({ count: 0 });

      await service.procesarPedidoCreado(pedidoDto('ped-77', [{ productoId: 'prod-001', cantidad: 5 }]));

      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledTimes(1);
      const arg = mockPrisma.outboxEvent.create.mock.calls[0][0];
      expect(arg.data.routingKey).toBe('stock.insuficiente');
      expect(JSON.parse(arg.data.payload)).toMatchObject({
        pedidoId: 'ped-77',
        productoId: 'prod-001',
        solicitado: 5,
        disponible: 1,
      });
    });

    it('NO emite StockInsuficiente cuando el descuento tiene éxito', async () => {
      mockPrisma.producto.findUnique
        .mockResolvedValueOnce({ ...productoBase, stockActual: 10 })
        .mockResolvedValueOnce({ id: 'prod-001', stockActual: 5, disponible: true });
      mockPrisma.producto.updateMany.mockResolvedValue({ count: 1 });

      await service.procesarPedidoCreado(pedidoDto('ped-88', [{ productoId: 'prod-001', cantidad: 5 }]));

      const stockInsuf = mockPrisma.outboxEvent.create.mock.calls.find(
        (c: any) => c[0].data.routingKey === 'stock.insuficiente',
      );
      expect(stockInsuf).toBeUndefined();
    });

    it('omite ítems sin productoId o sin cantidad', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      // Item with productoId but no cantidad: should skip
      const pedido = {
        id: 'ped-skip',
        mesaId: 'mesa-1',
        total: 0,
        estado: PedidoEstado.Pendiente,
        createdAt: new Date().toISOString(),
        numeroMesa: 1,
        items: [
          { id: 'i1', productoId: '', cantidad: 5, nombre: 'X', precioUnitario: 10 },
          { id: 'i2', productoId: 'prod-1', cantidad: 0, nombre: 'Y', precioUnitario: 5 },
        ],
      };
      await service.procesarPedidoCreado(pedido);
      expect(mockPrisma.producto.updateMany).not.toHaveBeenCalled();
    });
  });
});
