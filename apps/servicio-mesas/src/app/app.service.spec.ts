// @ts-nocheck
import { ConflictException, NotFoundException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */

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
    ubicacion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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

  const ubicacionBase = { id: 'u-001', nombre: 'Salon Principal' };

  const mesaBase = {
    id: 'm-001',
    numero: 5,
    capacidad: 4,
    ubicacionId: 'u-001',
    ubicacion: ubicacionBase,
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
    it('debe retornar todas las mesas ordenadas por numero, con el nombre de ubicación resuelto', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([mesaBase]);
      const result = await service.listarMesas();
      expect(result.mesas).toHaveLength(1);
      expect(result.mesas[0].ubicacion).toBe('Salon Principal');
      expect(result.mesas[0].ubicacionId).toBe('u-001');
      expect(mockPrisma.mesa.findMany).toHaveBeenCalledWith({
        orderBy: { numero: 'asc' },
        include: { ubicacion: true },
        take: 200,
      });
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
      mockPrisma.ubicacion.findUnique.mockResolvedValue(ubicacionBase);
      mockPrisma.mesa.create.mockResolvedValue(mesaBase);
      const result = await service.crearMesa({ numero: 5, capacidad: 4, ubicacionId: 'u-001' });
      expect(result.message).toBe('Mesa creada exitosamente');
      expect(result.mesa.ubicacion).toBe('Salon Principal');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si el numero ya existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(mesaBase);
      await expect(service.crearMesa({ numero: 5, capacidad: 4, ubicacionId: 'u-001' })).rejects.toThrow('ya existe');
    });

    it('debe lanzar NotFoundException si la ubicación no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null);
      mockPrisma.ubicacion.findUnique.mockResolvedValue(null);
      await expect(service.crearMesa({ numero: 5, capacidad: 4, ubicacionId: 'inexistente' })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.mesa.create).not.toHaveBeenCalled();
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

  describe('unirMesas', () => {
    const mesaA = { id: 'm-a', numero: 1, capacidad: 4, grupoId: null, cuentaAsociada: null, estado: MesaEstado.Libre };
    const mesaB = { id: 'm-b', numero: 2, capacidad: 4, grupoId: null, cuentaAsociada: null, estado: MesaEstado.Libre };

    it('rechaza con menos de 2 mesas distintas', async () => {
      await expect(service.unirMesas(['m-a'])).rejects.toThrow('al menos 2 mesas');
      await expect(service.unirMesas(['m-a', 'm-a'])).rejects.toThrow('al menos 2 mesas');
    });

    it('rechaza si alguna mesa no existe', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([mesaA]);
      await expect(service.unirMesas(['m-a', 'm-b'])).rejects.toThrow(NotFoundException);
    });

    it('rechaza mesas virtuales (numero >= 90, canales delivery/llevar)', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([mesaA, { ...mesaB, numero: 99 }]);
      await expect(service.unirMesas(['m-a', 'm-b'])).rejects.toThrow('virtual');
    });

    it('rechaza si las mesas ya pertenecen a grupos distintos', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([{ ...mesaA, grupoId: 'g1' }, { ...mesaB, grupoId: 'g2' }]);
      await expect(service.unirMesas(['m-a', 'm-b'])).rejects.toThrow('grupos distintos');
    });

    it('rechaza si las mesas tienen cuentas abiertas distintas', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([{ ...mesaA, cuentaAsociada: 'c1' }, { ...mesaB, cuentaAsociada: 'c2' }]);
      await expect(service.unirMesas(['m-a', 'm-b'])).rejects.toThrow('cuentas abiertas distintas');
    });

    it('une dos mesas libres: la anfitriona es la primera de la selección y ninguna cambia de estado', async () => {
      mockPrisma.mesa.findMany.mockResolvedValueOnce([mesaA, mesaB]);
      mockPrisma.mesa.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, numero: where.id === 'm-a' ? 1 : 2, ...data, ubicacion: ubicacionBase }),
      );

      const result = await service.unirMesas(['m-a', 'm-b']);

      expect(result.mesas.every((m) => m.grupoId === 'm-a')).toBe(true);
      expect(mockPrisma.mesa.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm-a' }, data: { grupoId: 'm-a' } }),
      );
    });

    it('une una mesa ocupada con una libre: la libre hereda estado y cuenta, la anfitriona es la ocupada', async () => {
      const ocupada = { ...mesaA, estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' };
      mockPrisma.mesa.findMany.mockResolvedValueOnce([ocupada, mesaB]);
      mockPrisma.mesa.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, numero: where.id === 'm-a' ? 1 : 2, ...data, ubicacion: ubicacionBase }),
      );

      const result = await service.unirMesas(['m-a', 'm-b']);

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm-b' }, data: { grupoId: 'm-a', estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' } }),
      );
      expect(result.mesas.every((m) => m.grupoId === 'm-a')).toBe(true);
    });

    it('amplía un grupo existente arrastrando también a los miembros que no vinieron en esta selección', async () => {
      const anfitrionaYaAgrupada = { ...mesaA, grupoId: 'm-a' };
      const miembroPrevio = { id: 'm-c', numero: 3, capacidad: 4, grupoId: 'm-a', cuentaAsociada: null, estado: MesaEstado.Libre };
      mockPrisma.mesa.findMany
        .mockResolvedValueOnce([anfitrionaYaAgrupada, mesaB]) // seleccionadas
        .mockResolvedValueOnce([anfitrionaYaAgrupada, miembroPrevio]); // miembros previos del grupo m-a
      mockPrisma.mesa.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, numero: 1, ...data, ubicacion: ubicacionBase }),
      );

      const result = await service.unirMesas(['m-a', 'm-b']);

      const idsActualizados = result.mesas.map((m) => m.id).sort();
      expect(idsActualizados).toEqual(['m-a', 'm-b', 'm-c']);
    });
  });

  describe('separarMesas', () => {
    it('lanza NotFoundException si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null);
      await expect(service.separarMesas('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la mesa no está unida a otras', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...mesaBase, grupoId: null });
      await expect(service.separarMesas('m-001')).rejects.toThrow('no está unida');
    });

    it('rechaza con 409 si el grupo tiene una cuenta compartida abierta', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...mesaBase, grupoId: 'm-001' });
      mockPrisma.mesa.findMany.mockResolvedValue([{ ...mesaBase, grupoId: 'm-001', cuentaAsociada: 'c-1' }]);
      await expect(service.separarMesas('m-001')).rejects.toThrow(ConflictException);
    });

    it('separa todas las mesas del grupo cuando no hay cuenta activa', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...mesaBase, id: 'm-001', grupoId: 'm-001' });
      mockPrisma.mesa.findMany.mockResolvedValue([
        { id: 'm-001', numero: 1, grupoId: 'm-001', cuentaAsociada: null },
        { id: 'm-002', numero: 2, grupoId: 'm-001', cuentaAsociada: null },
      ]);
      mockPrisma.mesa.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, numero: where.id === 'm-001' ? 1 : 2, ...data, ubicacion: ubicacionBase }),
      );

      const result = await service.separarMesas('m-001');

      expect(result.mesas).toHaveLength(2);
      expect(result.mesas.every((m) => m.grupoId === null)).toBe(true);
    });
  });

  describe('propagarCuentaAGrupo', () => {
    it('no hace nada si la mesa disparadora no está agrupada', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...mesaBase, grupoId: null });
      await service.propagarCuentaAGrupo('m-001', 'c-1', MesaEstado.Ocupada);
      expect(mockPrisma.mesa.findMany).not.toHaveBeenCalled();
    });

    it('omite hermanas que ya tienen el mismo estado y cuenta (sin transacción de más)', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...mesaBase, id: 'm-001', grupoId: 'm-001' });
      mockPrisma.mesa.findMany.mockResolvedValue([
        { id: 'm-002', numero: 2, estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' },
      ]);
      await service.propagarCuentaAGrupo('m-001', 'c-1', MesaEstado.Ocupada);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('actualiza a las hermanas del grupo con el mismo estado y cuenta', async () => {
      mockPrisma.mesa.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'm-001') return Promise.resolve({ ...mesaBase, id: 'm-001', grupoId: 'm-001' });
        return Promise.resolve({ id: 'm-002', numero: 2, estado: MesaEstado.Libre, cuentaAsociada: null });
      });
      mockPrisma.mesa.findMany.mockResolvedValue([{ id: 'm-002', numero: 2, estado: MesaEstado.Libre, cuentaAsociada: null }]);
      mockPrisma.$transaction.mockImplementation(async (cb: (m: unknown) => unknown) => {
        const txMock = {
          ...mockPrisma,
          mesa: {
            ...mockPrisma.mesa,
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({ id: 'm-002', numero: 2, estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1', ubicacion: ubicacionBase }),
          },
          outboxEvent: { create: jest.fn() },
        };
        return cb(txMock);
      });

      await service.propagarCuentaAGrupo('m-001', 'c-1', MesaEstado.Ocupada);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('liberarGrupo', () => {
    it('no hace nada si la mesa disparadora no está agrupada', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...mesaBase, grupoId: null });
      await service.liberarGrupo('m-001');
      expect(mockPrisma.mesa.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.mesa.updateMany).not.toHaveBeenCalled();
    });

    it('libera a las hermanas y desagrupa a todo el grupo (incluida la mesa disparadora)', async () => {
      mockPrisma.mesa.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'm-001') return Promise.resolve({ ...mesaBase, id: 'm-001', grupoId: 'm-001' });
        return Promise.resolve({ id: 'm-002', numero: 2, estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' });
      });
      mockPrisma.mesa.findMany.mockResolvedValue([{ id: 'm-002', numero: 2, estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' }]);
      mockPrisma.$transaction.mockImplementation(async (cb: (m: unknown) => unknown) => {
        const txMock = {
          ...mockPrisma,
          mesa: {
            ...mockPrisma.mesa,
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({ id: 'm-002', numero: 2, estado: MesaEstado.Libre, cuentaAsociada: null, ubicacion: ubicacionBase }),
          },
          outboxEvent: { create: jest.fn() },
        };
        return cb(txMock);
      });
      mockPrisma.mesa.updateMany.mockResolvedValue({ count: 2 });

      await service.liberarGrupo('m-001');

      expect(mockPrisma.mesa.updateMany).toHaveBeenCalledWith({ where: { grupoId: 'm-001' }, data: { grupoId: null } });
    });
  });

  describe('obtenerMesa', () => {
    it('debe retornar la mesa por id', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(mesaBase);
      const result = await service.obtenerMesa('m-001');
      expect(result.id).toBe('m-001');
      expect(result.ubicacion).toBe('Salon Principal');
    });

    it('debe lanzar NotFoundException si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null);
      await expect(service.obtenerMesa('inexistente')).rejects.toThrow('no encontrada');
    });
  });

  // ─── ubicaciones ──────────────────────────────────────────────────────

  describe('listarUbicaciones', () => {
    it('devuelve todas las ubicaciones ordenadas por nombre', async () => {
      mockPrisma.ubicacion.findMany.mockResolvedValue([ubicacionBase]);
      const result = await service.listarUbicaciones();
      expect(result.ubicaciones).toEqual([ubicacionBase]);
      expect(mockPrisma.ubicacion.findMany).toHaveBeenCalledWith({ orderBy: { nombre: 'asc' } });
    });
  });

  describe('crearUbicacion', () => {
    it('crea y devuelve la ubicación', async () => {
      mockPrisma.ubicacion.findFirst.mockResolvedValue(null);
      mockPrisma.ubicacion.create.mockResolvedValue({ id: 'u-002', nombre: 'Terraza' });
      const result = await service.crearUbicacion({ nombre: 'Terraza' });
      expect(result.message).toBe('Ubicación creada exitosamente');
      expect(result.ubicacion.id).toBe('u-002');
    });

    it('recorta espacios del nombre antes de guardar y validar', async () => {
      mockPrisma.ubicacion.findFirst.mockResolvedValue(null);
      mockPrisma.ubicacion.create.mockResolvedValue({ id: 'u-003', nombre: 'Azotea' });
      await service.crearUbicacion({ nombre: '  Azotea  ' });
      expect(mockPrisma.ubicacion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ nombre: { equals: 'Azotea', mode: 'insensitive' } }) }),
      );
      expect(mockPrisma.ubicacion.create).toHaveBeenCalledWith({ data: { nombre: 'Azotea' } });
    });

    it('rechaza con 409 si ya existe una ubicación con el mismo nombre (case-insensitive) — evita el bug de "Salon Principal" vs "salon principal"', async () => {
      mockPrisma.ubicacion.findFirst.mockResolvedValue({ id: 'u-001', nombre: 'Salon Principal' });
      await expect(service.crearUbicacion({ nombre: 'salon principal' })).rejects.toThrow('Ya existe una ubicación llamada "Salon Principal"');
      expect(mockPrisma.ubicacion.create).not.toHaveBeenCalled();
    });

    it('traduce P2002 (carrera entre requests concurrentes) al mismo 409', async () => {
      mockPrisma.ubicacion.findFirst.mockResolvedValue(null);
      mockPrisma.ubicacion.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.crearUbicacion({ nombre: 'Terraza' })).rejects.toThrow('Ya existe una ubicación llamada "Terraza"');
    });
  });

  describe('actualizarUbicacion', () => {
    it('renombra la ubicación', async () => {
      mockPrisma.ubicacion.findUnique.mockResolvedValue(ubicacionBase);
      mockPrisma.ubicacion.findFirst.mockResolvedValue(null);
      mockPrisma.ubicacion.update.mockResolvedValue({ id: 'u-001', nombre: 'Salón Principal' });

      const result = await service.actualizarUbicacion('u-001', { nombre: 'Salón Principal' });

      expect(result.ubicacion.nombre).toBe('Salón Principal');
      expect(mockPrisma.ubicacion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: 'u-001' } }) }),
      );
    });

    it('lanza NotFoundException si la ubicación no existe', async () => {
      mockPrisma.ubicacion.findUnique.mockResolvedValue(null);
      await expect(service.actualizarUbicacion('inexistente', { nombre: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('rechaza con 409 al renombrar a un nombre ya usado por otra ubicación', async () => {
      mockPrisma.ubicacion.findUnique.mockResolvedValue(ubicacionBase);
      mockPrisma.ubicacion.findFirst.mockResolvedValue({ id: 'u-002', nombre: 'Terraza' });
      await expect(service.actualizarUbicacion('u-001', { nombre: 'Terraza' })).rejects.toThrow('Ya existe una ubicación llamada "Terraza"');
    });
  });

  describe('eliminarUbicacion', () => {
    it('elimina una ubicación sin mesas asociadas', async () => {
      mockPrisma.ubicacion.findUnique.mockResolvedValue({ ...ubicacionBase, _count: { mesas: 0 } });
      mockPrisma.ubicacion.delete.mockResolvedValue({});

      const result = await service.eliminarUbicacion('u-001');

      expect(result.message).toBe('Ubicación eliminada');
      expect(mockPrisma.ubicacion.delete).toHaveBeenCalledWith({ where: { id: 'u-001' } });
    });

    it('rechaza con 409 si la ubicación tiene mesas asociadas', async () => {
      mockPrisma.ubicacion.findUnique.mockResolvedValue({ ...ubicacionBase, _count: { mesas: 3 } });
      await expect(service.eliminarUbicacion('u-001')).rejects.toThrow('3 mesa(s)');
      expect(mockPrisma.ubicacion.delete).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si la ubicación no existe', async () => {
      mockPrisma.ubicacion.findUnique.mockResolvedValue(null);
      await expect(service.eliminarUbicacion('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
