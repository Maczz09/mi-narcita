// @ts-nocheck
import { ConflictException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { AppService } from './app.service';
import { MesaEstado } from '@org/contracts';

function createMockPrismaService(overrides: Record<string, any> = {}) {
  const mock = {
    mesa: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mock)),
    ...overrides,
  };
  return mock as any;
}

describe('AppService — Mesas', () => {
  let service: AppService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  const mesaBase = {
    id: 'm-001',
    numero: 5,
    capacidad: 4,
    ubicacion: 'Salon Principal',
    estado: MesaEstado.Libre,
    cuentaAsociada: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new AppService(mockPrisma);
  });

  describe('listarMesas', () => {
    it('debe retornar todas las mesas ordenadas por numero', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([mesaBase]);
      const result = await service.listarMesas();
      expect(result.mesas).toHaveLength(1);
      expect(mockPrisma.mesa.findMany).toHaveBeenCalledWith({ orderBy: { numero: 'asc' } });
    });

    it('debe retornar array vacio si no hay mesas', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([] as any);
      const result = await service.listarMesas();
      expect(result.mesas).toEqual([]);
    });
  });

  describe('crearMesa', () => {
    it('debe crear una mesa exitosamente', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null);
      mockPrisma.mesa.create.mockResolvedValue(mesaBase);
      const result = await service.crearMesa({ numero: 5, capacidad: 4 });
      expect(result.message).toBe('Mesa creada exitosamente');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si el numero ya existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(mesaBase);
      await expect(service.crearMesa({ numero: 5, capacidad: 4 })).rejects.toThrow('ya existe');
    });
  });

  describe('actualizarEstado', () => {
    it('debe actualizar el estado de una mesa', async () => {
      const mesaOcupada = { ...mesaBase, estado: MesaEstado.Ocupada };
      mockPrisma.mesa.findUnique.mockResolvedValueOnce(mesaBase);
      // $transaction callback
      mockPrisma.$transaction.mockImplementation(async (cb: (m: unknown) => unknown) => {
        const txMock = {
          ...mockPrisma,
          mesa: {
            ...mockPrisma.mesa,
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue(mesaOcupada),
          },
          outboxEvent: {
            create: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return cb(txMock);
      });
      const result = await service.actualizarEstado('m-001', { estado: MesaEstado.Ocupada });
      expect(result.mesa.estado).toBe(MesaEstado.Ocupada);
    });

    it('debe lanzar NotFoundException si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null);
      await expect(service.actualizarEstado('inexistente', { estado: MesaEstado.Ocupada })).rejects.toThrow('no encontrada');
    });

    it('devuelve "Estado sin cambios" cuando el estado ya es el mismo', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(mesaBase); // estado = Libre
      const result = await service.actualizarEstado('m-001', { estado: MesaEstado.Libre });
      expect(result.message).toBe('Estado sin cambios');
    });

    it('lanza ConflictException cuando updateMany devuelve count=0 (escritura concurrente)', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(mesaBase);
      mockPrisma.$transaction.mockImplementation(async (cb: (m: unknown) => unknown) => {
        const txMock = {
          ...mockPrisma,
          mesa: {
            ...mockPrisma.mesa,
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findUnique: jest.fn(),
          },
          outboxEvent: { create: jest.fn(), createMany: jest.fn() },
        };
        return cb(txMock);
      });
      await expect(
        service.actualizarEstado('m-001', { estado: MesaEstado.Ocupada })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('obtenerMesa', () => {
    it('debe retornar la mesa por id', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(mesaBase);
      const result = await service.obtenerMesa('m-001');
      expect(result.id).toBe('m-001');
    });

    it('debe lanzar NotFoundException si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null);
      await expect(service.obtenerMesa('inexistente')).rejects.toThrow('no encontrada');
    });
  });
});

