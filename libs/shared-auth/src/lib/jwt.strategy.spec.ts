import { describe, it, expect } from 'vitest';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy (shared-auth)', () => {
  it('exige JWT_PUBLIC_KEY al inicializar', () => {
    const pub = process.env.JWT_PUBLIC_KEY;
    const svc = process.env.SERVICE_JWT_SECRET;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.SERVICE_JWT_SECRET = 's';

    expect(() => new JwtStrategy()).toThrow(/JWT_PUBLIC_KEY/);

    process.env.JWT_PUBLIC_KEY = pub;
    process.env.SERVICE_JWT_SECRET = svc;
  });

  it('valida y proyecta los campos de identidad del payload', () => {
    const pub = process.env.JWT_PUBLIC_KEY;
    const svc = process.env.SERVICE_JWT_SECRET;
    process.env.JWT_PUBLIC_KEY = 'dummy-public';
    process.env.SERVICE_JWT_SECRET = 'dummy-service';

    const strategy = new JwtStrategy();
    const payload = { sub: 'u1', email: 'a@b.com', rol: 'ADMIN', nombre: 'Ana', extra: 'ignored' };
    expect(
      strategy.validate(payload),
    ).toEqual({ sub: 'u1', email: 'a@b.com', rol: 'ADMIN', nombre: 'Ana', sedeId: null });

    process.env.JWT_PUBLIC_KEY = pub;
    process.env.SERVICE_JWT_SECRET = svc;
  });

  describe('T-17: audiencia de tokens S2S (rol SISTEMA)', () => {
    const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
      const prev: Record<string, string | undefined> = {};
      for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
      try { fn(); } finally {
        for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
      }
    };

    it('acepta un token de servicio con aud === SERVICE_NAME', () => {
      withEnv({ JWT_PUBLIC_KEY: 'x', SERVICE_JWT_SECRET: 'y', SERVICE_NAME: 'servicio-inventario', SERVICE_AUD_ENFORCE: 'true' }, () => {
        const strategy = new JwtStrategy();
        expect(
          strategy.validate({ sub: 'servicio-pedidos', rol: 'SISTEMA', aud: 'servicio-inventario' }),
        ).toMatchObject({ rol: 'SISTEMA' });
      });
    });

    it('rechaza (estricto) un token de servicio con aud incorrecta', () => {
      withEnv({ JWT_PUBLIC_KEY: 'x', SERVICE_JWT_SECRET: 'y', SERVICE_NAME: 'servicio-cuentas', SERVICE_AUD_ENFORCE: 'true' }, () => {
        const strategy = new JwtStrategy();
        expect(() =>
          strategy.validate({ sub: 'servicio-pedidos', rol: 'SISTEMA', aud: 'servicio-inventario' }),
        ).toThrow(/[Aa]udiencia/);
      });
    });

    it('rechaza aud incorrecta aunque SERVICE_AUD_ENFORCE no este definida', () => {
      withEnv({ JWT_PUBLIC_KEY: 'x', SERVICE_JWT_SECRET: 'y', SERVICE_NAME: 'servicio-cuentas', SERVICE_AUD_ENFORCE: undefined }, () => {
        const strategy = new JwtStrategy();
        expect(() =>
          strategy.validate({ sub: 'servicio-pedidos', rol: 'SISTEMA', aud: 'servicio-inventario' }),
        ).toThrow(/[Aa]udiencia/);
      });
    });

    it('un token de USUARIO (RS256, sin aud) pasa aunque haya enforce', () => {
      withEnv({ JWT_PUBLIC_KEY: 'x', SERVICE_JWT_SECRET: 'y', SERVICE_NAME: 'servicio-cuentas', SERVICE_AUD_ENFORCE: 'true' }, () => {
        const strategy = new JwtStrategy();
        expect(
          strategy.validate({ sub: 'u1', email: 'a@b.com', rol: 'MESERO', nombre: 'Ana' }),
        ).toMatchObject({ rol: 'MESERO' });
      });
    });
  });
});
