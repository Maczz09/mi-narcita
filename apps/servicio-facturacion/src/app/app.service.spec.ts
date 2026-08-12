// @ts-nocheck

jest.mock('../sunat/certificado', () => ({
  extraerClavesDesdePfx: jest.fn(),
}));

import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredencialesCryptoService } from '../sunat/credenciales-crypto.service';
import { extraerClavesDesdePfx } from '../sunat/certificado';

describe('AppService — Facturación', () => {
  const prisma = {
    comprobantePago: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    empresa: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const crypto = {
    configurada: jest.fn().mockReturnValue(true),
    encriptar: jest.fn((buf: Buffer) => Buffer.concat([Buffer.from('enc:'), buf])),
    encriptarTexto: jest.fn((texto: string) => `enc:${texto}`),
  };

  let service: AppService;

  beforeEach(() => {
    jest.clearAllMocks();
    crypto.configurada.mockReturnValue(true);
    service = new AppService(prisma as unknown as PrismaService, crypto as unknown as CredencialesCryptoService);
  });

  describe('registrarComprobantePago', () => {
    it('cae a Sede Principal cuando el evento no trae sedeId (rollout)', async () => {
      await service.registrarComprobantePago({
        cuentaId: 'c-legado', mesaId: 'm-1', total: 50, items: [],
      });

      expect(prisma.comprobantePago.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ sedeId: '00000000-0000-0000-0000-000000000001' }),
        }),
      );
    });

    it('usa el sedeId del evento cuando viene presente', async () => {
      await service.registrarComprobantePago({
        cuentaId: 'c-1', mesaId: 'm-1', sedeId: 'sede-002', total: 50, items: [],
      });

      expect(prisma.comprobantePago.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ sedeId: 'sede-002' }),
        }),
      );
    });

    it('no rescribe sedeId al actualizar (una re-entrega no reasigna la sede)', async () => {
      await service.registrarComprobantePago({
        cuentaId: 'c-1', mesaId: 'm-1', sedeId: 'sede-002', total: 50, items: [],
      });

      expect(prisma.comprobantePago.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.not.objectContaining({ sedeId: expect.anything() }),
        }),
      );
    });
  });

  describe('listarDisponibles — LENIENTE', () => {
    it('usuario pineado: su sede manda, un sedeIdSolicitado distinto se ignora', async () => {
      prisma.comprobantePago.findMany.mockResolvedValue([]);
      await service.listarDisponibles('sede-001', 'sede-otra');
      expect(prisma.comprobantePago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'DISPONIBLE', sedeId: 'sede-001' } }),
      );
    });

    it('admin general sin sede → sin filtro de sede (todas)', async () => {
      prisma.comprobantePago.findMany.mockResolvedValue([]);
      await service.listarDisponibles(null);
      expect(prisma.comprobantePago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'DISPONIBLE' } }),
      );
    });

    it('admin general con sedeId explícito → filtra por esa sede', async () => {
      prisma.comprobantePago.findMany.mockResolvedValue([]);
      await service.listarDisponibles(null, 'sede-002');
      expect(prisma.comprobantePago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estado: 'DISPONIBLE', sedeId: 'sede-002' } }),
      );
    });
  });

  describe('crearEmpresa', () => {
    const dto = {
      ruc: '10417758432', razonSocial: 'Salitral 1 SAC', nombreComercial: undefined,
      direccion: undefined, ubigeo: undefined, codigoEstablecimiento: undefined,
      solUsuario: 'MODDATOS', solClave: 'clave-sol-secreta', certificadoPass: 'clave-cert-secreta',
    };
    const pfxBuffer = Buffer.from('contenido-p12-simulado');

    it('rechaza si la clave de cifrado del servidor no está configurada', async () => {
      crypto.configurada.mockReturnValue(false);
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow('FACTURACION_CRED_ENCRYPTION_KEY');
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si no llega el archivo del certificado', async () => {
      await expect(service.crearEmpresa(dto, Buffer.alloc(0))).rejects.toThrow('certificado digital');
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si ya existe una empresa con ese RUC', async () => {
      prisma.empresa.findUnique.mockResolvedValue({ id: 'e-existente', ruc: dto.ruc });
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow(/Ya existe una empresa/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si los 2 slots ya están ocupados', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([{ slot: 1 }, { slot: 2 }]);
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow(/tercera/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza si el certificado o la contraseña no son válidos', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([]);
      (extraerClavesDesdePfx as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid password / mac verify failure');
      });
      await expect(service.crearEmpresa(dto, pfxBuffer)).rejects.toThrow(/certificado o su contraseña/);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('asigna el slot 1 cuando no hay ninguna empresa, cifra las credenciales y nunca devuelve secretos', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([]);
      (extraerClavesDesdePfx as jest.Mock).mockReturnValue({ privateKeyPem: 'pem', certPem: 'pem' });
      prisma.empresa.create.mockImplementation(({ data }) => ({
        id: 'e-nueva', slot: data.slot, ruc: data.ruc, razonSocial: data.razonSocial, activo: true,
      }));

      const resultado = await service.crearEmpresa(dto, pfxBuffer);

      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slot: 1,
            ruc: dto.ruc,
            solUsuario: dto.solUsuario,
            solClaveCifrada: 'enc:clave-sol-secreta',
            certificadoPassCifrada: 'enc:clave-cert-secreta',
            codigoEstablecimiento: '0000',
          }) as unknown,
          select: { id: true, slot: true, ruc: true, razonSocial: true, activo: true },
        }),
      );
      // El .p12 va cifrado (Uint8Array), nunca los bytes en claro.
      const dataEnviada = prisma.empresa.create.mock.calls[0][0].data;
      expect(Buffer.from(dataEnviada.certificadoPfxCifrado).toString()).toBe('enc:contenido-p12-simulado');
      // La respuesta al front no lleva ningún campo cifrado/secreto.
      expect(resultado).toEqual({ id: 'e-nueva', slot: 1, ruc: dto.ruc, razonSocial: dto.razonSocial, activo: true });
    });

    it('asigna el slot 2 cuando el slot 1 ya está ocupado', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.findMany.mockResolvedValue([{ slot: 1 }]);
      (extraerClavesDesdePfx as jest.Mock).mockReturnValue({ privateKeyPem: 'pem', certPem: 'pem' });
      prisma.empresa.create.mockImplementation(({ data }) => ({ ...data, id: 'e-2' }));

      await service.crearEmpresa(dto, pfxBuffer);

      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slot: 2 }) as unknown }),
      );
    });
  });
});
