import { PrintQueueService } from './print-queue.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PedidoDto } from '@org/contracts';

const destination = { id: 'd1', sedeId: 's1', station: 'COCINA', agentId: 'restaurante',
  transport: 'NETWORK', printerName: null, host: '192.168.1.40', port: 9100,
  paperWidth: 80, copies: 1, enabled: true };
const pedido = { id: 'p1', sedeId: 's1', mesaId: 'm1', items: [
  { id: 'i1', productoId: 'pl1', nombre: 'Ceviche', cantidad: 1, precioUnitario: 30, area: 'COCINA' },
] } as PedidoDto;

function setup() {
  const db = {
    printerDestination: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    printJob: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  };
  const queue = new PrintQueueService(db as unknown as PrismaService);
  return { queue, db };
}

describe('cola de impresión', () => {
  it('no activa un destino nuevo por defecto y obliga IP privada', async () => {
    const { queue, db } = setup();
    db.printerDestination.upsert.mockResolvedValue(destination);
    await expect(queue.saveDestination('s1', 'COCINA', { transport: 'NETWORK', host: '8.8.8.8' })).rejects.toThrow('IP privada');
    await queue.saveDestination('s1', 'COCINA', { transport: 'NETWORK', host: '192.168.1.40' });
    expect(db.printerDestination.upsert.mock.calls[0][0].create.enabled).toBe(false);
  });

  it('crea una sola comanda por evento/estación y falla claramente si falla DB', async () => {
    const { queue, db } = setup();
    db.printerDestination.findMany.mockResolvedValue([destination]);
    db.printJob.create.mockResolvedValue({ id: 'j1' });
    await queue.enqueueOrder(pedido, 'evt-1');
    expect(db.printJob.create.mock.calls[0][0].data.sourceKey).toBe('evt-1:COCINA');
    expect(db.printJob.create.mock.calls[0][0].data.payloadBase64).toBeTruthy();
    db.printJob.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(queue.enqueueOrder(pedido, 'evt-1')).resolves.toBeUndefined();
    db.printJob.create.mockRejectedValueOnce(new Error('DB caída'));
    await expect(queue.enqueueOrder(pedido, 'evt-2')).rejects.toThrow('DB caída');
  });

  it('envía solo comprobantes aceptados válidos a su impresora física de 80 mm y deduplica', async () => {
    const { queue, db } = setup();
    db.printerDestination.findUnique.mockResolvedValue({ ...destination, station: 'COMPROBANTES', paperWidth: 80 });
    db.printJob.create.mockResolvedValue({ id: 'r1' });
    const receipt = { comprobanteId: 'c1', sedeId: 's1', tipo: 'BOLETA' as const,
      serie: 'B001', correlativo: 1, createdAt: '2026-09-23T12:00:00Z',
      emisor: { ruc: '20123456789', razonSocial: 'Mi Narcita', nombreComercial: null, direccion: null },
      cliente: { ruc: null, dni: null, razonSocial: null, nombre: null },
      items: [{ nombre: 'Ceviche', cantidad: 1, precioUnitario: 30 }], subtotal: 25.42, igv: 4.58, total: 30 };
    await queue.enqueueReceipt(receipt);
    expect(db.printJob.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      sourceKey: 'receipt:c1:COMPROBANTES', station: 'COMPROBANTES', destinationId: 'd1',
    }));
    const decoded = Buffer.from(db.printJob.create.mock.calls[0][0].data.payloadBase64, 'base64').toString('ascii');
    expect(decoded).toContain('BOLETA DE VENTA ELECTRONICA');
    db.printJob.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(queue.enqueueReceipt(receipt)).resolves.toBeUndefined();
    db.printerDestination.findUnique.mockResolvedValueOnce({ ...destination, enabled: false });
    await queue.enqueueReceipt(receipt);
    expect(db.printJob.create).toHaveBeenCalledTimes(2);
    await queue.enqueueReceipt({ ...receipt, tipo: 'NOTA_CREDITO' as any });
    expect(db.printJob.create).toHaveBeenCalledTimes(2);
  });

  it('reclama con token nuevo y confirma solo el lease vigente', async () => {
    const { queue, db } = setup();
    const job = { id: 'j1', sourceKey: 'e1:COCINA', status: 'PENDING', leaseToken: null, attempts: 0,
      payloadBase64: 'dGVzdA==', destination };
    db.printJob.findFirst.mockResolvedValue(job);
    db.printJob.updateMany.mockResolvedValue({ count: 1 });
    const claim = await queue.claim('restaurante');
    expect(claim?.destination.host).toBe('192.168.1.40');
    expect(claim?.leaseToken).toBeTruthy();
    expect(db.printJob.updateMany.mock.calls[0][0].data.status).toBe('UNCERTAIN');
    expect(db.printJob.updateMany.mock.calls[1][0].where).toEqual({ id: 'j1', status: 'PENDING', leaseToken: null });
    db.printJob.findFirst.mockResolvedValue({ ...job, status: 'CLAIMED', leaseToken: claim?.leaseToken,
      leaseUntil: new Date(Date.now() + 60_000) });
    await expect(queue.acknowledge('restaurante', 'j1', 'incorrecto', true)).rejects.toThrow('Lease');
    await expect(queue.acknowledge('restaurante', 'j1', claim!.leaseToken, true)).resolves.toEqual({ ok: true });
    expect(db.printJob.updateMany.mock.calls[2][0].data.status).toBe('PRINTED');
  });

  it('rechaza clave de agente ausente o incorrecta', () => {
    const { queue } = setup();
    process.env['PRINT_AGENT_KEY'] = 'x'.repeat(32);
    expect(() => queue.assertAgentKey('no')).toThrow('Agente no autorizado');
    expect(() => queue.assertAgentKey('x'.repeat(32))).not.toThrow();
    delete process.env['PRINT_AGENT_KEY'];
  });
});
