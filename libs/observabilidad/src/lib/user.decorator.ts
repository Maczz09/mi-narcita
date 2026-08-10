import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type UsuarioActualField = 'sub' | 'email' | 'rol' | 'nombre' | 'sedeId' | 'payload';

export const UsuarioActual = createParamDecorator(
  (data: UsuarioActualField | undefined, ctx: ExecutionContext): unknown => {
    if (ctx.getType() !== 'http') return null;
    const request = ctx.switchToHttp().getRequest<{ user?: Record<string, unknown> }>();
    // request.user lo popula la JwtStrategy DESPUÉS de verificar firma + expiración
    if (data === 'payload') return request.user ?? null;
    if (data) return request.user?.[data] ?? null;
    return request.user?.sub ?? null;
  },
);
