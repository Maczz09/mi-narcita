import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActualizarProveedorCommand,
  CrearProveedorCommand,
  ListarProveedoresQuery,
  ProveedorListResponse,
} from '@org/contracts';
import { OperableLog } from '@org/observabilidad';
import { resolveSedeId } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { toProveedorDto } from './compras.mapper';
import { Proveedor } from '../generated/prisma';

@Injectable()
export class ProveedoresService {
  private readonly logger = new Logger(ProveedoresService.name);
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: ListarProveedoresQuery = {}, usuarioSedeId?: string | null): Promise<ProveedorListResponse> {
    const sedeId = resolveSedeId(usuarioSedeId, query.sedeId);
    const limit = this.normalizeLimit(query.limit);

    const proveedores = await this.prisma.proveedor.findMany({
      where: {
        sedeId,
        ...(query.activo != null ? { activo: query.activo } : {}),
        ...(query.search
          ? { nombre: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });

    const hasMore = proveedores.length > limit;
    const data = proveedores.slice(0, limit);

    return {
      data: data.map(toProveedorDto),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  async crear(command: CrearProveedorCommand, usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = resolveSedeId(usuarioSedeId, sedeIdSolicitado);

    let proveedor: Proveedor;
    try {
      proveedor = await this.prisma.proveedor.create({
        data: {
          sedeId,
          nombre: command.nombre,
          ruc: command.ruc ?? null,
          categoria: command.categoria ?? null,
          contacto: command.contacto ?? null,
          telefono: command.telefono ?? null,
          diasEntrega: command.diasEntrega ?? null,
          condicionPago: command.condicionPago ?? null,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya existe un proveedor con ese nombre o RUC en esta sede');
      }
      throw error;
    }

    this.logger.log({
      operation: 'crear',
      aggregateId: proveedor.id,
      message: `Proveedor creado: ${proveedor.nombre}.`,
    } satisfies OperableLog);
    return { message: 'Proveedor creado', proveedor: toProveedorDto(proveedor) };
  }

  async actualizar(id: string, command: ActualizarProveedorCommand, usuarioSedeId?: string | null) {
    await this.findOrThrow(id, usuarioSedeId);

    let proveedor: Proveedor;
    try {
      proveedor = await this.prisma.proveedor.update({
        where: { id },
        data: {
          ...(command.nombre !== undefined ? { nombre: command.nombre } : {}),
          ...(command.ruc !== undefined ? { ruc: command.ruc } : {}),
          ...(command.categoria !== undefined ? { categoria: command.categoria } : {}),
          ...(command.contacto !== undefined ? { contacto: command.contacto } : {}),
          ...(command.telefono !== undefined ? { telefono: command.telefono } : {}),
          ...(command.diasEntrega !== undefined ? { diasEntrega: command.diasEntrega } : {}),
          ...(command.condicionPago !== undefined ? { condicionPago: command.condicionPago } : {}),
          ...(command.activo !== undefined ? { activo: command.activo } : {}),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya existe un proveedor con ese nombre o RUC en esta sede');
      }
      throw error;
    }

    this.logger.log({
      operation: 'actualizar',
      aggregateId: id,
      message: 'Proveedor actualizado.',
    } satisfies OperableLog);
    return { message: 'Proveedor actualizado', proveedor: toProveedorDto(proveedor) };
  }

  async eliminar(id: string, usuarioSedeId?: string | null) {
    await this.findOrThrow(id, usuarioSedeId);

    const tieneOrdenes = await this.prisma.ordenCompra.count({ where: { proveedorId: id } });
    if (tieneOrdenes > 0) {
      const proveedor = await this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
      this.logger.log({
        operation: 'eliminar',
        aggregateId: id,
        message: 'Proveedor con órdenes asociadas: desactivado (soft-delete) en vez de borrado.',
      } satisfies OperableLog);
      return { message: 'Proveedor desactivado (tiene órdenes de compra asociadas)', proveedor: toProveedorDto(proveedor) };
    }

    await this.prisma.proveedor.delete({ where: { id } });
    this.logger.log({
      operation: 'eliminar',
      aggregateId: id,
      message: 'Proveedor eliminado.',
    } satisfies OperableLog);
    return { message: 'Proveedor eliminado' };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }

  async findOrThrow(id: string, usuarioSedeId?: string | null): Promise<Proveedor> {
    const proveedor = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!proveedor || (usuarioSedeId && proveedor.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`Proveedor ${id} no encontrado`);
    }
    return proveedor;
  }
}
