/** Wire contract between the VPS print queue and the outbound Windows agent. */
export type PrinterStation = 'COCINA' | 'BAR' | 'COMPROBANTES';
export type PrinterTransport = 'USB' | 'NETWORK';

export interface PrinterDestinationDto {
  id: string;
  sedeId: string;
  station: PrinterStation;
  agentId: string;
  transport: PrinterTransport;
  printerName: string | null;
  host: string | null;
  port: number | null;
  paperWidth: 58 | 80;
  copies: number;
  enabled: boolean;
}

export interface PrinterJobDto {
  id: string;
  leaseToken: string;
  station: PrinterStation;
  destination: PrinterDestinationDto;
  payloadBase64: string;
}

/** Fiscal document accepted by SUNAT; emitted only after a CDR is received. */
export interface AcceptedReceiptPrintPayload {
  comprobanteId: string;
  sedeId: string;
  tipo: 'BOLETA' | 'FACTURA';
  serie: string;
  correlativo: number;
  createdAt: string;
  emisor: { ruc: string; razonSocial: string; nombreComercial: string | null; direccion: string | null };
  cliente: { ruc: string | null; dni: string | null; razonSocial: string | null; nombre: string | null };
  items: { nombre: string; cantidad: number; precioUnitario: number }[];
  subtotal: number;
  igv: number;
  total: number;
}
