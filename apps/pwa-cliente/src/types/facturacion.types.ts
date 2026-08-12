// types/facturacion.types.ts — DTOs de servicio-facturacion (emisión SUNAT)
//
// Sin @org/contracts: servicio-facturacion no tiene dominio ahí todavía y
// esta pantalla es admin-only, autocontenida (mismo criterio que
// cuenta.types.ts/caja.types.ts). `total`/`subtotal`/`igv` llegan como
// Prisma.Decimal → string en los endpoints de listado (no en emitir(), que
// sí normaliza a number en el backend) — se tipan `number | string` y se
// envuelven en Number(...) al renderizar.

export type TipoComprobante = 'BOLETA' | 'FACTURA';
export type EstadoComprobantePago = 'DISPONIBLE' | 'EMITIDO';
export type EstadoComprobante = 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'OBSERVADO';

export interface ItemComprobantePago {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface EmpresaComprobanteDto {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string | null;
}

export interface ComprobanteDto {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  clienteRuc: string | null;
  clienteDni: string | null;
  clienteRazonSocial: string | null;
  clienteNombre: string | null;
  subtotal: number | string;
  igv: number | string;
  total: number | string;
  estado: EstadoComprobante;
  motivoRechazo: string | null;
  createdAt: string;
  empresa: EmpresaComprobanteDto;
}

export interface ComprobantePagoDto {
  id: string;
  cuentaId: string;
  sedeId: string;
  mesaId: string;
  total: number | string;
  items: ItemComprobantePago[] | null;
  meseroNombre: string | null;
  estado: EstadoComprobantePago;
  fecha: string;
  comprobante?: ComprobanteDto | null;
}

export interface EmpresaDto {
  id: string;
  slot: number;
  ruc: string;
  razonSocial: string;
  activo: boolean;
}

export interface EmitirComprobantePayload {
  tipoComprobante: TipoComprobante;
  empresaRuc: string;
  clienteRuc?: string;
  clienteRazonSocial?: string;
  clienteDni?: string;
  clienteNombre?: string;
}

export interface EmitirComprobanteResultado {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  estado: EstadoComprobante;
  total: number;
}
