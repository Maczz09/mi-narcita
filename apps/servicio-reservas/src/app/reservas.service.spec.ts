// @ts-nocheck

import { ReservasService } from './reservas.service';
import { ReservaEstado, RoutingKeys } from '@org/contracts';

import { PrismaService } from '../prisma/prisma.service';

type MockPrismaService = {
  reserva: {
    findMany: ReturnType<typeof jest.fn>;
    findUnique: ReturnType<typeof jest.fn>;
    create: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
    count: ReturnType<typeof jest.fn>;
  };
  outboxEvent: {
    create: ReturnType<typeof jest.fn>;
  };
  $transaction: ReturnType<typeof jest.fn>;
};

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  return { ...overrides } as unknown as MockPrismaService;
}

describe('ReservasService — Reservas', () => {
  let service: ReservasService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  // Fecha siempre futura (+30 días) para que los tests de `crear` no caduquen:
  // el servicio ahora rechaza reservas en fecha/hora pasada.
  const fechaFutura = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const reservaBase = {
    id: 'r-001',
    clienteId: 'c-001',
    clienteNombre: 'Juan Perez',
    clienteTelefono: '999888777',
    fecha: new Date('2026-06-15'),
    hora: '19:00',
    mesaPreferida: 'mesa-005',
    numComensales: 4,
    estado: ReservaEstado.Pendiente,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = createMockPrismaService({
      reserva: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
    });
    mockPrisma.$transaction = jest.fn((callback: unknown) => Promise.resolve((callback as (arg: unknown) => unknown)(mockPrisma)));
    service = new ReservasService(mockPrisma as unknown as PrismaService);
  });

  describe('listar', () => {
    it('debe listar reservas', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([reservaBase]);
      const result = await service.listar();
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 21,
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }, { id: 'asc' }],
      }));
    });

    it('debe retornar array vacio si no hay reservas', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      const result = await service.listar();
      expect(result.data).toEqual([]);
    });

    it('devuelve data y nextCursor cuando hay mas resultados', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([
        { ...reservaBase, id: 'r-001' },
        { ...reservaBase, id: 'r-002' },
        { ...reservaBase, id: 'r-003' },
      ]);

      const result = await service.listar({ limit: 2 });

      expect(result.data.map((reserva) => reserva.id)).toEqual(['r-001', 'r-002']);
      expect(result.nextCursor).toBe('r-002');
      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 3,
      }));
    });

    it('aplica cursor, estado, fecha, updatedSince y tope maximo de limit', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);

      await service.listar({
        cursor: 'r-010',
        estado: ReservaEstado.Confirmada,
        fecha: '2026-06-15',
        updatedSince: '2026-01-01T00:00:00.000Z',
        limit: 500,
      });

      expect(mockPrisma.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          estado: ReservaEstado.Confirmada,
          fecha: new Date('2026-06-15'),
          updatedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
        },
        cursor: { id: 'r-010' },
        skip: 1,
        take: 101,
      }));
    });
  });

  describe('crear', () => {
    it('debe crear una reserva y publicar evento', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.reserva.create.mockResolvedValue(reservaBase);

      const result = await service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan Perez',
        clienteTelefono: '999888777',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      });

      expect(result.message).toBe('Reserva creada');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          routingKey: RoutingKeys.ReservaCreada,
          status: 'PENDING',
        }) as unknown,
      });
    });

    it('debe permitir crear en la misma franja si la mesa es distinta', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-004' }]);
      mockPrisma.reserva.create.mockResolvedValue(reservaBase);

      const result = await service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      });

      expect(result.message).toBe('Reserva creada');
    });

    it('debe lanzar ConflictException si la mesa ya esta reservada en la franja', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-005' }]);
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      })).rejects.toThrow('La mesa ya está reservada');
    });

    it('debe lanzar BadRequestException si la fecha ya pasó', async () => {
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: '2020-01-01',
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      })).rejects.toThrow('ya pasó');
    });

    it('debe lanzar BadRequestException si no se selecciona mesa', async () => {
      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: ' ',
        numComensales: 4,
      })).rejects.toThrow('Selecciona una mesa');
    });

    it('debe traducir la carrera de unicidad a ConflictException', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.reserva.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      })).rejects.toThrow('La mesa ya está reservada');
    });

    it('re-lanza errores que no son de unicidad', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([] as any);
      mockPrisma.$transaction.mockRejectedValue(new Error('db timeout'));

      await expect(service.crear({
        clienteId: 'c-001',
        clienteNombre: 'Juan',
        clienteTelefono: '999',
        fecha: fechaFutura,
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        numComensales: 4,
      })).rejects.toThrow('db timeout');
    });
  });

  describe('consultarDisponibilidad', () => {
    it('retorna disponibilidad para una mesa concreta', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-004' }]);

      const result = await service.consultarDisponibilidad('2026-06-15', '19:00', 'mesa-005');

      expect(result).toEqual({
        fecha: '2026-06-15',
        hora: '19:00',
        mesaPreferida: 'mesa-005',
        mesasReservadas: ['mesa-004'],
        disponible: true,
        capacidadRestante: 1,
      });
    });

    it('marca la mesa como no disponible cuando ya esta reservada', async () => {
      mockPrisma.reserva.findMany.mockResolvedValue([{ ...reservaBase, mesaPreferida: 'mesa-005' }]);

      const result = await service.consultarDisponibilidad('2026-06-15', '19:00', 'mesa-005');

      expect(result.disponible).toBe(false);
      expect(result.capacidadRestante).toBe(0);
    });
  });

  describe('confirmar', () => {
    it('debe confirmar una reserva pendiente', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(reservaBase);
      mockPrisma.reserva.update.mockResolvedValue({ ...reservaBase, estado: ReservaEstado.Confirmada });

      const result = await service.confirmar('r-001');
      expect(result.reserva.estado).toBe(ReservaEstado.Confirmada);
    });

    it('debe lanzar ConflictException si ya esta confirmada', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue({ ...reservaBase, estado: ReservaEstado.Confirmada });
      await expect(service.confirmar('r-001')).rejects.toThrow('Solo se pueden confirmar reservas pendientes');
    });
  });

  describe('cancelar', () => {
    it('debe cancelar una reserva y publicar evento', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(reservaBase);
      mockPrisma.reserva.update.mockResolvedValue({ ...reservaBase, estado: ReservaEstado.Cancelada });

      const result = await service.cancelar('r-001', 'Cliente cancelo');
      expect(result.reserva.estado).toBe(ReservaEstado.Cancelada);
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          routingKey: RoutingKeys.ReservaCancelada,
          payload: JSON.stringify({ reservaId: 'r-001', motivo: 'Cliente cancelo' }),
          status: 'PENDING',
        }) as unknown,
      });
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockPrisma.reserva.findUnique.mockResolvedValue(null);
      await expect(service.cancelar('inexistente')).rejects.toThrow('no encontrada');
    });
  });
});
