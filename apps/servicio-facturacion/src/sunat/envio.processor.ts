import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SunatSoapClient } from './sunat-soap.client';
import { SunatConfigService } from './sunat-config.service';
import { RoutingKeys, type AcceptedReceiptPrintPayload } from '@org/contracts';

// Catálogo 01 SUNAT (tipo de documento) — usado en el nombre de archivo del
// envío (RUC-tipo-serie-correlativo), no dentro del XML mismo.
const CODIGO_TIPO_ARCHIVO: Record<string, string> = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
};

interface ComprobantePendiente {
  id: string;
  empresaId: string;
  tipo: string;
  serie: string;
  correlativo: number;
  xmlFirmado: string;
  intentos: number;
  createdAt: Date;
  clienteRuc: string | null;
  clienteDni: string | null;
  clienteRazonSocial: string | null;
  clienteNombre: string | null;
  subtotal: { toString(): string };
  igv: { toString(): string };
  total: { toString(): string };
  empresa: { ruc: string; slot: number; razonSocial: string; nombreComercial: string | null; direccion: string | null };
  comprobantePago: { sedeId: string; items: unknown } | null;
}

function receiptPayload(comprobante: ComprobantePendiente): AcceptedReceiptPrintPayload | null {
  if ((comprobante.tipo !== 'BOLETA' && comprobante.tipo !== 'FACTURA') || !comprobante.comprobantePago?.sedeId) return null;
  const rawItems = Array.isArray(comprobante.comprobantePago.items) ? comprobante.comprobantePago.items : [];
  const items = rawItems.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({ nombre: String(item.nombre ?? ''), cantidad: Number(item.cantidad), precioUnitario: Number(item.precioUnitario) }))
    .filter((item) => item.nombre && Number.isFinite(item.cantidad) && item.cantidad > 0 && Number.isFinite(item.precioUnitario));
  return {
    comprobanteId: comprobante.id, sedeId: comprobante.comprobantePago.sedeId,
    tipo: comprobante.tipo, serie: comprobante.serie, correlativo: comprobante.correlativo,
    createdAt: comprobante.createdAt.toISOString(),
    emisor: { ruc: comprobante.empresa.ruc, razonSocial: comprobante.empresa.razonSocial,
      nombreComercial: comprobante.empresa.nombreComercial, direccion: comprobante.empresa.direccion },
    cliente: { ruc: comprobante.clienteRuc, dni: comprobante.clienteDni,
      razonSocial: comprobante.clienteRazonSocial, nombre: comprobante.clienteNombre },
    items, subtotal: Number(comprobante.subtotal), igv: Number(comprobante.igv), total: Number(comprobante.total),
  };
}

/**
 * Envía a SUNAT los comprobantes ya firmados (FIRMADO → ENVIADO/ACEPTADO).
 * MVP: usa sendBill (envío individual) para boleta y factura por igual —
 * correcto, pero no el patrón de mayor throughput para boletas de alto
 * volumen. Agrupar boletas del día en un `sendSummary` (resumen diario) es
 * la mejora natural una vez que el flujo individual esté validado en beta.
 */
@Injectable()
export class EnvioProcessor {
  private readonly logger = new Logger(EnvioProcessor.name);
  private procesando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly soap: SunatSoapClient,
    private readonly config: SunatConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async enviarPendientes(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;
    try {
      const pendientes = await this.prisma.comprobante.findMany({
        where: { estado: 'FIRMADO', intentos: { lt: 5 } },
        include: { empresa: true, comprobantePago: true },
        take: 20,
      });

      for (const comprobante of pendientes as unknown as ComprobantePendiente[]) {
        if (!(await this.config.tieneCredenciales(comprobante.empresa.slot))) {
          // No es un error del comprobante: la empresa aún no tiene
          // certificado configurado. Se deja en FIRMADO sin gastar intentos.
          continue;
        }
        await this.enviarUno(comprobante);
      }
    } catch (error) {
      this.logger.error('Error en el ciclo de envío a SUNAT', error as Error);
    } finally {
      this.procesando = false;
    }
  }

  private async enviarUno(comprobante: ComprobantePendiente): Promise<void> {
    const codigoTipo = CODIGO_TIPO_ARCHIVO[comprobante.tipo] ?? '03';
    const nombreArchivo = `${comprobante.empresa.ruc}-${codigoTipo}-${comprobante.serie}-${comprobante.correlativo}`;
    try {
      const creds = await this.config.credencialesParaSlot(comprobante.empresa.slot);
      const resultado = await this.soap.enviarComprobante({
        ruc: comprobante.empresa.ruc,
        solUsuario: creds.solUsuario,
        solClave: creds.solClave,
        nombreArchivo,
        xmlFirmado: comprobante.xmlFirmado,
      });

      // The accepted state and its outbox event must commit together; otherwise
      // a transient DB error could permanently lose the automatic receipt.
      await this.prisma.$transaction(async (tx) => {
        await tx.comprobante.update({
          where: { id: comprobante.id },
          data: {
            estado: resultado.cdrBase64 ? 'ACEPTADO' : 'ENVIADO',
            cdrXml: resultado.cdrBase64 ?? null,
            intentos: { increment: 1 },
          },
        });
        if (resultado.cdrBase64) {
          await tx.outboxEvent.create({
            data: {
              routingKey: RoutingKeys.ComprobanteEmitido,
              payload: JSON.stringify({
                comprobanteId: comprobante.id,
                empresaRuc: comprobante.empresa.ruc,
                tipo: comprobante.tipo,
                serie: comprobante.serie,
                correlativo: comprobante.correlativo,
                ...receiptPayload(comprobante),
              }),
              status: 'PENDING',
            },
          });
        }
      });

      this.logger.log(
        `Comprobante ${nombreArchivo} enviado a SUNAT (${resultado.cdrBase64 ? 'ACEPTADO' : 'ENVIADO, pendiente de CDR'})`,
      );
    } catch (error) {
      await this.prisma.comprobante.update({
        where: { id: comprobante.id },
        data: {
          intentos: { increment: 1 },
          motivoRechazo: (error as Error).message?.slice(0, 500),
        },
      });
      this.logger.error(`Fallo enviando ${nombreArchivo} a SUNAT (intento ${comprobante.intentos + 1})`, error as Error);
    }
  }
}
