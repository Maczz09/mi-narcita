// types/auth.types.ts — DTOs de autenticación

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserDto {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo?: boolean;
  createdAt?: string;
  /** null = admin general (opera cualquier sede, debe elegir una). T-23. */
  sedeId?: string | null;
}

export interface LoginResponseDto {
  access_token: string;
  usuario: UserDto;
}
