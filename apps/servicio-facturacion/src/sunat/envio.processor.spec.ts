import 'reflect-metadata';
import { RoutingKeys } from '@org/contracts';
import { EnvioProcessor } from './envio.processor';
import type { PrismaService } from '../prisma/prisma.service';
import type { SunatSoapClient } from './sunat-soap.client';
import type { SunatConfigService } from './sunat-config.service';

const document = {
  id: 'comp-1', tipo: 'BOLETA', serie: 'B001', correlativo: 42,
  empresaId: 'e1', xmlFirmado: '<xml/>', intentos: 0, createdAt: new Date('2026-09-23T12:00:00Z'),
  clienteRuc: null, clienteDni: '12345678', clienteRazonSocial: null, clienteNombre: 'Ana',
  subtotal: 25.42, igv: 4.58, total: 30,
  empresa: { ruc: '20123456789', slot: 1, razonSocial: 'Mi Narcita SAC', nombreComercial: 'Mi Narcita', direccion: 'Piura' },
  comprobantePago: { sedeId: 's1', items: [{ nombre: 'Ceviche', cantidad: 1, precioUnitario: 30 }] },
};

function setup(cdrBase64: string | null) {
  const tx = { comprobante: { update: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = {
    comprobante: { findMany: jest.fn().mockResolvedValue([document]), update: jest.fn() },
    $transaction: jest.fn((callback: (value: typeof tx) => Promise<void>) => callback(tx)),
  };
  const soap = { enviarComprobante: jest.fn().mockResolvedValue({ cdrBase64 }) };
  const config = { tieneCredenciales: jest.fn().mockResolvedValue(true), credencialesParaSlot: jest.fn().mockResolvedValue({ solUsuario: 'user', solClave: 'test' }) };
  const processor = new EnvioProcessor(prisma as unknown as PrismaService, soap as unknown as SunatSoapClient, config as unknown as SunatConfigService);
  return { processor, prisma, tx };
}

describe('impresión automática de comprobante tras CDR SUNAT', () => {
  it('publica datos fiscales de la boleta junto con el estado ACEPTADO en una transacción', async () => {
    const { processor, prisma, tx } = setup('Y2Ry');
    await processor.enviarPendientes();
    expect(prisma.comprobante.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { empresa: true, comprobantePago: true } }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.comprobante.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: 'ACEPTADO' }) }));
    const event = tx.outboxEvent.create.mock.calls[0][0].data;
    expect(event.routingKey).toBe(RoutingKeys.ComprobanteEmitido);
    expect(JSON.parse(event.payload)).toEqual(expect.objectContaining({
      comprobanteId: 'comp-1', sedeId: 's1', tipo: 'BOLETA', total: 30,
      emisor: expect.objectContaining({ ruc: '20123456789' }),
      items: [{ nombre: 'Ceviche', cantidad: 1, precioUnitario: 30 }],
    }));
  });

  it('no imprime antes de recibir CDR', async () => {
    const { processor, tx } = setup(null);
    await processor.enviarPendientes();
    expect(tx.comprobante.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: 'ENVIADO' }) }));
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
