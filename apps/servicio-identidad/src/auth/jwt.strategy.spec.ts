// @ts-nocheck
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy de identidad', () => {
  it('exige JWT_PUBLIC_KEY al inicializar', () => {
    const prevPub = process.env.JWT_PUBLIC_KEY;
    const prevSvc = process.env.SERVICE_JWT_SECRET;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.SERVICE_JWT_SECRET = 'svc';

    expect(() => new JwtStrategy()).toThrow('JWT_PUBLIC_KEY env variable is required');

    process.env.JWT_PUBLIC_KEY = prevPub;
    process.env.SERVICE_JWT_SECRET = prevSvc;
  });

  it('expone los campos de identidad esperados del payload', () => {
    const prevPub = process.env.JWT_PUBLIC_KEY;
    const prevSvc = process.env.SERVICE_JWT_SECRET;
    process.env.JWT_PUBLIC_KEY = 'dummy-public-key';
    process.env.SERVICE_JWT_SECRET = 'dummy-service-secret';

    const strategy = new JwtStrategy();

    expect(
      strategy.validate({
        sub: 'user-1',
        email: 'admin@test.com',
        rol: 'ADMIN',
        nombre: 'Admin',
        extra: 'ignored',
      } as any),
    ).toEqual({
      sub: 'user-1',
      email: 'admin@test.com',
      rol: 'ADMIN',
      nombre: 'Admin',
      sedeId: null,
    });

    process.env.JWT_PUBLIC_KEY = prevPub;
    process.env.SERVICE_JWT_SECRET = prevSvc;
  });
});
