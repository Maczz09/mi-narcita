import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { Request } from 'express';
import {
  getJwtPublicKey,
  getServiceJwtSecret,
  makeJwtSecretOrKeyProvider,
  JWT_VERIFY_ALGORITHMS,
} from './jwt-keys';

interface JwtPayload {
  sub: string;
  rol: string;
  // Los tokens S2S (rol SISTEMA) no llevan identidad de usuario.
  email?: string;
  nombre?: string;
  aud?: string;
  // T-23 (multi-sede): null/ausente = admin general sin sede fija.
  sedeId?: string | null;
}

const cookieExtractor: JwtFromRequestFunction = (req: Request & { cookies?: Record<string, string> }) => {
  return (req?.cookies?.['access_token'] as string | undefined) ?? null;
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
      // Verifica RS256 (usuario, clave pública) y HS256 (servicio, secreto).
      secretOrKeyProvider: makeJwtSecretOrKeyProvider(getJwtPublicKey(), getServiceJwtSecret()),
      algorithms: [...JWT_VERIFY_ALGORITHMS],
    });
  }

  validate(payload: JwtPayload) {
    // T-17: un token S2S (rol SISTEMA) solo es válido en el servicio cuyo
    // SERVICE_NAME coincide con su claim `aud`. No se usa la opción `audience` de
    // passport-jwt porque rechazaría los RS256 de usuario, que no llevan `aud`.
    if (payload.rol === 'SISTEMA') {
      const expected = process.env.SERVICE_NAME;
      if (expected && payload.aud !== expected) {
        throw new UnauthorizedException('Audiencia del token de servicio inválida');
      }
    }
    return {
      sub: payload.sub,
      email: payload.email,
      rol: payload.rol,
      nombre: payload.nombre,
      sedeId: payload.sedeId ?? null,
    };
  }
}
