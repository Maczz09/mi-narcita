// @ts-nocheck
import { toReservaDto } from './reservas.mapper';
import { Reserva } from '../generated/prisma';

describe('toReservaDto', () => {
  it('should map Reserva to ReservaDto', () => {
    const reserva: Reserva = {
      id: 'r-001',
      clienteId: 'c-001',
      clienteNombre: 'Juan',
      clienteTelefono: '999',
      fecha: new Date('2026-06-15T00:00:00.000Z'),
      hora: '19:00',
      mesaPreferida: 'mesa-005',
      numComensales: 4,
      estado: 'Pendiente',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date(),
    };

    const dto = toReservaDto(reserva);

    expect(dto).toEqual({
      id: 'r-001',
      clienteId: 'c-001',
      clienteNombre: 'Juan',
      clienteTelefono: '999',
      fecha: '2026-06-15',
      hora: '19:00',
      mesaPreferida: 'mesa-005',
      numComensales: 4,
      estado: 'Pendiente',
      createdAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('should map Reserva to ReservaDto with missing nullable fields', () => {
    const reserva: Reserva = {
      id: 'r-002',
      clienteId: null,
      clienteNombre: 'Maria',
      clienteTelefono: null,
      fecha: new Date('2026-06-16T00:00:00.000Z'),
      hora: '20:00',
      mesaPreferida: 'mesa-001',
      numComensales: 2,
      estado: 'Confirmada',
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date(),
    };

    const dto = toReservaDto(reserva);

    expect(dto.clienteId).toBe('');
    expect(dto.clienteTelefono).toBe('');
  });
});
