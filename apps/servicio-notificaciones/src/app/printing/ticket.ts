import type { AcceptedReceiptPrintPayload, PedidoDto, PrinterStation } from '@org/contracts';

const clean = (value: unknown): string => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7e]/g, ' ').trim();

/** ESC/POS ASCII is intentional: it prints predictably on generic 58/80mm units. */
export function buildOrderTicket(pedido: PedidoDto, station: Extract<PrinterStation, 'COCINA' | 'BAR'>, width: 58 | 80): Buffer | null {
  const items = pedido.items.filter((item) => (item.area ?? 'COCINA') === station && item.estado !== 'CANCELADO');
  if (items.length === 0) return null;
  const columns = width === 58 ? 32 : 48;
  const sep = '-'.repeat(columns);
  const lines = [
    '\x1b@\x1ba\x01\x1bE\x01MI NARCITA\x1bE\x00',
    `COMANDA ${station}`,
    sep,
    pedido.numeroMesa != null ? `MESA ${pedido.numeroMesa}` : clean(pedido.modalidad || 'PEDIDO'),
    pedido.meseroNombre ? `Mesero: ${clean(pedido.meseroNombre)}` : '',
    pedido.cuentaCorrelativo ? `Atencion ${clean(pedido.cuentaCorrelativo)}` : '',
    `Pedido ${clean(pedido.id).slice(0, 12)}`,
    sep,
    '\x1ba\x00',
    ...items.flatMap((item) => [
      ...wrap(`${item.cantidad} x ${clean(item.nombre)}`, columns),
      ...(item.notas ? wrap(`  NOTA: ${clean(item.notas)}`, columns) : []),
    ]),
    sep,
    '\n\n\n\x1dV\x00',
  ].filter(Boolean);
  return Buffer.from(`${lines.join('\n')}\n`, 'ascii');
}

function wrap(text: string, columns: number): string[] {
  const result: string[] = [];
  for (let pos = 0; pos < text.length; pos += columns) result.push(text.slice(pos, pos + columns));
  return result;
}

/** 80 mm fiscal representation. Only call for a document accepted by SUNAT. */
export function buildAcceptedReceiptTicket(receipt: AcceptedReceiptPrintPayload): Buffer {
  const columns = 48;
  const sep = '-'.repeat(columns);
  const money = (value: number) => `S/ ${Number(value).toFixed(2)}`;
  const line = (label: string, value: string) => {
    const safeLabel = clean(label);
    const safeValue = clean(value);
    const spaces = Math.max(1, columns - safeLabel.length - safeValue.length);
    return `${safeLabel}${' '.repeat(spaces)}${safeValue}`;
  };
  const date = new Date(receipt.createdAt);
  const issuedAt = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-PE', { timeZone: 'America/Lima' });
  const lines = [
    '\x1b@\x1ba\x01\x1bE\x01',
    clean(receipt.emisor.nombreComercial || receipt.emisor.razonSocial).toUpperCase(),
    '\x1bE\x00',
    ...(receipt.emisor.nombreComercial ? wrap(clean(receipt.emisor.razonSocial), columns) : []),
    `RUC ${clean(receipt.emisor.ruc)}`,
    ...(receipt.emisor.direccion ? wrap(clean(receipt.emisor.direccion), columns) : []),
    sep,
    receipt.tipo === 'FACTURA' ? 'FACTURA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA',
    `${clean(receipt.serie)}-${receipt.correlativo}`,
    issuedAt,
    sep,
    '\x1ba\x00',
    receipt.tipo === 'FACTURA'
      ? `RUC CLIENTE ${clean(receipt.cliente.ruc || '')}`
      : receipt.cliente.dni ? `DNI ${clean(receipt.cliente.dni)}` : 'CLIENTE VARIOS',
    ...wrap(clean(receipt.cliente.razonSocial || receipt.cliente.nombre || ''), columns),
    sep,
    ...receipt.items.flatMap((item) => [
      ...wrap(`${item.cantidad} x ${clean(item.nombre)}`, columns),
      line('', money(item.cantidad * item.precioUnitario)),
    ]),
    sep,
    line('Op. gravada', money(receipt.subtotal)),
    line('IGV (18%)', money(receipt.igv)),
    '\x1bE\x01', line('TOTAL', money(receipt.total)), '\x1bE\x00',
    sep,
    '\x1ba\x01', 'FORMA DE PAGO: CONTADO',
    'Representacion impresa del comprobante electronico',
    '\n\n\n\x1dV\x00',
  ].filter(Boolean);
  return Buffer.from(`${lines.join('\n')}\n`, 'ascii');
}
