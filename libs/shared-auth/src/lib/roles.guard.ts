import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard RBAC: verifica que el rol del usuario autenticado (req.user.rol,
 * provisto por JwtAuthGuard) coincida con alguno de los roles declarados
 * con @Roles(). Endpoints sin @Roles quedan abiertos a cualquier autenticado.
 *
 * Importante: sale antes de tocar la request cuando no hay @Roles, por lo que
 * es seguro registrarlo en controllers que también atienden mensajes RMQ
 * (handlers @EventPattern, que no llevan @Roles, no se ven afectados).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { rol?: string } }>();
    const { user } = request;

    if (!user?.rol || !requiredRoles.includes(user.rol)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere rol: ${requiredRoles.join(' | ')}`,
      );
    }

    return true;
  }
}
