/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */

import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RolUsuario } from '@org/contracts';

jest.mock('bcrypt', () => ({
  default: {
    compare: jest.fn().mockResolvedValue(true),
    hash: jest.fn().mockResolvedValue('hashed_password'),
    hashSync: jest.fn().mockReturnValue('dummy_hash'),
    getRounds: jest.fn().mockReturnValue(12),
  },
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed_password'),
  hashSync: jest.fn().mockReturnValue('dummy_hash'),
  getRounds: jest.fn().mockReturnValue(12),
}));

import { PrismaService } from '../prisma/prisma.service';

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  const mock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn().mockImplementation((fn: (p: unknown) => Promise<unknown>) => fn(mock)),
    // T-31: el lock de admins devuelve filas (no agregado) y se cuenta en aplicación
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'u-001' }, { id: 'u-002' }]),
    usuario: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditoriaLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return mock;
}

function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('fake-access-token'),
    verify: vi
      .fn()
      .mockReturnValue({ sub: 'u-001', email: 'admin@test.com', rol: 'ADMIN' }),
  };
}



describe('AuthService — Identidad', () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockJwt: ReturnType<typeof createMockJwtService>;

  const usuarioBase = {
    id: 'u-001',
    nombre: 'Admin',
    email: 'admin@nachopps.com',
    password: 'hashed_password',
    rol: 'ADMIN',
    activo: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrismaService();
    mockJwt = createMockJwtService();

    service = new AuthService(mockPrisma as unknown as PrismaService, mockJwt as unknown as JwtService);
  });

  describe('cambiarRol — T-04', () => {
    it('debe cambiar el rol de un usuario cuando hay 2 admins activos', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'u-001' }, { id: 'u-002' }]);
      mockPrisma.usuario.update.mockResolvedValue({ ...usuarioBase, rol: 'MESERO' });
      mockPrisma.auditoriaLog.create.mockResolvedValue({});

      const result = await service.cambiarRol('u-001', { rol: RolUsuario.Mesero }, 'u-002');
      expect(result.rol).toBe('MESERO');
      // T-31: la degradación corre dentro de una transacción (lock + update + auditoría)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditoriaLog.create).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      await expect(
        service.cambiarRol('inexistente', { rol: RolUsuario.Mesero }, 'u-002'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza degradar al único ADMIN activo — T-04', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'u-001' }]);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      await expect(
        service.cambiarRol('u-001', { rol: RolUsuario.Mesero }, 'u-002'),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza siempre la auto-degradación — T-04', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      await expect(
        service.cambiarRol('u-001', { rol: RolUsuario.Mesero }, 'u-001'),
      ).rejects.toThrow(ConflictException);
    });

    it('permite al ADMIN cambiar su propio rol a ADMIN (sin-op semántico)', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      mockPrisma.usuario.update.mockResolvedValue(usuarioBase);
      mockPrisma.auditoriaLog.create.mockResolvedValue({});

      const result = await service.cambiarRol('u-001', { rol: RolUsuario.Admin }, 'u-001');
      expect(result.rol).toBe('ADMIN');
    });
  });

  describe('login — T-03 lockout', () => {
    it('rechaza usuario con lockedUntil en el futuro', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioBase,
        lockedUntil: new Date(Date.now() + 60_000),
      });
      await expect(service.login({ email: 'admin@nachopps.com', password: 'x' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('incrementa failedLoginAttempts en password incorrecta', async () => {
      (jest.mocked(bcrypt.compare) as any).mockResolvedValueOnce(false);
      mockPrisma.usuario.findUnique.mockResolvedValue({ ...usuarioBase, failedLoginAttempts: 0 });
      mockPrisma.usuario.update.mockResolvedValue({});

      await expect(service.login({ email: 'admin@nachopps.com', password: 'mal' }))
        .rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: { increment: 1 } }) }),
      );
    });

    it('fija lockedUntil al alcanzar MAX_FAILED_ATTEMPTS', async () => {
      (jest.mocked(bcrypt.compare) as any).mockResolvedValueOnce(false);
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioBase,
        failedLoginAttempts: 4, // el próximo fallo es el 5.º → lockout
      });
      mockPrisma.usuario.update.mockResolvedValue({});

      await expect(service.login({ email: 'admin@nachopps.com', password: 'mal' }))
        .rejects.toThrow(UnauthorizedException);

      const updateCall = mockPrisma.usuario.update.mock.calls[0][0] as { data: { lockedUntil: Date } };
      expect(updateCall.data.lockedUntil).toBeInstanceOf(Date);
      expect(updateCall.data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('resetea contadores en login exitoso', async () => {
      (jest.mocked(bcrypt.compare) as any).mockResolvedValueOnce(true);
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioBase,
        failedLoginAttempts: 3,
      });
      mockPrisma.usuario.update.mockResolvedValue({ ...usuarioBase, failedLoginAttempts: 0 });
      mockPrisma.auditoriaLog.create.mockResolvedValue({});

      await service.login({ email: 'admin@nachopps.com', password: 'ok' });

      const resetCall = mockPrisma.usuario.update.mock.calls.find(
        (c: any) => c[0].data.failedLoginAttempts === 0,
      );
      expect(resetCall?.[0]?.data).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
    });
  });

  describe('login — T-35 tiempo constante (P-57)', () => {
    it('ejecuta bcrypt.compare también cuando el email no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'nadie@nachopps.com', password: 'x' }))
        .rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(bcrypt.compare).toHaveBeenCalledWith('x', 'dummy_hash');
    });

    it('ejecuta bcrypt.compare también cuando el usuario está inactivo', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ ...usuarioBase, activo: false });

      await expect(service.login({ email: 'admin@nachopps.com', password: 'x' }))
        .rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('ejecuta bcrypt.compare también cuando la cuenta está bloqueada', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioBase,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(service.login({ email: 'admin@nachopps.com', password: 'x' }))
        .rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(bcrypt.compare).toHaveBeenCalledWith('x', 'dummy_hash');
    });
  });

  describe('login — T-05 re-hash perezoso', () => {
    it('re-hashea cuando el costo almacenado es menor a 12', async () => {
      (jest.mocked(bcrypt.compare) as any).mockResolvedValueOnce(true);
      jest.mocked(bcrypt.getRounds).mockReturnValueOnce(10);
      jest.mocked(bcrypt.hash).mockResolvedValueOnce('hash-costo-12' as never);
      mockPrisma.usuario.findUnique.mockResolvedValue({ ...usuarioBase });
      mockPrisma.usuario.update.mockResolvedValue({});
      mockPrisma.auditoriaLog.create.mockResolvedValue({});

      await service.login({ email: 'admin@nachopps.com', password: 'ok' });

      // Debe re-hashear el texto plano recibido, NO el hash almacenado: hashear
      // el hash dejaría una credencial que ya no coincide con la contraseña.
      expect(bcrypt.hash).toHaveBeenCalledWith('ok', 12);
      const rehashCall = mockPrisma.usuario.update.mock.calls.find(
        (c: any) => c[0].data.password === 'hash-costo-12',
      );
      expect(rehashCall).toBeTruthy();
    });

    it('no re-hashea cuando el costo ya es 12', async () => {
      (jest.mocked(bcrypt.compare) as any).mockResolvedValueOnce(true);
      jest.mocked(bcrypt.getRounds).mockReturnValueOnce(12);
      mockPrisma.usuario.findUnique.mockResolvedValue({ ...usuarioBase });
      mockPrisma.usuario.update.mockResolvedValue({});
      mockPrisma.auditoriaLog.create.mockResolvedValue({});

      await service.login({ email: 'admin@nachopps.com', password: 'ok' });

      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  describe('obtenerPerfil', () => {
    it('debe retornar el perfil del usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      const result = await service.obtenerPerfil('u-001');
      expect(result.email).toBe('admin@nachopps.com');
      expect(result.rol).toBe('ADMIN');
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.obtenerPerfil('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('crearUsuario', () => {
    it('debe crear un usuario nuevo', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.usuario.create.mockResolvedValue({
        ...usuarioBase,
        nombre: 'Nuevo',
        email: 'nuevo@test.com',
        rol: 'MESERO',
      });
      mockPrisma.auditoriaLog.create.mockResolvedValue({});

      const result = await service.crearUsuario({
        nombre: 'Nuevo',
        email: 'nuevo@test.com',
        password: '123456',
        rol: RolUsuario.Mesero,
      });

      expect(result.email).toBe('nuevo@test.com');
      expect(result.rol).toBe('MESERO');
    });

    it('debe lanzar ConflictException si el email ya existe', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      await expect(
        service.crearUsuario({
          nombre: 'Duplicado',
          email: 'admin@nachopps.com',
          password: '123456',
          rol: RolUsuario.Mesero,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listarUsuarios', () => {
    it('debe listar todos los usuarios', async () => {
      mockPrisma.usuario.findMany.mockResolvedValue([usuarioBase]);
      const result = await service.listarUsuarios();
      expect(result.data).toHaveLength(1);
    });

    it('debe retornar array vacio si no hay usuarios', async () => {
      mockPrisma.usuario.findMany.mockResolvedValue([]);
      const result = await service.listarUsuarios();
      expect(result.data).toEqual([]);
    });
  });

  describe('refresh tokens (plan 1.4)', () => {
    it('issueRefreshToken guarda el hash (no el token) y devuelve el valor en claro', async () => {
      mockPrisma.refreshToken.create.mockResolvedValue({});
      const r = await service.issueRefreshToken('u-001');
      expect(typeof r.token).toBe('string');
      expect(r.token.length).toBeGreaterThan(20);
      const arg = mockPrisma.refreshToken.create.mock.calls[0][0] as { data: { userId: string, tokenHash: string, expiresAt: Date } };
      expect(arg.data.userId).toBe('u-001');
      expect(arg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(arg.data.tokenHash).not.toBe(r.token);
      expect(arg.data.expiresAt).toBeInstanceOf(Date);
    });

    it('rota: emite uno nuevo, revoca el anterior (CAS) y devuelve access', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'u-001',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
      });
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const r = await service.rotateRefreshToken('raw-token');
      expect(r.access_token).toBe('fake-access-token');
      expect(r.usuario.id).toBe('u-001');
      expect(typeof r.refresh.token).toBe('string');
      // T-34: la revocación es condicional (compare-and-swap sobre revokedAt: null)
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt-1', revokedAt: null } }),
      );
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt-1' }, data: expect.objectContaining({ replacedById: 'rt-2' }) }),
      );
    });

    it('T-34/P-56: dos rotaciones concurrentes → una gana y la cadena nueva sigue viva', async () => {
      const existing = {
        id: 'rt-1',
        userId: 'u-001',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e6),
      };
      const rotated = {
        ...existing,
        revokedAt: new Date(),
        replacedById: 'rt-2',
      };
      mockPrisma.refreshToken.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(rotated);
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioBase);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const resultados = await Promise.allSettled([
        service.rotateRefreshToken('raw-token'),
        service.rotateRefreshToken('raw-token'),
      ]);

      const exitosos = resultados.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof service.rotateRefreshToken>>> => r.status === 'fulfilled');
      const rechazados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(exitosos).toHaveLength(1);
      expect(rechazados).toHaveLength(1);
      expect(rechazados[0].reason).toBeInstanceOf(UnauthorizedException);

      const refreshGanador = exitosos[0].value.refresh;
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-2',
        userId: 'u-001',
        revokedAt: null,
        expiresAt: refreshGanador.expiresAt,
      });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt-3' });
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      await expect(service.rotateRefreshToken(refreshGanador.token)).resolves.toEqual(
        expect.objectContaining({
          access_token: 'fake-access-token',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          refresh: expect.objectContaining({ token: expect.any(String) as unknown }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          usuario: expect.objectContaining({ id: 'u-001' }),
        }),
      );

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledTimes(3);
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-001', revokedAt: null } }),
      );
    });

    it('detecta reuso: token revocado revoca toda la cadena y rechaza', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-001',
        revokedAt: new Date(Date.now() - 11_000),
        replacedById: 'rt-2',
        expiresAt: new Date(Date.now() + 1e6),
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      await expect(service.rotateRefreshToken('raw')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-001', revokedAt: null } }),
      );
    });

    it('rechaza una carrera ya revocada en gracia sin revocar la cadena', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-001',
        revokedAt: new Date(),
        replacedById: 'rt-2',
        expiresAt: new Date(Date.now() + 1e6),
      });

      await expect(service.rotateRefreshToken('raw')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rechaza un token expirado', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt-1', userId: 'u-001', revokedAt: null, expiresAt: new Date(Date.now() - 1000) });
      await expect(service.rotateRefreshToken('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un token inexistente', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotateRefreshToken('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokeRefreshTokenByRaw revoca el token presentado y es no-op sin token', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.revokeRefreshTokenByRaw('raw');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      await service.revokeRefreshTokenByRaw(null);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
