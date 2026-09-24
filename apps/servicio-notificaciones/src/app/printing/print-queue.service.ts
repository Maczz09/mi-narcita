import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { AcceptedReceiptPrintPayload, PedidoDto, PrinterDestinationDto, PrinterJobDto, PrinterStation, PrinterTransport } from '@org/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAcceptedReceiptTicket, buildOrderTicket } from './ticket';

const STATIONS: PrinterStation[] = ['COCINA', 'BAR', 'COMPROBANTES'];
const MAX_ATTEMPTS = 10;

export type DestinationInput = {
  transport?: PrinterTransport;
  printerName?: string | null;
  host?: string | null;
  port?: number | null;
  paperWidth?: number;
  copies?: number;
  enabled?: boolean;
};

@Injectable()
export class PrintQueueService {
  constructor(private readonly prisma: PrismaService) {}

  resolveSede(usuarioSedeId: string | null | undefined, requested?: string): string {
    const sedeId = usuarioSedeId || requested;
    if (!sedeId || sedeId.length > 100) throw new BadRequestException('Selecciona una sede');
    return sedeId;
  }

  assertAgentKey(provided: string | undefined): void {
    const expected = process.env['PRINT_AGENT_KEY'];
    if (!expected || expected.length < 32 || !provided) throw new UnauthorizedException('Agente no autorizado');
    const left = Buffer.from(expected);
    const right = Buffer.from(provided);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Agente no autorizado');
    }
  }

  async listDestinations(sedeId: string) {
    return this.prisma.printerDestination.findMany({ where: { sedeId }, orderBy: { station: 'asc' } });
  }

  async saveDestination(sedeId: string, station: string, body: DestinationInput) {
    if (!STATIONS.includes(station as PrinterStation)) throw new BadRequestException('Estación inválida');
    const transport = body.transport;
    const paperWidth = station === 'COMPROBANTES' ? 80 : (body.paperWidth ?? 80);
    const copies = body.copies ?? 1;
    const enabled = body.enabled ?? false;
    const printerName = body.printerName?.trim() || null;
    const host = body.host?.trim() || null;
    const port = body.port ?? 9100;
    if (transport !== 'USB' && transport !== 'NETWORK') throw new BadRequestException('Transporte inválido');
    if (paperWidth !== 58 && paperWidth !== 80) throw new BadRequestException('Ancho inválido');
    if (!Number.isInteger(copies) || copies < 1 || copies > 3) throw new BadRequestException('Copias fuera de rango');
    if (transport === 'USB' && (!printerName || printerName.length > 120)) throw new BadRequestException('Selecciona nombre de impresora Windows');
    if (transport === 'NETWORK' && (!host || !isPrivateIpv4(host) || port !== 9100)) {
      throw new BadRequestException('La impresora de red debe tener IP privada y puerto 9100');
    }
    const agentId = process.env['PRINT_AGENT_ID'] || 'restaurante';
    return this.prisma.printerDestination.upsert({
      where: { sedeId_station: { sedeId, station } },
      create: { sedeId, station, agentId, transport, printerName: transport === 'USB' ? printerName : null,
        host: transport === 'NETWORK' ? host : null, port: transport === 'NETWORK' ? port : null,
        paperWidth, copies, enabled },
      update: { agentId, transport, printerName: transport === 'USB' ? printerName : null,
        host: transport === 'NETWORK' ? host : null, port: transport === 'NETWORK' ? port : null,
        paperWidth, copies, enabled },
    });
  }

  async enqueueOrder(pedido: PedidoDto, eventId?: string): Promise<void> {
    if (!pedido?.id || !pedido.sedeId || !Array.isArray(pedido.items)) return;
    const destinations = await this.prisma.printerDestination.findMany({
      where: { sedeId: pedido.sedeId, station: { in: ['COCINA', 'BAR'] }, enabled: true },
    });
    for (const destination of destinations) {
      const station = destination.station as 'COCINA' | 'BAR';
      const payload = buildOrderTicket(pedido, station, destination.paperWidth as 58 | 80);
      if (!payload) continue;
      try {
        await this.prisma.printJob.create({ data: {
          sourceKey: `${eventId || pedido.id}:${station}`,
          sedeId: pedido.sedeId, station, destinationId: destination.id,
          payloadBase64: payload.toString('base64'),
        } });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
  }

  async enqueueReceipt(receipt: AcceptedReceiptPrintPayload): Promise<void> {
    if (!receipt?.comprobanteId || !receipt.sedeId || !['BOLETA', 'FACTURA'].includes(receipt.tipo)
      || !receipt.emisor?.ruc || !Array.isArray(receipt.items) || !Number.isFinite(receipt.total)) return;
    const destination = await this.prisma.printerDestination.findUnique({
      where: { sedeId_station: { sedeId: receipt.sedeId, station: 'COMPROBANTES' } },
    });
    if (!destination?.enabled) return;
    try {
      await this.prisma.printJob.create({ data: {
        sourceKey: `receipt:${receipt.comprobanteId}:COMPROBANTES`,
        sedeId: receipt.sedeId, station: 'COMPROBANTES', destinationId: destination.id,
        payloadBase64: buildAcceptedReceiptTicket(receipt).toString('base64'),
      } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }

  async listJobs(sedeId: string) {
    return this.prisma.printJob.findMany({ where: { sedeId },
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, station: true, status: true, attempts: true, lastError: true, createdAt: true, updatedAt: true } });
  }

  async retry(sedeId: string, id: string) {
    const result = await this.prisma.printJob.updateMany({
      where: { id, sedeId, status: { in: ['FAILED', 'UNCERTAIN'] } },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null },
    });
    if (!result.count) throw new NotFoundException('Trabajo fallido no encontrado');
    return { retried: true };
  }

  async claim(agentId: string): Promise<PrinterJobDto | null> {
    if (!agentId || agentId.length > 100) throw new BadRequestException('agentId inválido');
    const now = new Date();
    // An ambiguous timeout may mean paper was printed but the ACK was lost.
    // Never auto-reprint it. The operator must inspect and explicitly retry.
    await this.prisma.printJob.updateMany({
      where: { status: 'CLAIMED', leaseUntil: { lt: now }, destination: { agentId } },
      data: { status: 'UNCERTAIN', lastError: 'El agente no confirmó la impresión. Verificar papel antes de reintentar.' },
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await this.prisma.printJob.findFirst({
        where: { destination: { agentId, enabled: true }, attempts: { lt: MAX_ATTEMPTS },
          status: 'PENDING', nextAttemptAt: { lte: now } },
        orderBy: { createdAt: 'asc' }, include: { destination: true },
      });
      if (!candidate) return null;
      const leaseToken = randomUUID();
      const leaseUntil = new Date(Date.now() + 120_000);
      const updated = await this.prisma.printJob.updateMany({
        where: { id: candidate.id, status: candidate.status, leaseToken: candidate.leaseToken },
        data: { status: 'CLAIMED', leaseToken, leaseUntil, attempts: { increment: 1 } },
      });
      if (!updated.count) continue;
      return { id: candidate.id, leaseToken, station: candidate.station as PrinterStation,
        destination: destinationDto(candidate.destination), payloadBase64: candidate.payloadBase64 };
    }
    return null;
  }

  async acknowledge(agentId: string, id: string, leaseToken: string, ok: boolean, error?: string) {
    if (!leaseToken) throw new BadRequestException('leaseToken obligatorio');
    const job = await this.prisma.printJob.findFirst({ where: { id, destination: { agentId } } });
    if (!job || !['CLAIMED', 'UNCERTAIN'].includes(job.status) || job.leaseToken !== leaseToken) {
      throw new ConflictException('Lease expirado o desconocido');
    }
    const updated = await this.prisma.printJob.updateMany({
      where: { id, status: { in: ['CLAIMED', 'UNCERTAIN'] }, leaseToken },
      data: ok
        ? { status: 'PRINTED', leaseToken: null, leaseUntil: null, lastError: null }
        : { status: job.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          leaseToken: null, leaseUntil: null, lastError: String(error || 'Fallo de impresión').slice(0, 300),
          nextAttemptAt: new Date(Date.now() + Math.min(60_000, 2 ** job.attempts * 1000)) },
    });
    if (!updated.count) throw new ConflictException('Lease cambiado');
    return { ok: true };
  }
}

function destinationDto(value: { id: string; sedeId: string; station: string; agentId: string; transport: string; printerName: string | null; host: string | null; port: number | null; paperWidth: number; copies: number; enabled: boolean }): PrinterDestinationDto {
  return value as PrinterDestinationDto;
}

function isPrivateIpv4(ip: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}
