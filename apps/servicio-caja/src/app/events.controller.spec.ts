/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('EventsController (Caja)', () => {
  let eventsController: EventsController;
  let mockPrisma: {
    cuentaAbierta: {
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      cuentaAbierta: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    eventsController = app.get<EventsController>(EventsController);
  });

  it('debe estar definido', () => {
    expect(eventsController).toBeDefined();
  });

  describe('handleCuentaAbierta', () => {
    it('debe upsert la cuenta local con estado ABIERTA', async () => {
      await eventsController.handleCuentaAbierta({ cuentaId: 'c-1', mesaId: 'm-1' });

      expect(mockPrisma.cuentaAbierta.upsert).toHaveBeenCalledWith({
        where: { cuentaId: 'c-1' },
        create: { cuentaId: 'c-1', mesaId: 'm-1', total: 0, estado: 'ABIERTA' },
        update: { estado: 'ABIERTA', mesaId: 'm-1' },
      });
    });

    it('debe llamar con cuentaId y mesaId correctos', async () => {
      await eventsController.handleCuentaAbierta({ cuentaId: 'cuenta-999', mesaId: 'mesa-42' });
      expect(mockPrisma.cuentaAbierta.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cuentaId: 'cuenta-999' },
        }),
      );
    });
  });

  describe('handleCuentaCerrada', () => {
    it('debe actualizar el estado a CERRADA con el total', async () => {
      await eventsController.handleCuentaCerrada({
        cuentaId: 'c-1',
        mesaId: 'm-1',
        total: 150,
        items: [],
      });

      expect(mockPrisma.cuentaAbierta.update).toHaveBeenCalledWith({
        where: { cuentaId: 'c-1' },
        data: { estado: 'CERRADA', total: 150 },
      });
    });

    it('no debe lanzar error si la cuenta no existe en la proyección local (catch silencioso)', async () => {
      mockPrisma.cuentaAbierta.update.mockRejectedValue(new Error('Record not found'));

      await expect(
        eventsController.handleCuentaCerrada({ cuentaId: 'no-existe', mesaId: 'm-1', total: 50, items: [] }),
      ).resolves.not.toThrow();
    });
  });
});
