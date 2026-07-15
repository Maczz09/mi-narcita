import {
  ForbiddenException,
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
    if (
      request.path === '/api/telemetry/metrics' ||
      request.path === '/telemetry/metrics' ||
      // Health checks (S33): sondas de liveness/readiness sin auth.
      request.path === '/api/health' ||
      request.path.startsWith('/api/health/') ||
      request.path === '/health' ||
      request.path.startsWith('/health/')
    ) {
      return true;
    }

    const authenticated = await (super.canActivate(
      context,
    ) as Promise<boolean>);
    this.assertCsrfToken(request);
    return authenticated;
  }

  override handleRequest<TUser = unknown>(err: unknown, user: unknown): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return user as TUser;
  }

  private assertCsrfToken(request: Request & { cookies?: Record<string, string> }) {
    if (SAFE_METHODS.has(String(request.method).toUpperCase())) return;

    const authorization = request.headers?.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.toLowerCase().startsWith('bearer ')
    )
      return;

    const cookieToken = request.cookies?.['nachopps.csrf_token'] as string | undefined;
    const headerToken = request.headers?.['x-csrf-token'];
    const normalizedHeader = Array.isArray(headerToken)
      ? headerToken[0]
      : headerToken;

    // T-36: comparación en tiempo constante; longitudes distintas devuelven 403
    // sin lanzar ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH.
    const a = Buffer.from(String(cookieToken));
    const b = Buffer.from(String(normalizedHeader));
    const iguales = a.length === b.length && timingSafeEqual(a, b);
    if (!cookieToken || !normalizedHeader || !iguales) {
      throw new ForbiddenException('Token CSRF inválido o ausente');
    }
  }
}
