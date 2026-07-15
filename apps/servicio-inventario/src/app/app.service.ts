import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { 
  CategoriaDto, 
  ProductoDto, 
  CrearCategoriaCommand,
  CrearProductoCommand,
  ActualizarProductoCommand,
  ListarProductosQuery,
  ProductoListResponse,
  RoutingKeys,
  ProductoCreadoPayload,
  ProductoActualizadoPayload,
  StockInsuficientePayload,
  PedidoCreadoPayload,
} from '@org/contracts';
import { Prisma } from '../generated/prisma';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): { message: string; service: string } {
    return { message: 'Servicio de Inventario activo', service: 'servicio-inventario' };
  }

  // --- CATEGORÍAS ---

  async listarCategorias(): Promise<{ categorias: CategoriaDto[] }> {
    const categorias = await this.prisma.categoria.findMany({
      orderBy: { nombre: 'asc' }
    });
    return { categorias };
  }

  async crearCategoria(command: CrearCategoriaCommand): Promise<{ message: string; categoria: CategoriaDto }> {
    const categoria = await this.prisma.categoria.create({
      data: {
        nombre: command.nombre,
        descripcion: command.descripcion,
      }
    });
    return { message: 'Categoría creada exitosamente', categoria };
  }

  // --- PRODUCTOS ---

  async listarProductos(query: ListarProductosQuery = {}): Promise<ProductoListResponse> {
    const limit = this.normalizeLimit(query.limit);
    const disponible = this.normalizeBoolean(query.disponible);
    const conStock = this.normalizeBoolean(query.conStock);
    const where: Prisma.ProductoWhereInput = {
      ...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
      ...(disponible == null ? {} : { disponible }),
      ...(conStock === true ? { stockActual: { not: null } } : {}),
      ...(conStock === false ? { stockActual: null } : {}),
      ...(query.updatedSince
        ? { updatedAt: { gte: new Date(query.updatedSince) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { nombre: { contains: query.search, mode: 'insensitive' } },
              { descripcion: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const productos = await this.prisma.producto.findMany({
      where,
      include: { categoria: true },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });

    const hasMore = productos.length > limit;
    const data = productos.slice(0, limit);

    return {
      data: data.map((producto) => this.toProductoDto(producto)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  private normalizeBoolean(value?: boolean): boolean | undefined {
    if (value == null) return undefined;
    if (typeof value === 'boolean') return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return undefined;
  }

  private toProductoDto(producto: Record<string, unknown>): ProductoDto {
    return {
      id: producto['id'] as string,
      categoriaId: producto['categoriaId'] as string,
      categoria: (producto['categoria'] ?? undefined) as CategoriaDto | undefined,
      nombre: producto['nombre'] as string,
      descripcion: (producto['descripcion'] ?? null) as string | null,
      precio: Number(producto['precio']),
      disponible: producto['disponible'] as boolean,
      stockActual: (producto['stockActual'] ?? null) as number | null,
    };
  }

  async obtenerProducto(id: string): Promise<ProductoDto> {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      include: { categoria: true }
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return this.toProductoDto(producto);
  }

  async obtenerProductosLote(ids: string[]): Promise<{ productos: ProductoDto[] }> {
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids } },
      include: { categoria: true },
    });
    return { productos: productos.map((producto) => this.toProductoDto(producto)) };
  }

  async crearProducto(command: CrearProductoCommand): Promise<{ message: string; producto: ProductoDto }> {
    const categoria = await this.prisma.categoria.findUnique({ where: { id: command.categoriaId } });
    if (!categoria) {
      throw new NotFoundException(`Categoría con ID ${command.categoriaId} no encontrada`);
    }

    const producto = await this.prisma.$transaction(async (prisma) => {
      const p = await prisma.producto.create({
        data: {
          categoriaId: command.categoriaId,
          nombre: command.nombre,
          descripcion: command.descripcion,
          precio: command.precio,
          disponible: command.disponible ?? true,
          stockActual: command.stockActual ?? null,
        }
      });

      const payload: ProductoCreadoPayload = {
        id: p.id,
        nombre: p.nombre,
        precio: p.precio.toNumber(),
        stockActual: p.stockActual,
        categoriaNombre: categoria.nombre,
        disponible: p.disponible,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoCreado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        }
      });

      return p;
    });
    
    return { message: 'Producto creado exitosamente', producto: this.toProductoDto({ ...producto, categoria }) };
  }

  async actualizarProducto(id: string, command: ActualizarProductoCommand): Promise<{ message: string; producto: ProductoDto }> {
    if (command.categoriaId) {
      const categoria = await this.prisma.categoria.findUnique({ where: { id: command.categoriaId } });
      if (!categoria) {
        throw new NotFoundException(`Categoría con ID ${command.categoriaId} no encontrada`);
      }
    }

    const actualizado = await this.prisma.$transaction(async (prisma) => {
      const existente = await prisma.producto.findUnique({ where: { id }, include: { categoria: true } });
      if (!existente) throw new NotFoundException('Producto no encontrado');

      const p = await prisma.producto.update({
        where: { id },
        data: {
          ...(command.categoriaId == null ? {} : { categoriaId: command.categoriaId }),
          ...(command.nombre == null ? {} : { nombre: command.nombre }),
          ...(command.descripcion === undefined ? {} : { descripcion: command.descripcion }),
          ...(command.precio == null ? {} : { precio: command.precio }),
          ...(command.disponible == null ? {} : { disponible: command.disponible }),
        },
        include: { categoria: true },
      });

      const payload: ProductoActualizadoPayload = {
        id: p.id,
        nombre: p.nombre,
        precio: p.precio.toNumber(),
        stockActual: p.stockActual,
        categoriaNombre: p.categoria?.nombre,
        disponible: p.disponible,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoActualizado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        }
      });

      return p;
    });

    return { message: 'Producto actualizado', producto: this.toProductoDto(actualizado) };
  }

  async actualizarStock(id: string, cantidad: number): Promise<{ message: string; producto: ProductoDto }> {
    const actualizado = await this.prisma.$transaction(async (prisma) => {
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${id}), 1, 8))::bit(32)::int)`;

      const producto = await prisma.producto.findUnique({ where: { id }, include: { categoria: true } });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      const stockBase = producto.stockActual ?? 0;
      const nuevoStock = Math.max(0, stockBase + cantidad);
      const disponibleFinal = nuevoStock === 0 ? false : producto.disponible;

      const p = await prisma.producto.update({
        where: { id },
        data: {
          stockActual: nuevoStock,
          disponible: disponibleFinal,
        }
      });

      const payload: ProductoActualizadoPayload = {
        id: p.id,
        nombre: p.nombre,
        precio: p.precio.toNumber(),
        stockActual: p.stockActual,
        categoriaNombre: producto.categoria?.nombre,
        disponible: disponibleFinal,
        stockSyncMode: cantidad > 0 ? 'REPOSICION' : 'CONSUMO_PEDIDO',
        stockDelta: cantidad,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.ProductoActualizado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        }
      });

      return p;
    });

    return { message: 'Stock actualizado', producto: this.toProductoDto({ ...actualizado, categoria: undefined }) };
  }

  async reducirStockAutomatico(id: string, cantidad: number): Promise<void> {
    await this.reducirStockAutomaticoConPrisma(this.prisma, id, cantidad);
  }

  private async reducirStockAutomaticoConPrisma(
    prisma: Prisma.TransactionClient,
    id: string,
    cantidad: number,
    pedidoId?: string,
  ): Promise<void> {
    if (cantidad <= 0) throw new BadRequestException('Cantidad debe ser mayor a 0');
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${id}), 1, 8))::bit(32)::int)`;
    const producto = await prisma.producto.findUnique({ where: { id }, include: { categoria: true } });

    if (!producto) {
      this.logger.warn({
        operation: 'reducirStockAutomatico',
        aggregateId: id,
        errorCode: 'PRODUCTO_NO_ENCONTRADO',
        message: 'Producto no encontrado para reducción de stock.',
      } satisfies OperableLog);
      return;
    }

    if (producto.stockActual === null) {
      return;
    }

    const actualizado = await prisma.producto.updateMany({
      where: {
        id,
        stockActual: { gte: cantidad }
      },
      data: {
        stockActual: { decrement: cantidad }
      }
    });

    if (actualizado.count === 0) {
      this.logger.warn({
        operation: 'reducirStockAutomatico',
        aggregateId: id,
        errorCode: 'STOCK_INSUFICIENTE',
        message: `Stock insuficiente — no se pudo decrementar ${cantidad}.`,
      } satisfies OperableLog);
      // Compensación de saga: la proyección de pedidos quedó por delante del stock
      // real (lag de ProductoActualizado), así que el pedido se creó sobre stock
      // inexistente. Emitimos StockInsuficiente en el MISMO $transaction que el
      // resto del consumo para que Pedidos marque el ítem/pedido como rechazado.
      if (pedidoId) {
        await prisma.outboxEvent.create({
          data: {
            routingKey: RoutingKeys.StockInsuficiente,
            payload: JSON.stringify({
              pedidoId,
              productoId: id,
              solicitado: cantidad,
              disponible: producto.stockActual,
            } satisfies StockInsuficientePayload),
            status: 'PENDING',
          },
        });
      }
      return;
    }

    const productoDespues = await prisma.producto.findUnique({ where: { id } });
    let productoFinal = productoDespues;
    if (productoDespues?.stockActual === 0 && productoDespues.disponible) {
      productoFinal = await prisma.producto.update({
        where: { id },
        data: { disponible: false }
      });
    }

    await prisma.outboxEvent.create({
      data: {
        routingKey: RoutingKeys.ProductoActualizado,
        payload: JSON.stringify({
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio.toNumber(),
          stockActual: productoFinal?.stockActual,
          categoriaNombre: producto.categoria?.nombre,
          disponible: productoFinal?.disponible ?? producto.disponible,
          stockSyncMode: 'CONSUMO_PEDIDO',
          stockDelta: -cantidad,
        } satisfies ProductoActualizadoPayload),
        status: 'PENDING',
      }
    });

    this.logger.log({
      operation: 'reducirStockAutomatico',
      aggregateId: id,
      resultingState: `stockActual=${productoFinal?.stockActual}`,
      message: `Stock reducido para ${productoFinal?.nombre ?? id}.`,
    } satisfies OperableLog);
  }

  // A2: idempotencia por pedido.id — reclama la clave atómicamente
  async procesarPedidoCreado(pedido: PedidoCreadoPayload['pedido']): Promise<void> {
    if (!pedido?.id || !Array.isArray(pedido.items)) {
      this.logger.warn({
        operation: 'procesarPedidoCreado',
        errorCode: 'PAYLOAD_INVALIDO',
        message: 'Evento PedidoCreado sin id/items — ignorado.',
      } satisfies OperableLog);
      return;
    }
    if (pedido.items.some((item) => item?.notas === '__QA_INVENTARIO_FORCE_DLQ__')) {
      throw new Error(`Fallo QA controlado para pedido ${pedido.id}`);
    }
    const key = `pedido.creado:${pedido.id}`;

    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key } });

        await Promise.all(
          pedido.items.map(async (item) => {
            if (item.productoId && item.cantidad) {
              await this.reducirStockAutomaticoConPrisma(prisma, item.productoId, item.cantidad, pedido.id);
            }
          })
        );
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.warn({
          operation: 'procesarPedidoCreado',
          aggregateId: pedido.id,
          message: 'Evento PedidoCreado ya procesado — stock no se reduce de nuevo (idempotente).',
        } satisfies OperableLog);
        return;
      }
      throw e;
    }
  }
}
