import { IsNumber, IsString, IsOptional, IsNotEmpty, IsInt, Min, Max, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export const MetodoPago = {
  Efectivo: 'EFECTIVO',
  Tarjeta: 'TARJETA',
  Transferencia: 'TRANSFERENCIA',
  Yape: 'YAPE',
  Plin: 'PLIN',
} as const;

export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

export class TransaccionDto {
  @IsString()
  id: string;

  @IsString()
  cuentaId: string;

  @IsNumber()
  monto: number;

  @IsNumber()
  descuento: number;

  @IsString()
  metodo: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  usuarioId?: string;

  @IsOptional()
  @IsString()
  cajeroNombre?: string;

  @IsString()
  createdAt: string;
}

export class PagarPedidoCommand {
  @IsString()
  @IsNotEmpty()
  cuentaId: string;

  @IsNumber()
  montoRecibido: number;

  @IsString()
  @IsNotEmpty()
  metodo: string;
}

export class PagoRegistradoPayload {
  @IsString()
  transaccionId: string;
  @IsString()
  cuentaId: string;
  @IsString()
  mesaId: string;
  @IsNumber()
  monto: number;
  @IsString()
  metodo: string;
  // T-16 (pagos divididos): saldo que queda por cobrar de la cuenta tras
  // este pago. Los consumidores (cuentas, pedidos) solo deben cerrar la
  // cuenta / marcar pedidos como pagados cuando llega en 0 — un pago
  // parcial no debe disparar el cierre.
  @IsNumber()
  pendiente: number;
}

export class ArqueoRealizadoPayload {
  @IsString()
  turnoId: string;
  @IsNumber()
  diferencia: number;
}

/* ── Queries ─────────────────────────────────────────── */

export class ListarTransaccionesQuery {
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
  metodo?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;
}

export class ListarTurnosQuery {
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
  estado?: string;

  /** Filtra por cerradoAt >= desde (ISO-8601). */
  @IsOptional()
  @IsDateString()
  desde?: string;

  /** Filtra por cerradoAt <= hasta (ISO-8601). */
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

/* ── Responses ───────────────────────────────────────── */

export class TransaccionListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransaccionDto)
  data: TransaccionDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

export class TurnoDto {
  @IsString()
  id: string;
  @IsString()
  cajaId: string;
  @IsString()
  cajaNombre: string;
  @IsString()
  usuarioId: string;
  @IsOptional()
  @IsString()
  cajeroNombre?: string | null;
  @IsNumber()
  fondoInicial: number;
  @IsString()
  estado: string;
  @IsString()
  abiertoAt: string;
  @IsOptional()
  @IsString()
  cerradoAt?: string | null;
  @IsString()
  createdAt: string;
  @IsString()
  updatedAt: string;
}

export class TurnoListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurnoDto)
  data: TurnoDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}
