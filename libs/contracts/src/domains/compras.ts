import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ── Proveedores ──────────────────────────────────────────────────

export class ProveedorDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  nombre: string;
  @IsOptional()
  @IsString()
  ruc?: string | null;
  @IsOptional()
  @IsString()
  categoria?: string | null;
  @IsOptional()
  @IsString()
  contacto?: string | null;
  @IsOptional()
  @IsString()
  telefono?: string | null;
  @IsOptional()
  @IsString()
  diasEntrega?: string | null;
  @IsOptional()
  @IsString()
  condicionPago?: string | null;
  @IsBoolean()
  activo: boolean;
  @IsString()
  createdAt: string;
}

export class ListarProveedoresQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  activo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class ProveedorListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProveedorDto)
  data: ProveedorDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearProveedorCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsOptional()
  @IsString()
  ruc?: string;
  @IsOptional()
  @IsString()
  categoria?: string;
  @IsOptional()
  @IsString()
  contacto?: string;
  @IsOptional()
  @IsString()
  telefono?: string;
  @IsOptional()
  @IsString()
  diasEntrega?: string;
  @IsOptional()
  @IsString()
  condicionPago?: string;
}

export class ActualizarProveedorCommand {
  @IsOptional()
  @IsString()
  nombre?: string;
  @IsOptional()
  @IsString()
  ruc?: string | null;
  @IsOptional()
  @IsString()
  categoria?: string | null;
  @IsOptional()
  @IsString()
  contacto?: string | null;
  @IsOptional()
  @IsString()
  telefono?: string | null;
  @IsOptional()
  @IsString()
  diasEntrega?: string | null;
  @IsOptional()
  @IsString()
  condicionPago?: string | null;
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ── Insumos (lo que se COMPRA; distinto de Producto = lo que se VENDE) ────

export class InsumoDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  nombre: string;
  @IsString()
  unidad: string;
  @IsNumber()
  stockActual: number;
  @IsNumber()
  stockMinimo: number;
  @IsNumber()
  costoUnitario: number;
  @IsOptional()
  @IsString()
  proveedorId?: string | null;
  @IsOptional()
  @IsString()
  proveedorNombre?: string | null;
  /** Puente opcional al catálogo de venta (servicio-inventario). null = insumo
   * crudo que no se revende tal cual. */
  @IsOptional()
  @IsString()
  productoId?: string | null;
  @IsNumber()
  factorConversion: number;
  @IsBoolean()
  activo: boolean;
  @IsString()
  createdAt: string;
}

export class ListarInsumosQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  bajoMinimo?: boolean;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class InsumoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InsumoDto)
  data: InsumoDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearInsumoCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsString()
  @IsNotEmpty()
  unidad: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockActual?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
  @IsOptional()
  @IsUUID()
  proveedorId?: string;
  @IsOptional()
  @IsUUID()
  productoId?: string;
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  factorConversion?: number;
}

export class ActualizarInsumoCommand {
  @IsOptional()
  @IsString()
  nombre?: string;
  @IsOptional()
  @IsString()
  unidad?: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
  @IsOptional()
  @IsUUID()
  proveedorId?: string | null;
  @IsOptional()
  @IsUUID()
  productoId?: string | null;
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  factorConversion?: number;
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// ── Órdenes de compra ────────────────────────────────────────────

export const OrdenCompraEstado = {
  Borrador: 'BORRADOR',
  Enviada: 'ENVIADA',
  Parcial: 'PARCIAL',
  Recibida: 'RECIBIDA',
  Anulada: 'ANULADA',
} as const;

export type OrdenCompraEstado = (typeof OrdenCompraEstado)[keyof typeof OrdenCompraEstado];

export class OrdenCompraItemDto {
  @IsString()
  id: string;
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  @IsString()
  unidad: string;
  @IsNumber()
  cantidadPedida: number;
  @IsNumber()
  cantidadRecibida: number;
  @IsNumber()
  costoUnitario: number;
}

export class OrdenCompraDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  codigo: string;
  @IsOptional()
  @IsString()
  proveedorId?: string | null;
  @IsString()
  proveedorNombre: string;
  @IsEnum(OrdenCompraEstado)
  estado: OrdenCompraEstado;
  @IsString()
  fechaEmision: string;
  @IsOptional()
  @IsString()
  fechaEnvio?: string | null;
  @IsOptional()
  @IsString()
  fechaEntregaEsperada?: string | null;
  @IsOptional()
  @IsString()
  fechaCierre?: string | null;
  @IsString()
  moneda: string;
  @IsNumber()
  total: number;
  @IsOptional()
  @IsString()
  notas?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraItemDto)
  items: OrdenCompraItemDto[];
  @IsString()
  createdAt: string;
}

export class ListarOrdenesQuery {
  @IsOptional()
  @IsEnum(OrdenCompraEstado)
  estado?: OrdenCompraEstado;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class OrdenCompraListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraDto)
  data: OrdenCompraDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class CrearOrdenCompraItemCommand {
  @IsUUID()
  insumoId: string;
  @IsNumber()
  @Min(0.001)
  cantidadPedida: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}

export class CrearOrdenCompraCommand {
  @IsOptional()
  @IsUUID()
  proveedorId?: string;
  @IsOptional()
  @IsString()
  proveedorNombre?: string;
  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string;
  @IsOptional()
  @IsString()
  notas?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOrdenCompraItemCommand)
  items: CrearOrdenCompraItemCommand[];
}

export class ActualizarOrdenCompraCommand {
  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string | null;
  @IsOptional()
  @IsString()
  notas?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOrdenCompraItemCommand)
  items?: CrearOrdenCompraItemCommand[];
}

export class CerrarOrdenCommand {
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class AnularOrdenCommand {
  @IsOptional()
  @IsString()
  motivo?: string;
}

// ── Recepciones (parciales o totales) ────────────────────────────

export class RecepcionCompraItemDto {
  @IsString()
  id: string;
  @IsString()
  ordenItemId: string;
  @IsNumber()
  cantidadRecibida: number;
  @IsNumber()
  costoUnitario: number;
}

export class RecepcionCompraDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsString()
  ordenId: string;
  @IsString()
  fecha: string;
  @IsOptional()
  @IsString()
  observaciones?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionCompraItemDto)
  items: RecepcionCompraItemDto[];
  @IsString()
  createdAt: string;
}

export class RegistrarRecepcionItemCommand {
  @IsUUID()
  ordenItemId: string;
  @IsNumber()
  @Min(0.001)
  cantidadRecibida: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}

export class RegistrarRecepcionCommand {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RegistrarRecepcionItemCommand)
  items: RegistrarRecepcionItemCommand[];
  @IsOptional()
  @IsString()
  observaciones?: string;
}

// ── Comprobantes (foto de boleta/factura) ────────────────────────

export class ComprobanteCompraDto {
  @IsString()
  id: string;
  @IsString()
  sedeId: string;
  @IsOptional()
  @IsString()
  ordenId?: string | null;
  @IsOptional()
  @IsString()
  recepcionId?: string | null;
  @IsString()
  tipo: string;
  @IsOptional()
  @IsString()
  serie?: string | null;
  @IsOptional()
  @IsString()
  numero?: string | null;
  @IsOptional()
  @IsString()
  fechaEmision?: string | null;
  @IsOptional()
  @IsNumber()
  montoTotal?: number | null;
  @IsString()
  mimeType: string;
  @IsInt()
  bytes: number;
  @IsInt()
  ancho: number;
  @IsInt()
  alto: number;
  @IsString()
  sha256: string;
  @IsOptional()
  @IsString()
  nombreOriginal?: string | null;
  @IsOptional()
  @IsString()
  usuarioId?: string | null;
  @IsOptional()
  @IsString()
  usuarioNombre?: string | null;
  @IsString()
  createdAt: string;
}

export class SubirComprobanteCommand {
  @IsOptional()
  @IsUUID()
  ordenId?: string;
  @IsOptional()
  @IsUUID()
  recepcionId?: string;
  @IsOptional()
  @IsIn(['BOLETA', 'FACTURA', 'TICKET', 'OTRO'])
  tipo?: string;
  @IsOptional()
  @IsString()
  serie?: string;
  @IsOptional()
  @IsString()
  numero?: string;
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  // multipart manda todo como string → convertir antes de @IsNumber.
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber()
  montoTotal?: number;

  /** El controller también la extrae por separado (@Query('sedeId')) para
   * resolveSedeId; declarada acá para que el whitelist del DTO no la rechace. */
  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class ListarComprobantesQuery {
  @IsOptional()
  @IsString()
  ordenId?: string;
  @IsOptional()
  @IsString()
  recepcionId?: string;
  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class ComprobanteListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComprobanteCompraDto)
  data: ComprobanteCompraDto[];
}

// ── Resumen (KPIs de la pantalla) ────────────────────────────────

export class ResumenComprasDto {
  @IsInt()
  ordenesAbiertas: number;
  @IsInt()
  ordenesPorRecibir: number;
  @IsNumber()
  montoPorRecibir: number;
  @IsNumber()
  gastoRecibido: number;
  @IsInt()
  insumosBajoMinimo: number;
}

// ── Evento: compra.recibida (Compras → Inventario) ───────────────

export class CompraRecibidaLineaPayload {
  @IsString()
  insumoId: string;
  @IsString()
  insumoNombre: string;
  /** Puente al catálogo de venta. null = insumo crudo (no toca inventario). */
  @IsOptional()
  @IsString()
  productoId?: string | null;
  /** En unidad de COMPRA (kg, pack…). Informativo. */
  @IsNumber()
  cantidadRecibida: number;
  /** cantidadRecibida × factorConversion, truncado a entero para el Int de
   * Producto.stockActual. */
  @IsInt()
  cantidadStockVenta: number;
}

export class CompraRecibidaPayload {
  @IsOptional()
  @IsString()
  eventId?: string;
  @IsString()
  recepcionId: string;
  @IsString()
  ordenId: string;
  @IsString()
  sedeId: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompraRecibidaLineaPayload)
  lineas: CompraRecibidaLineaPayload[];
}
