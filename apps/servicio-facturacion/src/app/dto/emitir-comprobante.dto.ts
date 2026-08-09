import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const TipoComprobanteInput = {
  Boleta: 'BOLETA',
  Factura: 'FACTURA',
} as const;

export type TipoComprobanteInput = (typeof TipoComprobanteInput)[keyof typeof TipoComprobanteInput];

export class EmitirComprobanteDto {
  @IsEnum(TipoComprobanteInput)
  tipoComprobante: TipoComprobanteInput;

  // RUC de la empresa emisora: La Barra del Ceviche 1 o 2. Define contra qué
  // certificado y numeración se firma.
  @IsString()
  @IsNotEmpty()
  empresaRuc: string;

  // Obligatorio solo si tipoComprobante = FACTURA (lo valida el servicio, no
  // el DTO, porque depende de otro campo).
  @IsOptional()
  @IsString()
  clienteRuc?: string;

  @IsOptional()
  @IsString()
  clienteRazonSocial?: string;

  // Boleta: opcional, si el cliente pide que figure su DNI.
  @IsOptional()
  @IsString()
  clienteDni?: string;

  @IsOptional()
  @IsString()
  clienteNombre?: string;
}
