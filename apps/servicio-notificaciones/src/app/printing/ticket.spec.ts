import { buildAcceptedReceiptTicket, buildOrderTicket } from './ticket';
import type { AcceptedReceiptPrintPayload, PedidoDto } from '@org/contracts';

const order = {
  id: 'pedido-123456789', sedeId: 'sede-1', mesaId: 'mesa-1', numeroMesa: 5,
  items: [
    { id: '1', productoId: 'p1', nombre: 'Ceviche clásico', cantidad: 2, precioUnitario: 30, area: 'COCINA', notas: 'Sin ají' },
    { id: '2', productoId: 'p2', nombre: 'Chicha morada', cantidad: 1, precioUnitario: 8, area: 'BAR' },
    { id: '3', productoId: 'p3', nombre: 'Gaseosa', cantidad: 1, precioUnitario: 6, area: 'DIRECTO' },
  ],
} as PedidoDto;

describe('comandas ESC/POS por estación', () => {
  it('cocina recibe solo sus platos, sin productos directos ni barra', () => {
    const content = buildOrderTicket(order, 'COCINA', 80)?.toString('ascii');
    expect(content).toContain('Ceviche clasico');
    expect(content).toContain('NOTA: Sin aji');
    expect(content).not.toContain('Chicha');
    expect(content).not.toContain('Gaseosa');
    expect(content).toContain('\x1dV\x00');
  });

  it('barra recibe solo bebidas de barra', () => {
    const content = buildOrderTicket(order, 'BAR', 58)?.toString('ascii');
    expect(content).toContain('Chicha morada');
    expect(content).not.toContain('Ceviche');
  });

  it('no crea ticket vacío', () => {
    expect(buildOrderTicket({ ...order, items: order.items.filter((i) => i.area === 'DIRECTO') }, 'COCINA', 58)).toBeNull();
  });
});

export const acceptedReceipt: AcceptedReceiptPrintPayload = {
  comprobanteId: 'c1', sedeId: 'sede-1', tipo: 'FACTURA', serie: 'F001', correlativo: 12,
  createdAt: '2026-09-23T18:00:00.000Z',
  emisor: { ruc: '20123456789', razonSocial: 'Mi Narcita SAC', nombreComercial: 'Mi Narcita', direccion: 'Piura' },
  cliente: { ruc: '20987654321', dni: null, razonSocial: 'Cliente SAC', nombre: null },
  items: [{ nombre: 'Ceviche clásico', cantidad: 2, precioUnitario: 30 }],
  subtotal: 50.85, igv: 9.15, total: 60,
};

describe('representación fiscal ESC/POS de 80 mm', () => {
  it('imprime emisor, receptor, ítems, IGV y total sin inyectar comandos desde nombres', () => {
    const content = buildAcceptedReceiptTicket({ ...acceptedReceipt, items: [{ ...acceptedReceipt.items[0], nombre: 'Ceviche\x1b@ clásico' }] }).toString('ascii');
    expect(content).toContain('FACTURA ELECTRONICA');
    expect(content).toContain('RUC 20123456789');
    expect(content).toContain('RUC CLIENTE 20987654321');
    expect(content).toContain('F001-12');
    expect(content).toContain('2 x Ceviche @ clasico');
    expect(content).toContain('IGV (18%)');
    expect(content).toContain('S/ 60.00');
    expect(content).toContain('\x1dV\x00');
  });

  it('boleta sin DNI muestra cliente varios', () => {
    const content = buildAcceptedReceiptTicket({ ...acceptedReceipt, tipo: 'BOLETA', cliente: { ruc: null, dni: null, razonSocial: null, nombre: null } }).toString('ascii');
    expect(content).toContain('CLIENTE VARIOS');
    expect(content).not.toContain('RUC CLIENTE');
  });
});
