import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  PedidoDto,
  CrearPedidoCommand,
  ActualizarEstadoPedidoCommand,
  ActualizarEstadoItemCommand,
  PedidoItemInput,
  PedidoEstado,
  ListarPedidosQuery,
  PedidoListResponse,
  RoutingKeys,
  PagoRegistradoPayload,
  ProductoCreadoPayload,
  ProductoActualizadoPayload,
  StockInsuficientePayload,
} from '@org/contracts';
import { Prisma } from '../generated/prisma';
import { getOrCreateCounter } from '@org/observabilidad';
import { MesasHttpClient } from './mesas-http.client';
import { InventarioHttpClient, ProductoRemotoLote } from './inventario-http.client';
import { PedidosSagaService } from './pedidos-saga.service';
import { mapPedidoToDto } from './pedido.mapper';
import {
  PedidoItemMapeado,
  MesaLocalEntity,
  PedidoEntity,
} from './types';

interface MeseroPedido {
  id: string;
  nombre?: string | null;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  // Métricas de negocio (plan 5.2): pedidos/min vía rate(pedidos_creados_total).
  private readonly pedidosCreadosCounter = getOrCreateCounter(
    'pedidos_creados_total', 'Pedidos creados', ['modalidad'],
  );
  // R-08: pedidos rechazados por dependencia caída (503/breaker), hermano de
  // pedidos_rechazados_sin_stock_total. Cierra la tasa de éxito de pedido.
  private readonly pedidosRechazadosDependenciaCounter = getOrCreateCounter(
    'pedidos_rechazados_dependencia_total', 'Pedidos rechazados por dependencia no disponible', ['dependency'],
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly mesasHttp: MesasHttpClient,
    private readonly inventarioHttp: InventarioHttpClient,
    private readonly saga: PedidosSagaService,
  ) {}

  async crearPedido(command: CrearPedidoCommand, mesero?: MeseroPedido | null): Promise<{ message: string; pedido: PedidoDto }> {
    const mesaLocal = await this.validarMesa(command.mesaId);
    const itemsProcesados = await this.validarYMapearItems(command.items);
    const total = this.calcularTotal(itemsProcesados);
    const pedido = await this.persistirPedido({
      mesaId: command.mesaId,
      numeroMesa: mesaLocal.numero,
      items: itemsProcesados,
      total,
      cliente: command.cliente,
      telefono: command.telefono,
      direccion: command.direccion,
      proveedor: command.proveedor,
      modalidad: command.modalidad,
      mesero,
    });

    this.logger.log(`Pedido ${pedido.id} creado con eventos en Outbox`);
    this.pedidosCreadosCounter.inc({ modalidad: command.modalidad ?? 'MESA' });
    return {
      message: 'Pedido creado exitosamente',
      pedido: this.mapToDto(pedido)
    };
  }

  private async validarMesa(mesaId: string): Promise<MesaLocalEntity> {
    const mesa = await this.prisma.mesaLocal.findUnique({ where: { id: mesaId } });
    if (mesa) {
      return mesa;
    }

    return this.sincronizarMesaLocal(mesaId);
  }

  private async sincronizarMesaLocal(mesaId: string): Promise<MesaLocalEntity> {
    // T-33: la llamada remota (token + axios + breaker + mapeo de errores) vive
    // en MesasHttpClient; aquí solo queda la proyección local.
    const data = await this.mesasHttp.obtenerMesa(mesaId);

    return this.prisma.mesaLocal.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        numero: data.numero,
      },
      update: {
        numero: data.numero,
      },
    });
  }

  private async asegurarProductosLocales(productoIds: string[]): Promise<void> {
    const existentes = await this.prisma.productoLocal.findMany({
      where: { id: { in: productoIds } }
    });
    const existentesIds = new Set(existentes.map(p => p.id));
    const faltantes = productoIds.filter(id => !existentesIds.has(id));

    if (faltantes.length > 0) {
      this.logger.warn(`Cold-start: ${faltantes.length} productos no están en proyección local, cargando desde inventario`);
      // T-33: la llamada remota vive en InventarioHttpClient (breaker incluido).
      let productos: ProductoRemotoLote[];
      try {
        productos = await this.inventarioHttp.obtenerProductosLote(faltantes);
      } catch (error) {
        // Dependencia caída (timeout/breaker/refused → 503): cuenta el rechazo
        // para la tasa de éxito de pedido y propaga.
        if (error instanceof ServiceUnavailableException) {
          this.pedidosRechazadosDependenciaCounter.inc({ dependency: 'inventario' });
        }
        throw error;
      }
      await Promise.all(productos.map(p =>
        this.prisma.productoLocal.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            stockActual: p.stockActual ?? null,
            categoriaNombre: p.categoria?.nombre ?? 'COCINA',
            disponible: p.disponible ?? true,
          },
          update: {
            nombre: p.nombre,
            precio: p.precio,
            stockActual: p.stockActual ?? null,
            categoriaNombre: p.categoria?.nombre ?? 'COCINA',
            disponible: p.disponible ?? true,
          },
        })
      ));
    }
  }

  private async validarYMapearItems(itemsToProcess: PedidoItemInput[]): Promise<PedidoItemMapeado[]> {
    const ids = itemsToProcess.map(i => i.productoId);
    await this.asegurarProductosLocales(ids);

    const productos = await this.prisma.productoLocal.findMany({
      where: { id: { in: ids } }
    });
    const mapa = new Map(productos.map(p => [p.id, p]));

    return itemsToProcess.map(item => {
      const p = mapa.get(item.productoId);
      if (!p) throw new NotFoundException(`Producto ${item.productoId} no encontrado`);
      if (item.cantidad < 1) {
        throw new BadRequestException(`La cantidad para ${p.nombre} debe ser al menos 1.`);
      }
      if (p.stockActual !== null && p.stockActual < item.cantidad) {
        throw new BadRequestException(`Stock insuficiente para ${p.nombre}. Disponible: ${p.stockActual}`);
      }

      return {
        productoId: p.id,
        nombre: p.nombre,
        cantidad: item.cantidad,
        precioUnitario: Number(p.precio),
        stockActual: p.stockActual,
        area: p.categoriaNombre?.toLowerCase().includes('bebida') ? 'BAR' : 'COCINA',
        notas: item.notas,
        comensal: item.identificadorComensal || 1,
      } satisfies PedidoItemMapeado;
    });
  }

  private calcularTotal(items: PedidoItemMapeado[]): Prisma.Decimal {
    return items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.precioUnitario).times(item.cantidad)),
      new Prisma.Decimal(0),
    );
  }

  private async persistirPedido({
    mesaId,
    numeroMesa,
    items,
    total,
    cliente,
    telefono,
    direccion,
    proveedor,
    modalidad,
    mesero,
  }: {
    mesaId: string;
    numeroMesa: number;
    items: PedidoItemMapeado[];
    total: Prisma.Decimal;
    cliente?: string;
    telefono?: string;
    direccion?: string;
    proveedor?: string;
    modalidad?: string;
    mesero?: MeseroPedido | null;
  }): Promise<PedidoEntity> {
    return this.prisma.$transaction(async (prisma) => {
      const itemsConStockControlado = items.filter((item) => typeof item.stockActual === 'number');
      const cantidadesPorProducto = itemsConStockControlado.reduce((acc, item) => {
        acc.set(item.productoId, (acc.get(item.productoId) ?? 0) + item.cantidad);
        return acc;
      }, new Map<string, number>());

      const productoIds = Array.from(cantidadesPorProducto.keys()).sort((a, b) => a.localeCompare(b));
      for (const productoId of productoIds) {
        const cantidad = cantidadesPorProducto.get(productoId)!;
        await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${productoId}))`);
        const reservado = await prisma.$queryRaw<{ stockActual: number }[]>(Prisma.sql`
          UPDATE productos_locales
          SET "stockActual" = "stockActual" - ${cantidad}
          WHERE id = ${productoId}
            AND "stockActual" IS NOT NULL
            AND "stockActual" >= ${cantidad}
          RETURNING "stockActual"
        `);

        if (reservado.length === 0) {
          const producto = items.find((item) => item.productoId === productoId);
          throw new BadRequestException(`Stock insuficiente para ${producto?.nombre ?? productoId}.`);
        }
      }

      const pedido = await prisma.pedido.create({
        data: {
          mesaId,
          numeroMesa,
          estado: PedidoEstado.Pendiente,
          total,
          cliente,
          telefono,
          direccion,
          proveedor,
          modalidad: modalidad ?? 'MESA',
          meseroId: mesero?.id,
          meseroNombre: mesero?.nombre ?? mesero?.id,
          items: {
            create: items.map(item => ({
              productoId: item.productoId,
              nombre: item.nombre,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              area: item.area,
              notas: item.notas,
              comensal: item.comensal,
              meseroId: mesero?.id,
              meseroNombre: mesero?.nombre ?? mesero?.id,
            }))
          }
        },
        include: {
          items: true
        }
      });

      const pedidoDto = this.mapToDto(pedido);

      await prisma.outboxEvent.createMany({
        data: [
          {
            routingKey: RoutingKeys.PedidoCreado,
            payload: JSON.stringify({ pedido: pedidoDto }),
            status: 'PENDING',
          },
          {
            routingKey: RoutingKeys.PedidoActualizado,
            payload: JSON.stringify({ pedido: pedidoDto }),
            status: 'PENDING',
          }
        ]
      });

      return pedido;
    });
  }


  async listarPedidos(query: ListarPedidosQuery = {}): Promise<PedidoListResponse> {
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.PedidoWhereInput = {
      ...(query.mesaId ? { mesaId: query.mesaId } : {}),
      ...(query.estado
        ? { estado: query.estado }
        : { estado: { notIn: [PedidoEstado.Pagado, PedidoEstado.Cancelado] } }),
      ...(query.updatedSince
        ? { updatedAt: { gte: new Date(query.updatedSince) } }
        : {}),
    };
    const pedidos = await this.prisma.pedido.findMany({
      where,
      include: {
        items: true
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    const hasMore = pedidos.length > limit;
    const data = pedidos.slice(0, limit);

    return {
      data: data.map(p => this.mapToDto(p)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  // T-40: transiciones de estado y saga delegadas en PedidosSagaService.
  async actualizarEstado(id: string, command: ActualizarEstadoPedidoCommand): Promise<{ message: string; pedido: PedidoDto }> {
    return this.saga.actualizarEstado(id, command);
  }

  async actualizarEstadoItem(itemId: string, command: ActualizarEstadoItemCommand): Promise<{ message: string }> {
    return this.saga.actualizarEstadoItem(itemId, command);
  }

  async upsertMesaLocal(mesa: { id: string; numero: number }): Promise<void> {
    await this.prisma.mesaLocal.upsert({
      where: { id: mesa.id },
      update: { numero: mesa.numero },
      create: { id: mesa.id, numero: mesa.numero }
    });
  }

  async upsertProductoLocal(producto: {
    id: string;
    nombre: string;
    precio: number;
    stockActual: number | null;
    categoriaNombre: string;
    disponible: boolean;
    allowStockIncrease?: boolean;
    stockDelta?: number;
    stockSyncMode?: 'REPOSICION' | 'CONSUMO_PEDIDO';
  }): Promise<void> {
    await this.upsertProductoLocalConPrisma(this.prisma, producto);
  }

  async procesarProductoCreado(payload: ProductoCreadoPayload): Promise<void> {
    await this.procesarEventoProducto(
      RoutingKeys.ProductoCreado,
      payload,
      (prisma) => this.upsertProductoLocalConPrisma(prisma, {
        id: payload.id,
        nombre: payload.nombre,
        precio: payload.precio,
        stockActual: payload.stockActual ?? null,
        categoriaNombre: payload.categoriaNombre ?? 'COCINA',
        disponible: payload.disponible,
        allowStockIncrease: false,
      }),
    );
  }

  async procesarProductoActualizado(payload: ProductoActualizadoPayload): Promise<void> {
    await this.procesarEventoProducto(
      RoutingKeys.ProductoActualizado,
      payload,
      (prisma) => this.upsertProductoLocalConPrisma(prisma, {
        id: payload.id,
        nombre: payload.nombre,
        precio: payload.precio,
        stockActual: payload.stockActual ?? null,
        stockDelta: payload.stockDelta,
        stockSyncMode: payload.stockSyncMode,
        categoriaNombre: payload.categoriaNombre ?? 'COCINA',
        disponible: payload.disponible,
        allowStockIncrease: payload.stockSyncMode === 'REPOSICION' && (payload.stockDelta ?? 0) > 0,
      }),
    );
  }

  /** T-40: compensación de la saga de stock delegada en PedidosSagaService. */
  async procesarStockInsuficiente(payload: StockInsuficientePayload): Promise<void> {
    return this.saga.procesarStockInsuficiente(payload);
  }

  private async procesarEventoProducto(
    routingKey: string,
    payload: { id: string; eventId?: string; stockSyncMode?: string; stockDelta?: number; stockActual?: number | null },
    apply: (prisma: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    const fallbackKey = routingKey === RoutingKeys.ProductoActualizado
      ? `${payload.id}:${payload.stockSyncMode ?? 'SIN_MODO'}:${payload.stockDelta ?? 'SIN_DELTA'}:${payload.stockActual ?? 'SIN_STOCK'}`
      : payload.id;
    const idempotencyKey = `${routingKey}:${payload.eventId ?? fallbackKey}`;
    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey } });
        await apply(prisma);
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.warn(`Evento ${idempotencyKey} ya procesado — proyeccion de productos no se aplica de nuevo`);
        return;
      }
      throw error;
    }
  }

  private async upsertProductoLocalConPrisma(prisma: Prisma.TransactionClient, producto: {
    id: string;
    nombre: string;
    precio: number;
    stockActual: number | null;
    stockDelta?: number;
    stockSyncMode?: 'REPOSICION' | 'CONSUMO_PEDIDO';
    categoriaNombre: string;
    disponible: boolean;
    allowStockIncrease?: boolean;
  }): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${producto.id}))`);
    const existente = await prisma.productoLocal.findUnique({ where: { id: producto.id } });
    let stockActual = producto.stockActual;

    if (existente) {
      stockActual = existente.stockActual;
      if (
        producto.stockSyncMode === 'REPOSICION' &&
        producto.allowStockIncrease &&
        Number.isFinite(producto.stockDelta) &&
        (producto.stockDelta ?? 0) > 0
      ) {
        stockActual = existente.stockActual === null
          ? producto.stockActual
          : existente.stockActual + (producto.stockDelta ?? 0);
      }
    }

    await prisma.productoLocal.upsert({
      where: { id: producto.id },
      update: {
        nombre: producto.nombre,
        precio: producto.precio,
        stockActual,
        categoriaNombre: producto.categoriaNombre,
        disponible: producto.disponible,
      },
      create: {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        stockActual,
        categoriaNombre: producto.categoriaNombre,
        disponible: producto.disponible,
      },
    });
  }

  private mapToDto(p: PedidoEntity): PedidoDto {
    return mapPedidoToDto(p);
  }

  async procesarPagoRecibido(payload: PagoRegistradoPayload): Promise<void> {
    this.logger.log(`Procesando pago recibido para cuenta ${payload.cuentaId} y mesa ${payload.mesaId}`);

    try {
      await this.prisma.$transaction(async (prisma) => {
        await prisma.idempotencyKey.create({ data: { key: `pago:${payload.cuentaId}` } });
        await prisma.pedido.updateMany({
          where: {
            mesaId: payload.mesaId,
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
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
         this.logger.warn(`Pago ${payload.cuentaId} ya procesado — idempotente`);
         return;
      }
      throw e;
    }
  }
}
