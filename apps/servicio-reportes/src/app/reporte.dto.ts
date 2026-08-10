import { IsDateString, IsOptional, IsString } from 'class-validator';

/** Rango opcional para los reportes ricos (plan 6.3). ISO-8601. */
export class ReporteRangoQuery {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  /** T-23 Fase 2: opcional a propósito. Ausente = vista combinada de todas las sedes. */
  @IsOptional()
  @IsString()
  sedeId?: string;
}
