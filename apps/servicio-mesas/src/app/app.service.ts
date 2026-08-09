import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import {
  MesaDto,
  CrearMesaCommand,
  ActualizarEstadoMesaCommand,
  MesaEstado,
  RoutingKeys,
  UbicacionDto,
  CrearUbicacionCommand,
  ActualizarUbicacionCommand,
} from '@org/contracts';
import type { Mesa, Ubicacion } from '../generated/prisma';

type MesaConUbicacion = Mesa & { ubicacion: Ubicacion };

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private toMesaDto(mesa: MesaConUbicacion): MesaDto {
    const { ubicacion, ...resto } = mesa;
    return { ...resto, ubicacion: ubicacion.nombre };
  }

  async listarMesas(): Promise<{ mesas: MesaDto[] }> {
    const mesas = await this.prisma.mesa.findMany({
      orderBy: { numero: 'asc' },
      include: { ubicacion: true },
      // Tope de seguridad (hallazgo pruebas de carga 2026-07-13): sin límite,
      // este listado serializa la tabla entera por request y bajo carga el
      // event loop degenera (p95 42s con ~500 filas × cientos req/s). Un
      // restobar real tiene decenas de mesas — 200 nunca trunca datos reales.
      // ponytail: cap fijo; paginación cursor+limit real pendiente (task chip).
      take: 200,
    });
    return { mesas: mesas.map((m) => this.toMesaDto(m)) };
  }

  async crearMesa(command: CrearMesaCommand): Promise<{ message: string; mesa: MesaDto }> {
    const existe = await this.prisma.mesa.findUnique({ where: { numero: command.numero } });
    if (existe) {
      throw new ConflictException(`La mesa número ${command.numero} ya existe.`);
    }
    const ubicacion = await this.prisma.ubicacion.findUnique({ where: { id: command.ubicacionId } });
    if (!ubicacion) {
      throw new NotFoundException(`Ubicación ${command.ubicacionId} no encontrada.`);
    }

    const mesa = await this.prisma.$transaction(async (prisma) => {
      const m = await prisma.mesa.create({
        data: {
          numero: command.numero,
          capacidad: command.capacidad || 4,
          ubicacionId: command.ubicacionId,
          estado: MesaEstado.Libre,
        }
      });

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.MesaCreada,
          payload: JSON.stringify({ mesa: { ...m, ubicacion: ubicacion.nombre } }),
          status: 'PENDING',
        }
      });

      return m;
    });

    const mesaDto = this.toMesaDto({ ...mesa, ubicacion });
    return { message: 'Mesa creada exitosamente', mesa: mesaDto };
  }

  async actualizarEstado(id: string, command: ActualizarEstadoMesaCommand): Promise<{ message: string; mesa: MesaDto }> {
    const mesa = await this.prisma.mesa.findUnique({ where: { id }, include: { ubicacion: true } });
    if (!mesa) {
      throw new NotFoundException(`Mesa con ID ${id} no encontrada.`);
    }

    const isEstadoEqual = mesa.estado === command.estado;
    const isCuentaEqual = command.cuentaAsociada === undefined || mesa.cuentaAsociada === command.cuentaAsociada;

    if (isEstadoEqual && isCuentaEqual) {
      return { message: 'Estado sin cambios', mesa: this.toMesaDto(mesa) };
    }

    const resultado = await this.prisma.$transaction(async (prisma) => {
      const { count } = await prisma.mesa.updateMany({
        where: { id, estado: mesa.estado },
        data: {
          estado: command.estado,
          cuentaAsociada: command.cuentaAsociada,
        }
      });

      if (count === 0) {
        return { conflicto: true };
      }

      const actualizada = await prisma.mesa.findUnique({ where: { id }, include: { ubicacion: true } });
      const mesaDto = this.toMesaDto(actualizada!);

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.MesaActualizada,
          payload: JSON.stringify({ mesa: mesaDto }),
          status: 'PENDING',
        }
      });

      return { conflicto: false, mesaDto };
    });

    if (resultado.conflicto) {
      this.logger.warn({
        operation: 'actualizarEstado',
        aggregateId: id,
        errorCode: 'CONFLICTO_CONCURRENCIA',
        resultingState: mesa.estado,
        message: `Conflicto de estado en mesa: se esperaba ${mesa.estado}, otra transacción ya la modificó.`,
      } satisfies OperableLog);
      throw new ConflictException(`El estado de la mesa fue modificado por otra transacción.`);
    }

    return { message: 'Estado de mesa actualizado', mesa: resultado.mesaDto! };
  }

  async obtenerMesa(id: string): Promise<MesaDto> {
    const mesa = await this.prisma.mesa.findUnique({ where: { id }, include: { ubicacion: true } });
    if (!mesa) {
      throw new NotFoundException(`Mesa con ID ${id} no encontrada.`);
    }
    return this.toMesaDto(mesa);
  }

  // --- UBICACIONES ---

  async listarUbicaciones(): Promise<{ ubicaciones: UbicacionDto[] }> {
    const ubicaciones = await this.prisma.ubicacion.findMany({ orderBy: { nombre: 'asc' } });
    return { ubicaciones };
  }

  async crearUbicacion(command: CrearUbicacionCommand): Promise<{ message: string; ubicacion: UbicacionDto }> {
    const nombre = command.nombre.trim();
    await this.assertNombreUbicacionDisponible(nombre);

    const ubicacion = await this.crearUbicacionSegura(nombre);
    return { message: 'Ubicación creada exitosamente', ubicacion };
  }

  async actualizarUbicacion(id: string, command: ActualizarUbicacionCommand): Promise<{ message: string; ubicacion: UbicacionDto }> {
    const existente = await this.prisma.ubicacion.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Ubicación no encontrada');

    const nombre = command.nombre.trim();
    await this.assertNombreUbicacionDisponible(nombre, id);

    const ubicacion = await this.actualizarUbicacionSegura(id, nombre);
    return { message: 'Ubicación actualizada', ubicacion };
  }

  async eliminarUbicacion(id: string): Promise<{ message: string }> {
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id },
      include: { _count: { select: { mesas: true } } },
    });
    if (!ubicacion) throw new NotFoundException('Ubicación no encontrada');

    if (ubicacion._count.mesas > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${ubicacion._count.mesas} mesa(s) asociada(s). Reasígnalas a otra ubicación primero.`,
      );
    }

    await this.prisma.ubicacion.delete({ where: { id } });
    return { message: 'Ubicación eliminada' };
  }

  /** Rechaza un nombre que ya existe (case-insensitive, sin espacios). `excludeId` permite renombrar una ubicación a sí misma. */
  private async assertNombreUbicacionDisponible(nombre: string, excludeId?: string): Promise<void> {
    const existente = await this.prisma.ubicacion.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existente) {
      throw new ConflictException(`Ya existe una ubicación llamada "${existente.nombre}"`);
    }
  }

  // El check de arriba no cierra una carrera entre dos requests simultáneos;
  // la constraint UNIQUE de la BD es la garantía real. P2002 aquí es ese
  // caso raro, traducido al mismo 409 que ya usa assertNombreUbicacionDisponible.
  private async crearUbicacionSegura(nombre: string): Promise<UbicacionDto> {
    try {
      return await this.prisma.ubicacion.create({ data: { nombre } });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(`Ya existe una ubicación llamada "${nombre}"`);
      }
      throw error;
    }
  }

  private async actualizarUbicacionSegura(id: string, nombre: string): Promise<UbicacionDto> {
    try {
      return await this.prisma.ubicacion.update({ where: { id }, data: { nombre } });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(`Ya existe una ubicación llamada "${nombre}"`);
      }
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
