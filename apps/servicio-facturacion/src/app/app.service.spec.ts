// @ts-nocheck

import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppService — Facturación', () => {
  const prisma = {
    comprobantePago: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  };

  let service: AppService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppService(prisma as unknown as PrismaService);
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
});
