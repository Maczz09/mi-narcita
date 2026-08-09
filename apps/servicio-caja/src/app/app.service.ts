import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getOrCreateCounter, getOrCreateHistogram, OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListarTransaccionesQuery,
  ListarTurnosQuery,
  PagoRegistradoPayload,
  RoutingKeys,
  TransaccionDto,
  TransaccionListResponse,
  TurnoListResponse,
} from '@org/contracts';
import { Prisma } from '../generated/prisma';
import {
  AbrirTurnoCajaCommand,
  ActualizarTransaccionCommand,
  CerrarTurnoCajaCommand,
  CrearMovimientoCajaCommand,
  PagarCuentaCajaCommand,
  RegistrarArqueoCajaCommand,
} from './caja.dto';
import { CuentasHttpClient, CuentaRemota } from './cuentas-http.client';

const METODOS = ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA'] as const;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  // Métricas de negocio (plan 5.2): pagos/min y distribución de montos.
  private readonly pagosCounter = getOrCreateCounter(
    'pagos_registrados_total', 'Pagos registrados en caja', ['metodo'],
  );
  private readonly pagoMontoHistogram = getOrCreateHistogram(
    'pago_monto_soles', 'Distribución del monto de los pagos (soles)',
    [10, 25, 50, 100, 200, 500, 1000],
    ['metodo'],
  );
  // Análogo de PAYMENT_UNKNOWN: el pago quedó registrado en caja pero el
  // cierre remoto de la cuenta (HTTP a servicio-cuentas) falló, así que la
  // cuenta puede seguir figurando ABIERTA aunque el cliente ya pagó.
  private readonly pagosCierrePendienteCounter = getOrCreateCounter(
    'pagos_cierre_remoto_pendiente_total', 'Pagos registrados cuyo cierre remoto de cuenta falló',
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly cuentasHttp: CuentasHttpClient,
  ) {}

  private usuario(usuarioId?: string | null) {
    return usuarioId ?? 'sistema';
  }

  private n(value: unknown): number {
    return Number(value ?? 0);
  }

  private money(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  async abrirTurno(command: AbrirTurnoCajaCommand, usuarioId?: string | null) {
    const abierto = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA' },
      orderBy: { abiertoAt: 'desc' },
    });

    if (abierto) return this.mapTurno(abierto);

    const fondoInicial = this.money(command.fondoInicial ?? 0);
    let turno;
    try {
      turno = await this.prisma.$transaction(async (prisma: import('../generated/prisma').Prisma.TransactionClient) => {
        const creado = await prisma.turnoCaja.create({
          data: {
            cajaId: command.cajaId ?? 'T01',
            cajaNombre: command.cajaNombre ?? 'Terminal 01',
            usuarioId: this.usuario(usuarioId),
            cajeroNombre: command.cajeroNombre,
            fondoInicial,
            estado: 'ABIERTA',
          },
        });

        await prisma.movimientoCaja.create({
          data: {
            turnoId: creado.id,
            tipo: 'APERTURA',
            donde: 'Fondo inicial',
            metodo: 'EFECTIVO',
            monto: fondoInicial,
          },
        });

        return creado;
      });
    } catch (error) {
      // T-25: carrera con otra apertura concurrente — el índice único parcial
      // `turnos_caja_un_abierto` rechaza el segundo INSERT con P2002. Devolver el
      // turno ya abierto (misma semántica que "si ya hay uno, devolverlo").
      if (this.isUniqueConstraintViolation(error)) {
        const existente = await this.prisma.turnoCaja.findFirst({
          where: { estado: 'ABIERTA' },
          orderBy: { abiertoAt: 'desc' },
        });
        if (existente) return this.mapTurno(existente);
      }
      throw error;
    }

    this.logger.log({
      operation: 'abrirTurno',
      aggregateId: turno.id,
      message: 'Turno de caja abierto.',
    } satisfies OperableLog);
    return this.mapTurno(turno);
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }

  async obtenerTurnoActivo() {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA' },
      orderBy: { abiertoAt: 'desc' },
    });
    return turno ? this.mapTurno(turno) : null;
  }

  async obtenerResumenTurnoActivo() {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA' },
      orderBy: { abiertoAt: 'desc' },
    });

    if (!turno) {
      return {
        turno: null,
        movimientos: [],
        ventas: [],
        totalVentas: 0,
        totalEgresos: 0,
        totalIngresos: 0,
        propinas: 0,
        porMetodo: this.emptyMetodoTotals(),
        efectivoEsperado: 0,
        comprobantes: 0,
        pendientes: 0,
        arqueo: null,
        cierre: null,
      };
    }

    return this.obtenerResumenTurno(turno.id);
  }

  // Micro-caché TTL single-flight del resumen (hallazgo pruebas de carga
  // 2026-07-13): el resumen trae TODOS los movimientos del turno y agrega en
  // JS por request; bajo consulta concurrente masiva degrada a timeouts. Se
  // cachea la PROMESA (no el valor): al expirar el TTL solo el primer caller
  // recomputa y el resto espera esa misma promesa — sin estampida (medido:
  // cachear el valor dejaba un p99 de timeout por la manada de misses en cada
  // ventana). Dato de dashboard: segundos de staleness aceptables. Opt-in por
  // env (CAJA_RESUMEN_TTL_MS>0) para no alterar tests ni semántica por defecto.
  // ponytail: stopgap; el fix real (SUM en SQL o caché con invalidación) tiene tarea propia.
  private readonly resumenCache = new Map<string, { at: number; promise: Promise<unknown> }>();

  async obtenerResumenTurno(id: string) {
    const ttl = Number(process.env.CAJA_RESUMEN_TTL_MS ?? 0);
    if (ttl <= 0) return this.computeResumenTurno(id);

    const hit = this.resumenCache.get(id);
    if (hit && Date.now() - hit.at < ttl) {
      return hit.promise as ReturnType<AppService['computeResumenTurno']>;
    }
    const promise = this.computeResumenTurno(id);
    this.resumenCache.set(id, { at: Date.now(), promise });
    // Un fallo no debe quedar cacheado como resultado del resto de la ventana.
    promise.catch(() => this.resumenCache.delete(id));
    return promise;
  }

  private async computeResumenTurno(id: string) {
    const turno = await this.prisma.turnoCaja.findUnique({
      where: { id },
      include: {
        movimientos: { orderBy: { createdAt: 'desc' } },
        arqueos: { orderBy: { createdAt: 'desc' }, take: 1 },
        cierre: true,
      },
    });

    if (!turno) throw new NotFoundException(`Turno ${id} no encontrado`);
    return this.buildResumen(turno);
  }

  async listarMovimientosTurno(id: string) {
    const movimientos = await this.prisma.movimientoCaja.findMany({
      where: { turnoId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { data: movimientos.map((m) => this.mapMovimiento(m)) };
  }

  async crearMovimiento(id: string, command: CrearMovimientoCajaCommand) {
    const turno = await this.prisma.turnoCaja.findUnique({ where: { id } });
    if (!turno) throw new NotFoundException(`Turno ${id} no encontrado`);
    if (turno.estado !== 'ABIERTA') {
      throw new BadRequestException('El turno ya está cerrado.');
    }

    const absMonto = Math.abs(command.monto);
    const monto = command.tipo === 'EGRESO' ? -absMonto : absMonto;
    const movimiento = await this.prisma.movimientoCaja.create({
      data: {
        turnoId: id,
        tipo: command.tipo,
        donde: command.donde,
        metodo: 'EFECTIVO',
        monto: this.money(monto),
        motivo: command.motivo,
      },
    });

    return this.mapMovimiento(movimiento);
  }

  async registrarArqueo(id: string, command: RegistrarArqueoCajaCommand, usuarioId?: string | null) {
    const turno = await this.prisma.turnoCaja.findUnique({
      where: { id },
      include: { movimientos: true },
    });
    if (!turno) throw new NotFoundException(`Turno ${id} no encontrado`);

    const efectivoEsperado = this.computeEfectivoEsperado(turno.movimientos);
    const efectivoContado = this.sumDenominaciones(command.denominaciones);
    const diferencia = efectivoContado.minus(efectivoEsperado);

    const arqueo = await this.prisma.arqueoCaja.create({
      data: {
        turnoId: id,
        denominaciones: command.denominaciones,
        efectivoEsperado,
        efectivoContado,
        diferencia,
        usuarioId: this.usuario(usuarioId),
      },
    });

    return this.mapArqueo(arqueo);
  }

  async cerrarTurno(id: string, command: CerrarTurnoCajaCommand, usuarioId?: string | null) {
    const cierre = await this.prisma.$transaction(async (prisma: import('../generated/prisma').Prisma.TransactionClient) => {
      const turno = await prisma.turnoCaja.findUnique({
        where: { id },
        include: {
          movimientos: { orderBy: { createdAt: 'desc' } },
          arqueos: { orderBy: { createdAt: 'desc' }, take: 1 },
          cierre: true,
        },
      });

      if (!turno) throw new NotFoundException(`Turno ${id} no encontrado`);
      if (turno.estado !== 'ABIERTA') {
        throw new BadRequestException('El turno ya está cerrado.');
      }

      const efectivoEsperado = this.computeEfectivoEsperado(turno.movimientos);
      const efectivoContado = this.sumDenominaciones(command.denominaciones);
      const diferencia = efectivoContado.minus(efectivoEsperado);

      const arqueo = await prisma.arqueoCaja.create({
        data: {
          turnoId: id,
          denominaciones: command.denominaciones,
          efectivoEsperado,
          efectivoContado,
          diferencia,
          usuarioId: this.usuario(usuarioId),
        },
      });

      const resumen = this.buildResumen({
        ...turno,
        arqueos: [arqueo],
        cierre: null,
      });

      const cierreCreado = await prisma.cierreCaja.create({
        data: {
          turnoId: id,
          montoEsperado: efectivoEsperado,
          montoReal: efectivoContado,
          diferencia,
          usuarioId: this.usuario(usuarioId),
          resumen,
        },
      });

      const turnoCerrado = await prisma.turnoCaja.update({
        where: { id },
        data: { estado: 'CERRADA', cerradoAt: new Date() },
      });

      return { turno: turnoCerrado, arqueo, cierre: cierreCreado, resumen };
    });

    this.logger.log({
      operation: 'cerrarTurno',
      aggregateId: id,
      message: 'Turno de caja cerrado.',
    } satisfies OperableLog);
    return {
      turno: this.mapTurno(cierre.turno),
      arqueo: this.mapArqueo(cierre.arqueo),
      cierre: this.mapCierre(cierre.cierre),
      resumen: cierre.resumen,
    };
  }

  async registrarPago(
    command: PagarCuentaCajaCommand,
    usuarioId?: string | null,
    cajeroNombre?: string | null,
  ): Promise<{ message?: string; transaccion: TransaccionDto; ticket?: unknown; turno: unknown }> {
    const turno = await this.prisma.turnoCaja.findFirst({
      where: { estado: 'ABIERTA' },
      orderBy: { abiertoAt: 'desc' },
    });
    if (!turno) {
      throw new BadRequestException('No hay turno de caja abierto.');
    }

    let cuentaRemota: CuentaRemota;
    try {
      cuentaRemota = await this.cuentasHttp.fetchCuenta(command.cuentaId);
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number }; code?: string };
      if (axiosError.response?.status === 404) {
        throw new NotFoundException(`Cuenta ${command.cuentaId} no encontrada.`);
      }
      throw new ServiceUnavailableException('No se pudo obtener la cuenta. Reintente.');
    }

    const descuento = this.money(command.descuento ?? 0);
    const montoRecibido = this.money(command.montoRecibido);
    const totalConDescuento = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      this.money(cuentaRemota.total).minus(descuento),
    );

    if (!montoRecibido.equals(totalConDescuento)) {
      throw new BadRequestException(
        `El pago debe cubrir el total exacto. Total con descuento: ${totalConDescuento.toNumber()}, recibido: ${montoRecibido.toNumber()}.`,
      );
    }

    const transaccion = await this.prisma.$transaction(async (prisma: import('../generated/prisma').Prisma.TransactionClient) => {
      // classid 1234 compartido entre servicios A PROPOSITO: cada servicio tiene su propia BD (database-per-service), el espacio de locks no se cruza.
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${command.cuentaId}), 1, 8))::bit(32)::int)`;

      const cuenta = await prisma.cuentaAbierta.upsert({
        where: { cuentaId: command.cuentaId },
        create: {
          cuentaId: cuentaRemota.id,
          mesaId: cuentaRemota.mesaId,
          total: cuentaRemota.total,
          estado: cuentaRemota.estado,
        },
        update: {
          total: cuentaRemota.total,
          estado: cuentaRemota.estado,
          mesaId: cuentaRemota.mesaId,
        },
      });

      if (cuenta.estado !== 'ABIERTA') {
        throw new BadRequestException(`La cuenta ya está ${cuenta.estado.toLowerCase()}.`);
      }

      const pagosPrevios = await prisma.transaccion.aggregate({
        where: { cuentaId: command.cuentaId },
        _sum: { monto: true },
      });
      const montoTotalPagado = this.money(pagosPrevios._sum.monto ?? 0);

      if (montoTotalPagado.greaterThan(0)) {
        throw new BadRequestException('La cuenta ya tiene un pago registrado.');
      }

      const tx = await prisma.transaccion.create({
        data: {
          cuentaId: command.cuentaId,
          turnoId: turno.id,
          mesaId: cuenta.mesaId,
          monto: montoRecibido,
          descuento,
          metodo: command.metodo,
          referencia: command.referencia,
          notas: command.notas,
          usuarioId: usuarioId ?? undefined,
          cajeroNombre: cajeroNombre ?? undefined,
        },
      });

      await prisma.movimientoCaja.create({
        data: {
          turnoId: turno.id,
          tipo: 'VENTA',
          cuentaId: command.cuentaId,
          transaccionId: tx.id,
          mesaId: cuenta.mesaId,
          donde: command.mesaNumero ? `Mesa ${command.mesaNumero}` : `Mesa ${cuenta.mesaId}`,
          metodo: command.metodo,
          monto: montoRecibido,
          descuento,
          propina: this.money(command.propina ?? 0),
          motivo: command.notas,
        },
      });

      const payload: PagoRegistradoPayload = {
        transaccionId: tx.id,
        cuentaId: command.cuentaId,
        mesaId: cuenta.mesaId,
        monto: montoRecibido.toNumber(),
        metodo: command.metodo,
      };

      await prisma.outboxEvent.create({
        data: {
          routingKey: RoutingKeys.PagoRegistrado,
          payload: JSON.stringify(payload),
          status: 'PENDING',
        },
      });

      return tx;
    });

    let ticket: unknown;
    const cierreStart = Date.now();
    try {
      const cierre = await this.cuentasHttp.cerrarCuenta(command.cuentaId, descuento.toNumber());
      ticket = (cierre as Record<string, unknown>)?.ticket;
      await this.prisma.cuentaAbierta.update({
        where: { cuentaId: command.cuentaId },
        data: { estado: 'CERRADA', total: totalConDescuento },
      });
    } catch (error) {
      this.pagosCierrePendienteCounter.inc();
      // Ruta de dinero: el pago SÍ se persistió, la cuenta queda en un estado
      // degradado real (PAGO_SIN_CIERRE_CONFIRMADO) → resultingState es fiel y
      // dispara la reconciliación. aggregateId=cuentaId es la clave de búsqueda
      // de soporte; el id de transacción queda en el message.
      this.logger.warn({
        operation: 'cerrarCuenta',
        aggregateId: command.cuentaId,
        dependency: 'cuentas',
        durationMs: Date.now() - cierreStart,
        errorCode: 'CIERRE_REMOTO_FAILED',
        resultingState: 'PAGO_SIN_CIERRE_CONFIRMADO',
        message: `Pago ${transaccion.id} registrado; cierre remoto de cuenta pendiente: ${(error as Error).message}`,
      } satisfies OperableLog);
    }

    const transaccionDto = this.mapTransaccion(transaccion);
    this.pagosCounter.inc({ metodo: command.metodo });
    this.pagoMontoHistogram.observe({ metodo: command.metodo }, montoRecibido.toNumber());
    this.logger.log({
      operation: 'registrarPago',
      aggregateId: command.cuentaId,
      message: 'Pago registrado para la cuenta.',
    } satisfies OperableLog);
    return {
      message: ticket ? 'Pago registrado, cuenta cerrada y ticket generado' : 'Pago registrado; cierre de cuenta en proceso',
      transaccion: transaccionDto,
      ticket,
      turno: this.mapTurno(turno),
    };
  }

  async listarTransacciones(query: ListarTransaccionesQuery = {}): Promise<TransaccionListResponse> {
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.TransaccionWhereInput = {
      ...(query.metodo ? { metodo: query.metodo } : {}),
      ...(query.updatedSince
        ? { createdAt: { gte: new Date(query.updatedSince) } }
        : {}),
    };

    const transacciones = await this.prisma.transaccion.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = transacciones.length > limit;
    const data = transacciones.slice(0, limit);

    return {
      data: data.map((t) => this.mapTransaccion(t)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  async obtenerTransaccion(id: string): Promise<TransaccionDto> {
    const transaccion = await this.prisma.transaccion.findUnique({ where: { id } });
    if (!transaccion) {
      throw new NotFoundException(`Transacción ${id} no encontrada.`);
    }
    return this.mapTransaccion(transaccion);
  }

  /**
   * Edición acotada a método de pago y notas — el monto/descuento de una
   * transacción ya cerrada queda fijo a propósito (cambiar el monto después
   * de cerrada rompería el cuadre de caja del turno). Si cambia el método,
   * también se corrige el MovimientoCaja vinculado: "Ingresos por método" y
   * "Efectivo esperado" en el resumen del turno se calculan desde ahí, no
   * desde la Transacción — sin este paso el cambio se vería pero no cuadraría.
   */
  async actualizarTransaccion(
    id: string,
    command: ActualizarTransaccionCommand,
  ): Promise<{ message: string; transaccion: TransaccionDto }> {
    const existente = await this.prisma.transaccion.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException(`Transacción ${id} no encontrada.`);
    }

    const data: { metodo?: string; notas?: string | null } = {};
    if (command.metodo !== undefined) data.metodo = command.metodo;
    if (command.notas !== undefined) data.notas = command.notas;

    const transaccion = await this.prisma.$transaction(async (prisma) => {
      const actualizada = await prisma.transaccion.update({ where: { id }, data });
      if (command.metodo !== undefined) {
        await prisma.movimientoCaja.updateMany({
          where: { transaccionId: id },
          data: { metodo: command.metodo },
        });
      }
      return actualizada;
    });

    this.logger.log({
      operation: 'actualizarTransaccion',
      aggregateId: id,
      message: `Transacción actualizada (metodo=${command.metodo ?? 'sin cambio'}).`,
    } satisfies OperableLog);

    return { message: 'Transacción actualizada', transaccion: this.mapTransaccion(transaccion) };
  }

  /** Historial de turnos (p.ej. cierres de caja pasados). Sin filtro de estado, lista todos. */
  async listarTurnos(query: ListarTurnosQuery = {}): Promise<TurnoListResponse> {
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.TurnoCajaWhereInput = {
      ...(query.estado ? { estado: query.estado } : {}),
      ...(query.desde || query.hasta
        ? {
            cerradoAt: {
              ...(query.desde ? { gte: new Date(query.desde) } : {}),
              ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
            },
          }
        : {}),
    };

    const turnos = await this.prisma.turnoCaja.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ abiertoAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = turnos.length > limit;
    const data = turnos.slice(0, limit);

    return {
      data: data.map((t) => this.mapTurno(t)),
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    };
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private buildResumen(turno: import('../generated/prisma').TurnoCaja & { movimientos?: import('../generated/prisma').MovimientoCaja[], arqueos?: import('../generated/prisma').ArqueoCaja[], cierre?: import('../generated/prisma').CierreCaja | null }) {
    const movimientos = Array.isArray(turno.movimientos) ? turno.movimientos : [];
    const ventas = movimientos.filter((m: import('../generated/prisma').MovimientoCaja) => m.tipo === 'VENTA');
    const ingresos = movimientos.filter((m: import('../generated/prisma').MovimientoCaja) => m.tipo === 'INGRESO');
    const egresos = movimientos.filter((m: import('../generated/prisma').MovimientoCaja) => m.tipo === 'EGRESO');
    const totalVentas = this.sum(ventas.map((m: import('../generated/prisma').MovimientoCaja) => m.monto));
    const totalIngresos = this.sum(ingresos.map((m: import('../generated/prisma').MovimientoCaja) => m.monto));
    const totalEgresos = this.sum(egresos.map((m: import('../generated/prisma').MovimientoCaja) => m.monto));
    const propinas = this.sum(movimientos.map((m: import('../generated/prisma').MovimientoCaja) => m.propina ?? 0));
    const porMetodo = this.emptyMetodoTotals();

    ventas.forEach((m: import('../generated/prisma').MovimientoCaja) => {
      if (m.metodo in porMetodo) porMetodo[m.metodo] += this.n(m.monto);
    });

    return {
      turno: this.mapTurno(turno),
      movimientos: movimientos.map((m: import('../generated/prisma').MovimientoCaja) => this.mapMovimiento(m)),
      ventas: ventas.map((m: import('../generated/prisma').MovimientoCaja) => this.mapMovimiento(m)),
      totalVentas: totalVentas.toNumber(),
      totalEgresos: totalEgresos.toNumber(),
      totalIngresos: totalIngresos.toNumber(),
      propinas: propinas.toNumber(),
      porMetodo,
      efectivoEsperado: this.computeEfectivoEsperado(movimientos).toNumber(),
      comprobantes: ventas.length,
      pendientes: 0,
      arqueo: turno.arqueos?.[0] ? this.mapArqueo(turno.arqueos[0]) : null,
      cierre: turno.cierre ? this.mapCierre(turno.cierre) : null,
    };
  }

  private computeEfectivoEsperado(movimientos: import('../generated/prisma').MovimientoCaja[]) {
    return this.sum(
      movimientos
        .filter((m) => m.metodo === 'EFECTIVO')
        .map((m) => this.money(m.monto).plus(this.money(m.propina ?? 0))),
    );
  }

  private sum(values: unknown[]) {
    return values.reduce(
      (acc: Prisma.Decimal, value) => acc.plus(this.money(value as never)),
      new Prisma.Decimal(0),
    );
  }

  private sumDenominaciones(denominaciones: Record<string, number>) {
    return Object.entries(denominaciones).reduce((acc, [denom, count]) => {
      const d = Number(denom);
      const q = Number(count);
      if (!Number.isFinite(d) || !Number.isFinite(q) || q < 0) return acc;
      return acc.plus(new Prisma.Decimal(d).times(q));
    }, new Prisma.Decimal(0));
  }

  private emptyMetodoTotals() {
    return METODOS.reduce((acc, metodo) => {
      acc[metodo] = 0;
      return acc;
    }, {} as Record<string, number>);
  }

  private mapTransaccion(t: import('../generated/prisma').Transaccion): TransaccionDto {
    return {
      id: t.id,
      cuentaId: t.cuentaId,
      monto: this.n(t.monto),
      descuento: this.n(t.descuento),
      metodo: t.metodo,
      referencia: t.referencia || undefined,
      notas: t.notas || undefined,
      usuarioId: t.usuarioId || undefined,
      cajeroNombre: t.cajeroNombre || undefined,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private mapTurno(t: import('../generated/prisma').TurnoCaja) {
    return {
      id: t.id,
      cajaId: t.cajaId,
      cajaNombre: t.cajaNombre,
      usuarioId: t.usuarioId,
      cajeroNombre: t.cajeroNombre ?? null,
      fondoInicial: this.n(t.fondoInicial),
      estado: t.estado,
      abiertoAt: t.abiertoAt.toISOString(),
      cerradoAt: t.cerradoAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private mapMovimiento(m: import('../generated/prisma').MovimientoCaja) {
    return {
      id: m.id,
      turnoId: m.turnoId,
      tipo: m.tipo,
      cuentaId: m.cuentaId ?? null,
      transaccionId: m.transaccionId ?? null,
      mesaId: m.mesaId ?? null,
      donde: m.donde,
      metodo: m.metodo,
      monto: this.n(m.monto),
      descuento: this.n(m.descuento),
      propina: this.n(m.propina),
      motivo: m.motivo ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private mapArqueo(a: import('../generated/prisma').ArqueoCaja) {
    return {
      id: a.id,
      turnoId: a.turnoId,
      denominaciones: a.denominaciones,
      efectivoEsperado: this.n(a.efectivoEsperado),
      efectivoContado: this.n(a.efectivoContado),
      diferencia: this.n(a.diferencia),
      usuarioId: a.usuarioId,
      createdAt: a.createdAt.toISOString(),
    };
  }

  private mapCierre(c: import('../generated/prisma').CierreCaja) {
    return {
      id: c.id,
      turnoId: c.turnoId ?? null,
      montoEsperado: this.n(c.montoEsperado),
      montoReal: this.n(c.montoReal),
      diferencia: this.n(c.diferencia),
      usuarioId: c.usuarioId,
      resumen: c.resumen ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
