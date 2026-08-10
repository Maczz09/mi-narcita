import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { Request } from 'express';
import {
  getJwtPublicKey,
  getServiceJwtSecret,
  makeJwtSecretOrKeyProvider,
  JWT_VERIFY_ALGORITHMS,
} from '@org/shared-auth';

/**
 * Estrategia Passport-JWT.
 * M4.2: extrae el token primero de la cookie httpOnly 'access_token',
 * con fallback al header Authorization Bearer.
 * El payload decodificado se inyecta en `req.user`.
 * Plan 2.1: verifica RS256 (usuario, clave pública) y HS256 (servicio, secreto).
 */
interface JwtPayload {
  sub: string;
  email: string;
  rol: string;
  nombre: string;
  // T-23 (multi-sede): null/ausente = admin general sin sede fija.
  sedeId?: string | null;
}

const cookieExtractor: JwtFromRequestFunction = (req: Request) => {
  return (req?.cookies as Record<string, string>)?.['access_token'] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // 1º cookie httpOnly, 2º header Bearer (fallback no-breaking)
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider: makeJwtSecretOrKeyProvider(getJwtPublicKey(), getServiceJwtSecret()),
      algorithms: [...JWT_VERIFY_ALGORITHMS],
    });
  }

  /** Retorna el payload que se asigna a `req.user`. */
  validate(payload: JwtPayload) {
    return {
      sub: payload.sub,
      email: payload.email,
      rol: payload.rol,
      nombre: payload.nombre,
      sedeId: payload.sedeId ?? null,
    };
  }
}
