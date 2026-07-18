import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getOrCreateCounter, OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { CuentasHttpClient } from './cuentas-http.client';

/**
 * H-2: reconciliación automática del único hueco residual de la ruta de dinero.
 * Un pago se persiste en caja pero el cierre remoto de la cuenta puede degradarse
 * (evento `pago.registrado` FAILED / cuentas caído): la Transaccion queda escrita
 * y la CuentaAbierta sigue ABIERTA (estado PAGO_SIN_CIERRE_CONFIRMADO).
 *
 * Este cron reintenta el cierre remoto de esas cuentas. Como CuentaAbierta no
 * tiene timestamps, la antigüedad se toma de su Transaccion (sin migración). Si
 * cuentas sigue caído, el breaker del cliente hace fail-fast y el ciclo lo
 * reintenta al siguiente tick — sin reintentos propios.
 */
@Injectable()
export class CierreReconciliacionService {
  private readonly logger = new Logger(CierreReconciliacionService.name);
  // Solo cuentas cuya transacción es más vieja que este umbral: descarta pagos
  // en curso normal cuyo cierre asíncrono todavía puede llegar.
  private readonly UMBRAL_MS = 5 * 60 * 1000;
  private readonly LIMITE_POR_TICK = 20;

  private readonly reconciliadoCounter = getOrCreateCounter(
    'pagos_cierre_reconciliado_total',
    'Cierres remotos de cuenta reconciliados por el cron tras una degradación',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly cuentasHttp: CuentasHttpClient,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconciliarCierresPendientes(): Promise<void> {
    const cutoff = new Date(Date.now() - this.UMBRAL_MS);

    // La antigüedad viene de la Transaccion (CuentaAbierta no tiene timestamps).
    const transaccionesViejas = await this.prisma.transaccion.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { cuentaId: true },
      distinct: ['cuentaId'],
      take: 100,
    });
    const cuentaIds = transaccionesViejas.map((t) => t.cuentaId);
    if (cuentaIds.length === 0) return;

    const pendientes = await this.prisma.cuentaAbierta.findMany({
      where: { cuentaId: { in: cuentaIds }, estado: 'ABIERTA' },
      take: this.LIMITE_POR_TICK,
    });

    for (const cuenta of pendientes) {
      try {
        await this.cuentasHttp.cerrarCuenta(cuenta.cuentaId, 0);
        await this.prisma.cuentaAbierta.update({
          where: { cuentaId: cuenta.cuentaId },
          data: { estado: 'CERRADA' },
        });
        this.reconciliadoCounter.inc();
        this.logger.log({
          operation: 'reconciliarCierre',
          aggregateId: cuenta.cuentaId,
          dependency: 'cuentas',
          resultingState: 'CERRADA',
          message: `Cierre remoto reconciliado para cuenta ${cuenta.cuentaId}.`,
        } satisfies OperableLog);
      } catch (error) {
        // cuentas sigue caído (breaker fail-fast) → se reintenta al próximo tick.
        this.logger.warn({
          operation: 'reconciliarCierre',
          aggregateId: cuenta.cuentaId,
          dependency: 'cuentas',
          resultingState: 'PAGO_SIN_CIERRE_CONFIRMADO',
          errorCode: 'CIERRE_RECONCILIACION_PENDIENTE',
          message: `No se pudo reconciliar el cierre de ${cuenta.cuentaId}: ${(error as Error).message}`,
        } satisfies OperableLog);
      }
    }
  }
}
