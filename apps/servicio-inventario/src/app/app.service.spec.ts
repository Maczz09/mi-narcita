// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unused-vars */
import { AppService } from './app.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PedidoEstado } from '@org/contracts';

function createMockPrismaService(overrides: Record<string, unknown> = {}): any {
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
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    menuDiario: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    merma: {
      findMany: jest.fn(),
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
  mock.$transaction = jest.fn<any>((cb: unknown) => Promise.resolve((cb as (arg: unknown) => unknown)(mock)));
  return mock;
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

const SEDE = 'sede-001';

const productoBase = {
  id: 'prod-001',
  categoriaId: 'cat-001',
  sedeId: SEDE,
  categoria: { id: 'cat-001', nombre: 'Bebidas', descripcion: null, sedeId: SEDE },
  nombre: 'Cerveza',
  descripcion: null,
  precio: { toNumber: () => 8.5 },
  disponible: true,
  stockActual: 10,
};

describe('AppService — Inventario (comprehensive)', () => {
  let service: AppService;
  let mockPrisma: any;

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
      const result = await service.listarCategorias(SEDE);
      expect(result.categorias).toHaveLength(2);
      expect(result.categorias[0].nombre).toBe('Bebidas');
    });

    it('devuelve array vacío si no hay categorías', async () => {
      mockPrisma.categoria.findMany.mockResolvedValue([] as any);
      const result = await service.listarCategorias(SEDE);
      expect(result.categorias).toEqual([]);
    });

    it('T-23: un admin general sin sede fija debe indicar cuál usar', async () => {
      await expect(service.listarCategorias(null)).rejects.toThrow('Indica la sede');
    });
  });

  // ─── crearCategoria ───────────────────────────────────────────────────────

  describe('crearCategoria', () => {
    it('crea y devuelve la categoría', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.create.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', descripcion: 'desc' });
      const result = await service.crearCategoria({ nombre: 'Bebidas', descripcion: 'desc' }, SEDE);
      expect(result.message).toBe('Categoría creada exitosamente');
      expect(result.categoria.id).toBe('cat-1');
    });

    it('crea categoría sin descripción', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.create.mockResolvedValue({ id: 'cat-2', nombre: 'Postres', descripcion: null });
      const result = await service.crearCategoria({ nombre: 'Postres' }, SEDE);
      expect(result.categoria.nombre).toBe('Postres');
    });

    it('recorta espacios del nombre antes de guardar y validar', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.create.mockResolvedValue({ id: 'cat-3', nombre: 'Entradas', descripcion: null });
      await service.crearCategoria({ nombre: '  Entradas  ' }, SEDE);
      expect(mockPrisma.categoria.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE, nombre: { equals: 'Entradas', mode: 'insensitive' } }) }),
      );
      expect(mockPrisma.categoria.create).toHaveBeenCalledWith({ data: { nombre: 'Entradas', sedeId: SEDE, descripcion: undefined } });
    });

    it('rechaza con 409 si ya existe una categoría con el mismo nombre (case-insensitive)', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas' });
      await expect(service.crearCategoria({ nombre: 'bebidas' }, SEDE)).rejects.toThrow('Ya existe una categoría llamada "Bebidas"');
      expect(mockPrisma.categoria.create).not.toHaveBeenCalled();
    });

    it('traduce P2002 (carrera entre requests concurrentes) al mismo 409', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.crearCategoria({ nombre: 'Bebidas' }, SEDE)).rejects.toThrow('Ya existe una categoría llamada "Bebidas"');
    });

    it('crea una subcategoría cuando el parentId es una categoría principal', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-bebidas', nombre: 'Bebidas', parentId: null, sedeId: SEDE });
      mockPrisma.categoria.create.mockResolvedValue({ id: 'cat-calientes', nombre: 'Calientes', parentId: 'cat-bebidas' });

      const result = await service.crearCategoria({ nombre: 'Calientes', parentId: 'cat-bebidas' }, SEDE);

      expect(result.categoria.parentId).toBe('cat-bebidas');
      expect(mockPrisma.categoria.create).toHaveBeenCalledWith({ data: { nombre: 'Calientes', sedeId: SEDE, descripcion: undefined, parentId: 'cat-bebidas' } });
    });

    it('rechaza si el parentId no corresponde a ninguna categoría', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.findUnique.mockResolvedValue(null);
      await expect(service.crearCategoria({ nombre: 'Calientes', parentId: 'inexistente' }, SEDE)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.categoria.create).not.toHaveBeenCalled();
    });

    it('rechaza si el parentId pertenece a otra sede', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-bebidas', nombre: 'Bebidas', parentId: null, sedeId: 'otra-sede' });
      await expect(service.crearCategoria({ nombre: 'Calientes', parentId: 'cat-bebidas' }, SEDE)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.categoria.create).not.toHaveBeenCalled();
    });

    it('rechaza anidar una subcategoría bajo otra subcategoría (un solo nivel)', async () => {
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-calientes', nombre: 'Calientes', parentId: 'cat-bebidas', sedeId: SEDE });
      await expect(service.crearCategoria({ nombre: 'Muy calientes', parentId: 'cat-calientes' }, SEDE)).rejects.toThrow(
        'No se permite anidar más de un nivel de subcategorías.',
      );
      expect(mockPrisma.categoria.create).not.toHaveBeenCalled();
    });
  });

  describe('actualizarCategoria', () => {
    it('actualiza nombre y descripción', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', descripcion: null });
      mockPrisma.categoria.findFirst.mockResolvedValue(null);
      mockPrisma.categoria.update.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas Calientes', descripcion: 'Café, té' });

      const result = await service.actualizarCategoria('cat-1', { nombre: 'Bebidas Calientes', descripcion: 'Café, té' });

      expect(result.categoria.nombre).toBe('Bebidas Calientes');
      expect(mockPrisma.categoria.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: 'cat-1' } }) }),
      );
    });

    it('permite guardar sin cambiar el nombre (no dispara el check de unicidad)', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', descripcion: null });
      mockPrisma.categoria.update.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', descripcion: 'Nueva desc' });

      await service.actualizarCategoria('cat-1', { descripcion: 'Nueva desc' });

      expect(mockPrisma.categoria.findFirst).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si la categoría no existe', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue(null);
      await expect(service.actualizarCategoria('inexistente', { nombre: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('rechaza con 409 al renombrar a un nombre ya usado por otra categoría', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', descripcion: null });
      mockPrisma.categoria.findFirst.mockResolvedValue({ id: 'cat-2', nombre: 'Postres' });
      await expect(service.actualizarCategoria('cat-1', { nombre: 'Postres' })).rejects.toThrow('Ya existe una categoría llamada "Postres"');
    });

    it('asigna parentId a una categoría sin subcategorías propias', async () => {
      mockPrisma.categoria.findUnique
        .mockResolvedValueOnce({ id: 'cat-calientes', nombre: 'Calientes', _count: { subcategorias: 0 } })
        .mockResolvedValueOnce({ id: 'cat-bebidas', nombre: 'Bebidas', parentId: null });
      mockPrisma.categoria.update.mockResolvedValue({ id: 'cat-calientes', nombre: 'Calientes', parentId: 'cat-bebidas' });

      const result = await service.actualizarCategoria('cat-calientes', { parentId: 'cat-bebidas' });

      expect(result.categoria.parentId).toBe('cat-bebidas');
    });

    it('rechaza convertir en subcategoría si ya tiene subcategorías propias', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-bebidas', nombre: 'Bebidas', _count: { subcategorias: 2 } });
      await expect(service.actualizarCategoria('cat-bebidas', { parentId: 'cat-cocina' })).rejects.toThrow(
        'ya tiene sus propias subcategorías',
      );
      expect(mockPrisma.categoria.update).not.toHaveBeenCalled();
    });

    it('rechaza que una categoría sea su propia categoría padre', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', _count: { subcategorias: 0 } });
      await expect(service.actualizarCategoria('cat-1', { parentId: 'cat-1' })).rejects.toThrow(
        'Una categoría no puede ser su propia categoría padre.',
      );
    });

    it('rechaza parentId que apunta a una subcategoría (un solo nivel)', async () => {
      mockPrisma.categoria.findUnique
        .mockResolvedValueOnce({ id: 'cat-postres', nombre: 'Postres', _count: { subcategorias: 0 } })
        .mockResolvedValueOnce({ id: 'cat-calientes', nombre: 'Calientes', parentId: 'cat-bebidas' });
      await expect(service.actualizarCategoria('cat-postres', { parentId: 'cat-calientes' })).rejects.toThrow(
        'No se permite anidar más de un nivel de subcategorías.',
      );
    });
  });

  describe('eliminarCategoria', () => {
    it('elimina una categoría sin productos asociados', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', _count: { productos: 0 } });
      mockPrisma.categoria.delete.mockResolvedValue({});

      const result = await service.eliminarCategoria('cat-1');

      expect(result.message).toBe('Categoría eliminada');
      expect(mockPrisma.categoria.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('rechaza con 409 si la categoría tiene productos asociados', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas', _count: { productos: 3, subcategorias: 0 } });
      await expect(service.eliminarCategoria('cat-1')).rejects.toThrow('3 producto(s)');
      expect(mockPrisma.categoria.delete).not.toHaveBeenCalled();
    });

    it('rechaza con 409 si la categoría tiene subcategorías asociadas', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-bebidas', nombre: 'Bebidas', _count: { productos: 0, subcategorias: 2 } });
      await expect(service.eliminarCategoria('cat-bebidas')).rejects.toThrow('2 subcategoría(s)');
      expect(mockPrisma.categoria.delete).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si la categoría no existe', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue(null);
      await expect(service.eliminarCategoria('inexistente')).rejects.toThrow(NotFoundException);
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
      const result = await service.listarProductos({ limit: 2 }, SEDE);
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe('prod-002');
    });

    it('nextCursor es null cuando caben todos los resultados', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([{ ...productoBase, id: 'prod-001' }]);
      const result = await service.listarProductos({ limit: 10 }, SEDE);
      expect(result.nextCursor).toBeNull();
    });

    it('aplica filtro por categoría', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ categoriaId: 'cat-001' }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE, categoriaId: 'cat-001' }) }),
      );
    });

    it('aplica filtro disponible=false', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ disponible: false }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ disponible: false }) }),
      );
    });

    it('aplica filtro conStock=true (stockActual not null)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ conStock: true }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stockActual: { not: null } }),
        }),
      );
    });

    it('aplica filtro conStock=false (stockActual null)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ conStock: false }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stockActual: null }),
        }),
      );
    });

    it('aplica búsqueda de texto', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ search: 'limon' }, SEDE);
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
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ limit: 500 }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );
    });

    it('sin parámetros usa defaults (limit 20)', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({}, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 21 }),
      );
    });

    it('aplica cursor de paginación', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ cursor: 'prod-010' }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'prod-010' }, skip: 1 }),
      );
    });

    it('aplica filtro updatedSince', async () => {
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      await service.listarProductos({ updatedSince: '2026-01-01T00:00:00.000Z' }, SEDE);
      expect(mockPrisma.producto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('T-23: un admin general sin sede fija debe indicar cuál usar', async () => {
      await expect(service.listarProductos({}, null)).rejects.toThrow('Indica la sede');
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
      mockPrisma.producto.findMany.mockResolvedValue([] as any);
      const result = await service.obtenerProductosLote(['no-existe']);
      expect(result.productos).toEqual([]);
    });
  });

  // ─── crearProducto ────────────────────────────────────────────────────────

  describe('crearProducto', () => {
    it('lanza NotFoundException si la categoría no existe', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue(null);
      await expect(
        service.crearProducto({ categoriaId: 'cat-no-existe', nombre: 'Prod', precio: 10 }, SEDE),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si la categoría pertenece a otra sede', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-001', nombre: 'Bebidas', sedeId: 'otra-sede' });
      await expect(
        service.crearProducto({ categoriaId: 'cat-001', nombre: 'Prod', precio: 10 }, SEDE),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea el producto y emite evento en outbox', async () => {
      const categoria = { id: 'cat-001', nombre: 'Bebidas', descripcion: null, sedeId: SEDE };
      mockPrisma.categoria.findUnique.mockResolvedValue(categoria);
      const productoCreado = {
        id: 'prod-new',
        categoriaId: 'cat-001',
        sedeId: SEDE,
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
      }, SEDE);

      expect(result.message).toBe('Producto creado exitosamente');
      expect(result.producto.id).toBe('prod-new');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ routingKey: 'producto.creado' }) }),
      );
    });

    it('establece disponible=true por defecto', async () => {
      const categoria = { id: 'cat-001', nombre: 'Bebidas', descripcion: null, sedeId: SEDE };
      mockPrisma.categoria.findUnique.mockResolvedValue(categoria);
      mockPrisma.producto.create.mockResolvedValue({
        ...productoBase,
        precio: { toNumber: () => 8.5 },
        categoria,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.crearProducto({ categoriaId: 'cat-001', nombre: 'Cerveza', precio: 8.5 }, SEDE);

      expect(mockPrisma.producto.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ disponible: true }),
        }),
      );
    });

    it('respeta disponible=false si se especifica', async () => {
      const categoria = { id: 'cat-001', nombre: 'Bebidas', descripcion: null, sedeId: SEDE };
      mockPrisma.categoria.findUnique.mockResolvedValue(categoria);
      mockPrisma.producto.create.mockResolvedValue({
        ...productoBase,
        disponible: false,
        precio: { toNumber: () => 8.5 },
        categoria,
      });
      mockPrisma.outboxEvent.create.mockResolvedValue({});

      await service.crearProducto({ categoriaId: 'cat-001', nombre: 'Cerveza', precio: 8.5, disponible: false }, SEDE);

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
      (mockPrisma.$transaction as any).mockRejectedValue(err);
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

  // ─── procesarCompraRecibida (Compras → Inventario) ─────────────────────────

  describe('procesarCompraRecibida', () => {
    function compraDto(recepcionId: string, lineas: Array<Record<string, unknown>>) {
      return {
        recepcionId,
        ordenId: 'oc-1',
        sedeId: SEDE,
        lineas: lineas.map((l) => ({
          insumoId: String(l['insumoId'] ?? 'i-1'),
          insumoNombre: String(l['insumoNombre'] ?? 'Pisco Quebranta'),
          productoId: (l['productoId'] as string | null | undefined) ?? null,
          cantidadRecibida: Number(l['cantidadRecibida'] ?? 1),
          cantidadStockVenta: Number(l['cantidadStockVenta'] ?? 1),
        })),
      };
    }

    it('ignora payload sin recepcionId', async () => {
      await service.procesarCompraRecibida({ ordenId: 'oc-1', sedeId: SEDE, lineas: [] } as any);
      expect(mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('ignora payload sin lineas array', async () => {
      await service.procesarCompraRecibida({ recepcionId: 'rc-1', ordenId: 'oc-1', sedeId: SEDE, lineas: null } as any);
      expect(mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('incrementa stockActual y emite ProductoActualizado con stockSyncMode REPOSICION', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 5, disponible: true });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 17, disponible: true });

      await service.procesarCompraRecibida(compraDto('rc-1', [{ productoId: 'prod-001', cantidadStockVenta: 12 }]));

      expect(mockPrisma.producto.update).toHaveBeenCalledWith({
        where: { id: 'prod-001' },
        data: { stockActual: 17, disponible: true },
      });
      const arg = mockPrisma.outboxEvent.create.mock.calls[0][0];
      expect(arg.data.routingKey).toBe('producto.actualizado');
      expect(JSON.parse(arg.data.payload)).toMatchObject({
        id: 'prod-001',
        stockActual: 17,
        stockSyncMode: 'REPOSICION',
        stockDelta: 12,
      });
    });

    it('reactiva disponible cuando el producto estaba en stock 0 y desactivado', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 0, disponible: false });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 6, disponible: true });

      await service.procesarCompraRecibida(compraDto('rc-2', [{ productoId: 'prod-001', cantidadStockVenta: 6 }]));

      expect(mockPrisma.producto.update).toHaveBeenCalledWith({
        where: { id: 'prod-001' },
        data: { stockActual: 6, disponible: true },
      });
    });

    it('ignora líneas sin productoId (insumo crudo que no se revende)', async () => {
      await service.procesarCompraRecibida(compraDto('rc-3', [{ productoId: null, cantidadStockVenta: 10 }]));
      expect(mockPrisma.producto.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.producto.update).not.toHaveBeenCalled();
    });

    it('ignora un producto que pertenece a otra sede', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, sedeId: 'otra-sede', stockActual: 5 });
      await service.procesarCompraRecibida(compraDto('rc-4', [{ productoId: 'prod-001', cantidadStockVenta: 6 }]));
      expect(mockPrisma.producto.update).not.toHaveBeenCalled();
    });

    it('ignora un producto sin control de stock (stockActual null)', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: null });
      await service.procesarCompraRecibida(compraDto('rc-5', [{ productoId: 'prod-001', cantidadStockVenta: 6 }]));
      expect(mockPrisma.producto.update).not.toHaveBeenCalled();
    });

    it('el segundo evento con el mismo recepcionId no vuelve a sumar (P2002, idempotente)', async () => {
      const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockPrisma.idempotencyKey.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(duplicate);
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 5, disponible: true });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 17 });

      const payload = compraDto('rc-repetido', [{ productoId: 'prod-001', cantidadStockVenta: 12 }]);
      await service.procesarCompraRecibida(payload);
      await service.procesarCompraRecibida(payload);

      expect(mockPrisma.producto.update).toHaveBeenCalledTimes(1);
    });

    it('relanza errores no-P2002', async () => {
      const err = new Error('DB down');
      (mockPrisma.$transaction as any).mockRejectedValue(err);
      await expect(
        service.procesarCompraRecibida(compraDto('rc-err', [{ productoId: 'prod-001', cantidadStockVenta: 1 }])),
      ).rejects.toThrow('DB down');
    });
  });

  // ─── Menú del día (T-20) ────────────────────────────────────────────────

  describe('listarMenuDelDia', () => {
    it('lista los ítems del menú de una fecha (por defecto hoy)', async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      mockPrisma.menuDiario.findMany.mockResolvedValue([
        { id: 'md-1', fecha: new Date(hoy), productoId: 'prod-001', disponible: true, producto: productoBase },
      ]);

      const result = await service.listarMenuDelDia(undefined, SEDE);

      expect(mockPrisma.menuDiario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { fecha: new Date(hoy), producto: { sedeId: SEDE } } }),
      );
      expect(result.menu).toHaveLength(1);
      expect(result.menu[0].fecha).toBe(hoy);
      expect(result.menu[0].producto?.nombre).toBe('Cerveza');
    });

    it('acepta una fecha explícita', async () => {
      mockPrisma.menuDiario.findMany.mockResolvedValue([]);
      await service.listarMenuDelDia('2026-08-01', SEDE);
      expect(mockPrisma.menuDiario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { fecha: new Date('2026-08-01'), producto: { sedeId: SEDE } } }),
      );
    });

    it('T-23: un admin general sin sede fija debe indicar cuál usar', async () => {
      await expect(service.listarMenuDelDia(undefined, null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('agregarAlMenu', () => {
    it('rechaza si no viene productoId ni producto', async () => {
      await expect(service.agregarAlMenu({}, SEDE)).rejects.toThrow('Se requiere productoId');
    });

    it('rechaza si vienen productoId Y producto a la vez', async () => {
      await expect(
        service.agregarAlMenu({ productoId: 'prod-001', producto: { categoriaId: 'c1', nombre: 'X', precio: 1 } }, SEDE),
      ).rejects.toThrow('Indica solo uno');
    });

    it('rechaza un productoId que no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      await expect(service.agregarAlMenu({ productoId: 'no-existe' }, SEDE)).rejects.toThrow('no encontrado');
    });

    it('rechaza un productoId de otra sede', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, sedeId: 'otra-sede' });
      await expect(service.agregarAlMenu({ productoId: 'prod-001' }, SEDE)).rejects.toThrow('no encontrado');
    });

    it('agrega un plato existente al menú de hoy (upsert reactiva si ya estuvo)', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(productoBase);
      mockPrisma.menuDiario.upsert.mockResolvedValue({
        id: 'md-1', fecha: new Date(), productoId: 'prod-001', disponible: true, producto: productoBase,
      });

      const result = await service.agregarAlMenu({ productoId: 'prod-001' }, SEDE);

      expect(mockPrisma.menuDiario.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fecha_productoId: { fecha: new Date(service['hoyISO']()), productoId: 'prod-001' } },
          create: { fecha: new Date(service['hoyISO']()), productoId: 'prod-001', disponible: true },
          update: { disponible: true },
        }),
      );
      expect(result.item.productoId).toBe('prod-001');
    });

    it('crea un plato nuevo y lo agrega al menú del día', async () => {
      mockPrisma.categoria.findUnique.mockResolvedValue({ id: 'cat-001', nombre: 'Bebidas', sedeId: SEDE });
      mockPrisma.producto.create.mockResolvedValue({ ...productoBase, id: 'prod-nuevo' });
      mockPrisma.menuDiario.upsert.mockResolvedValue({
        id: 'md-2', fecha: new Date(), productoId: 'prod-nuevo', disponible: true, producto: { ...productoBase, id: 'prod-nuevo' },
      });

      const result = await service.agregarAlMenu({
        producto: { categoriaId: 'cat-001', nombre: 'Especial del día', precio: 25 },
      }, SEDE);

      expect(mockPrisma.producto.create).toHaveBeenCalled();
      expect(mockPrisma.menuDiario.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ productoId: 'prod-nuevo' }) }),
      );
      expect(result.item.productoId).toBe('prod-nuevo');
    });
  });

  describe('actualizarMenuDiario', () => {
    it('rechaza si el ítem no existe', async () => {
      mockPrisma.menuDiario.findUnique.mockResolvedValue(null);
      await expect(service.actualizarMenuDiario('no-existe', { disponible: false })).rejects.toThrow('no encontrado');
    });

    it('activa/desactiva un plato del menú (se acabó el plato)', async () => {
      mockPrisma.menuDiario.findUnique.mockResolvedValue({ id: 'md-1' });
      mockPrisma.menuDiario.update.mockResolvedValue({
        id: 'md-1', fecha: new Date(), productoId: 'prod-001', disponible: false, producto: productoBase,
      });

      const result = await service.actualizarMenuDiario('md-1', { disponible: false });

      expect(mockPrisma.menuDiario.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'md-1' }, data: { disponible: false } }),
      );
      expect(result.item.disponible).toBe(false);
      expect(result.message).toMatch(/desactivado/);
    });
  });

  describe('quitarDelMenu', () => {
    it('rechaza si el ítem no existe', async () => {
      mockPrisma.menuDiario.findUnique.mockResolvedValue(null);
      await expect(service.quitarDelMenu('no-existe')).rejects.toThrow('no encontrado');
    });

    it('quita un plato del menú del día sin borrar el producto', async () => {
      mockPrisma.menuDiario.findUnique.mockResolvedValue({ id: 'md-1' });
      mockPrisma.menuDiario.delete.mockResolvedValue({});

      const result = await service.quitarDelMenu('md-1');

      expect(mockPrisma.menuDiario.delete).toHaveBeenCalledWith({ where: { id: 'md-1' } });
      expect(mockPrisma.producto.update).not.toHaveBeenCalled();
      expect(result.message).toMatch(/Quitado/);
    });
  });

  // ─── Merma de inventario (T-22) ─────────────────────────────────────────

  describe('registrarMerma', () => {
    it('rechaza si el producto no existe', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue(null);
      await expect(
        service.registrarMerma({ productoId: 'no-existe', cantidad: 1, motivo: 'Rota' }, null, null, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('rechaza si el producto pertenece a otra sede', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, sedeId: 'otra-sede' });
      await expect(
        service.registrarMerma({ productoId: 'prod-001', cantidad: 1, motivo: 'Rota' }, null, null, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('rechaza si el producto no lleva control de stock', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: null });
      await expect(
        service.registrarMerma({ productoId: 'prod-001', cantidad: 1, motivo: 'Rota' }, null, null, SEDE),
      ).rejects.toThrow('no lleva control de stock');
    });

    it('rechaza mermar más de lo que hay en stock', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 3 });
      await expect(
        service.registrarMerma({ productoId: 'prod-001', cantidad: 5, motivo: 'Vencidas' }, null, null, SEDE),
      ).rejects.toThrow('solo hay 3 en stock');
    });

    it('descuenta el stock, crea el registro de merma y emite el evento', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 10 });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 7 });
      mockPrisma.merma.create.mockResolvedValue({
        id: 'merma-1', productoId: 'prod-001', cantidad: 3, motivo: 'Botellas rotas',
        usuarioId: 'u-1', usuarioNombre: 'Ana', createdAt: new Date(),
      });

      const result = await service.registrarMerma(
        { productoId: 'prod-001', cantidad: 3, motivo: 'Botellas rotas' },
        'u-1', 'Ana', SEDE,
      );

      expect(mockPrisma.producto.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-001' }, data: expect.objectContaining({ stockActual: 7 }) }),
      );
      expect(mockPrisma.merma.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ productoId: 'prod-001', cantidad: 3, motivo: 'Botellas rotas', usuarioId: 'u-1', usuarioNombre: 'Ana' }) }),
      );
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routingKey: 'producto.actualizado',
            payload: expect.stringContaining('"stockSyncMode":"MERMA"'),
          }),
        }),
      );
      expect(result.merma.cantidad).toBe(3);
      expect(result.merma.motivo).toBe('Botellas rotas');
    });

    it('marca el producto como no disponible si la merma agota el stock', async () => {
      mockPrisma.producto.findUnique.mockResolvedValue({ ...productoBase, stockActual: 2 });
      mockPrisma.producto.update.mockResolvedValue({ ...productoBase, stockActual: 0, disponible: false });
      mockPrisma.merma.create.mockResolvedValue({
        id: 'merma-2', productoId: 'prod-001', cantidad: 2, motivo: 'Se venció todo',
        usuarioId: null, usuarioNombre: null, createdAt: new Date(),
      });

      await service.registrarMerma({ productoId: 'prod-001', cantidad: 2, motivo: 'Se venció todo' }, null, null, SEDE);

      expect(mockPrisma.producto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stockActual: 0, disponible: false }) }),
      );
    });
  });

  describe('listarMermas', () => {
    it('lista las mermas más recientes primero', async () => {
      mockPrisma.merma.findMany.mockResolvedValue([
        { id: 'merma-1', productoId: 'prod-001', cantidad: 2, motivo: 'Rotas', usuarioId: null, usuarioNombre: null, createdAt: new Date(), producto: productoBase },
      ]);

      const result = await service.listarMermas({}, SEDE);

      expect(mockPrisma.merma.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' }, where: { producto: { sedeId: SEDE } } }),
      );
      expect(result.mermas).toHaveLength(1);
    });

    it('filtra por productoId cuando se indica', async () => {
      mockPrisma.merma.findMany.mockResolvedValue([]);
      await service.listarMermas({ productoId: 'prod-001' }, SEDE);
      expect(mockPrisma.merma.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { producto: { sedeId: SEDE }, productoId: 'prod-001' } }),
      );
    });

    it('T-23: un admin general sin sede fija debe indicar cuál usar', async () => {
      await expect(service.listarMermas({}, null)).rejects.toThrow('Indica la sede');
    });
  });
});
