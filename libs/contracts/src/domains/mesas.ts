import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';

export const MesaEstado = {
  Libre: 'LIBRE',
  Ocupada: 'OCUPADA',
  Reservada: 'RESERVADA',
} as const;

export type MesaEstado = (typeof MesaEstado)[keyof typeof MesaEstado];

export class MesaDto {
  @IsString()
  id: string;
  @IsNumber()
  numero: number;
  @IsNumber()
  capacidad: number;
  @IsString()
  ubicacionId: string;
  @IsString()
  ubicacion: string;
  @IsEnum(MesaEstado)
  estado: MesaEstado;
  @IsOptional()
  @IsString()
  cuentaAsociada?: string | null;
}

export class UbicacionDto {
  @IsString()
  id: string;
  @IsString()
  nombre: string;
}

export class CrearUbicacionCommand {
  @IsString()
  nombre: string;
}

export class ActualizarUbicacionCommand {
  @IsString()
  nombre: string;
}

export class MesaAsignadaPayload {
  @IsString()
  mesaId: string;
  @IsString()
  cuentaId: string;
}

export class MesaLiberadaPayload {
  @IsString()
  mesaId: string;
}

export class MesaCreadaPayload {
  mesa: MesaDto;
}

export class MesaActualizadaPayload {
  mesa: MesaDto;
}

export class CrearMesaCommand {
  @IsNumber()
  numero: number;
  @IsNumber()
  capacidad: number;
  @IsString()
  ubicacionId: string;
}

export class ActualizarEstadoMesaCommand {
  @IsEnum(MesaEstado)
  estado: MesaEstado;
  @IsOptional()
  @IsString()
  cuentaAsociada?: string | null;
}
