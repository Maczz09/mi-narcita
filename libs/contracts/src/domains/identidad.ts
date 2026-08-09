import { IsEmail, IsString, IsEnum, IsBoolean, IsNotEmpty, MinLength, IsOptional, IsInt, Min, Max, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export const RolUsuario = {
  Admin: 'ADMIN',
  Cajero: 'CAJERO',
  Cocina: 'COCINA',
  Mesero: 'MESERO',
  Recepcion: 'RECEPCION',
  Gerencia: 'GERENCIA',
  Sistema: 'SISTEMA',
} as const;

export type RolUsuario = (typeof RolUsuario)[keyof typeof RolUsuario];

/* ── DTOs ────────────────────────────────────────────── */

export class UsuarioDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsEmail()
  email: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;

  @IsBoolean()
  activo: boolean;

  @IsString()
  createdAt: string;
}

/* ── Queries ─────────────────────────────────────────── */

export class ListarUsuariosQuery {
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
  @IsEnum(RolUsuario)
  rol?: RolUsuario;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;
}

/* ── Commands ────────────────────────────────────────── */

export class LoginCommand {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CrearUsuarioCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;
}

export class CambiarRolCommand {
  @IsEnum(RolUsuario)
  rol: RolUsuario;
}

export class CambiarEstadoUsuarioCommand {
  @IsBoolean()
  activo: boolean;
}

/* ── Responses ───────────────────────────────────────── */

export class LoginResponseDto {
  @IsString()
  access_token: string;
  
  usuario: Omit<UsuarioDto, 'activo' | 'createdAt'>;
}

export class UsuarioListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UsuarioDto)
  data: UsuarioDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}
