import { Injectable, NotFoundException, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoriaDto,
  ProductoDto,
  CrearCategoriaCommand,
  ActualizarCategoriaCommand,
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
    const nombre = command.nombre.trim();
    await this.assertNombreDisponible(nombre);
    if (command.parentId) {
      await this.assertParentValido(command.parentId);
    }

    const categoria = await this.crearCategoriaSegura(nombre, command.descripcion, command.parentId);
    return { message: 'Categoría creada exitosamente', categoria };
  }

  async actualizarCategoria(
    id: string,
    command: ActualizarCategoriaCommand,
  ): Promise<{ message: string; categoria: CategoriaDto }> {
    const existente = await this.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { subcategorias: true } } },
    });
    if (!existente) throw new NotFoundException('Categoría no encontrada');

    const nombre = command.nombre?.trim();
    if (nombre !== undefined && nombre !== '') {
      await this.assertNombreDisponible(nombre, id);
    }

    if (command.parentId) {
      if (command.parentId === id) {
        throw new BadRequestException('Una categoría no puede ser su propia categoría padre.');
      }
      if (existente._count.subcategorias > 0) {
        throw new BadRequestException(
          'No se puede convertir en subcategoría: ya tiene sus propias subcategorías. Reasígnalas primero.',
        );
      }
      await this.assertParentValido(command.parentId);
    }

    const categoria = await this.actualizarCategoriaSegura(id, {
      ...(nombre ? { nombre } : {}),
      ...(command.descripcion === undefined ? {} : { descripcion: command.descripcion }),
      ...(command.parentId === undefined ? {} : { parentId: command.parentId }),
    });
    return { message: 'Categoría actualizada', categoria };
  }

  async eliminarCategoria(id: string): Promise<{ message: string }> {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { productos: true, subcategorias: true } } },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');

    if (categoria._count.productos > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${categoria._count.productos} producto(s) asociado(s). Reasígnalos a otra categoría primero.`,
      );
    }
    if (categoria._count.subcategorias > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${categoria._count.subcategorias} subcategoría(s). Reasígnalas o elimínalas primero.`,
      );
    }

    await this.prisma.categoria.delete({ where: { id } });
    return { message: 'Categoría eliminada' };
  }

  /** Una subcategoría no puede a su vez tener padre (un solo nivel de anidación). */
  private async assertParentValido(parentId: string): Promise<void> {
    const parent = await this.prisma.categoria.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException(`Categoría padre ${parentId} no encontrada.`);
    if (parent.parentId) {
      throw new BadRequestException('No se permite anidar más de un nivel de subcategorías.');
    }
  }

  /** Rechaza un nombre que ya existe (case-insensitive, sin espacios). `excludeId` permite renombrar una categoría a sí misma. */
  private async assertNombreDisponible(nombre: string, excludeId?: string): Promise<void> {
    const existente = await this.prisma.categoria.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existente) {
      throw new ConflictException(`Ya existe una categoría llamada "${existente.nombre}"`);
    }
  }

  // El check de arriba no cierra una carrera entre dos requests simultáneos;
  // la constraint UNIQUE de la BD es la garantía real. P2002 aquí es ese
  // caso raro, traducido al mismo 409 que ya usa assertNombreDisponible.
  private async crearCategoriaSegura(nombre: string, descripcion?: string, parentId?: string): Promise<CategoriaDto> {
    try {
      return await this.prisma.categoria.create({ data: { nombre, descripcion, parentId } });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${nombre}"`);
      }
      throw error;
    }
  }

  private async actualizarCategoriaSegura(
    id: string,
    data: { nombre?: string; descripcion?: string | null; parentId?: string | null },
  ): Promise<CategoriaDto> {
    try {
      return await this.prisma.categoria.update({ where: { id }, data });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${data.nombre}"`);
      }
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
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
    // Fault-injection para las pruebas de caos: fuerza un fallo del consumidor
    // (→ reintentos → DLQ). Gateado por entorno: NUNCA activo en producción, para
    // que un `notas` con el string mágico no sea un backdoor de DoS por request.
    if (
      process.env.NODE_ENV !== 'production' &&
      pedido.items.some((item) => item?.notas === '__QA_INVENTARIO_FORCE_DLQ__')
    ) {
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
