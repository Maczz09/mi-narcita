// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { mapReserva, mapReservas } from './reserva.mapper';

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'res-1',
    clienteNombre: 'Carlos López',
    clienteTelefono: '987654321',
    fecha: '2026-06-15',
    hora: '20:00',
    mesaPreferida: null,
    numComensales: 3,
    estado: 'PENDIENTE',
    createdAt: '2026-06-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('mapReserva', () => {
  it('mapea campos básicos', () => {
    const vm = mapReserva(dto());
    expect(vm.id).toBe('res-1');
    expect(vm.clienteNombre).toBe('Carlos López');
    expect(vm.clienteTelefono).toBe('987654321');
    expect(vm.fecha).toBe('2026-06-15');
    expect(vm.hora).toBe('20:00');
    expect(vm.numComensales).toBe(3);
    expect(vm.createdAt).toBe('2026-06-07T10:00:00.000Z');
  });

  it('mesaPreferida null se propaga como null', () => {
    expect(mapReserva(dto({ mesaPreferida: null })).mesaPreferida).toBeNull();
  });

  it('mesaPreferida con valor se propaga', () => {
    expect(mapReserva(dto({ mesaPreferida: '05' })).mesaPreferida).toBe('05');
  });

  it('asigna estadoLabel correcto para cada estado', () => {
    expect(mapReserva(dto({ estado: 'PENDIENTE' })).estadoLabel).toBe('Pendiente');
    expect(mapReserva(dto({ estado: 'CONFIRMADA' })).estadoLabel).toBe('Confirmada');
    expect(mapReserva(dto({ estado: 'CANCELADA' })).estadoLabel).toBe('Cancelada');
    expect(mapReserva(dto({ estado: 'EXPIRADA' })).estadoLabel).toBe('Expirada');
  });

  it('asigna estadoClass correcto para cada estado', () => {
    expect(mapReserva(dto({ estado: 'PENDIENTE' })).estadoClass).toBe('badge-warn');
    expect(mapReserva(dto({ estado: 'CONFIRMADA' })).estadoClass).toBe('badge-ok');
    expect(mapReserva(dto({ estado: 'CANCELADA' })).estadoClass).toBe('badge-danger');
    expect(mapReserva(dto({ estado: 'EXPIRADA' })).estadoClass).toBe('badge-muted');
  });

  it('estado desconocido usa fallback badge-muted y el propio estado como label', () => {
    const vm = mapReserva(dto({ estado: 'NUEVA' }));
    expect(vm.estadoClass).toBe('badge-muted');
    expect(vm.estadoLabel).toBe('NUEVA');
  });

  it('fechaHoraLabel es un string con la fecha formateada', () => {
    const vm = mapReserva(dto({ fecha: '2026-06-15', hora: '20:00' }));
    expect(typeof vm.fechaHoraLabel).toBe('string');
    expect(vm.fechaHoraLabel.length).toBeGreaterThan(0);
  });

  it('fechaHoraLabel muestra fecha+hora crudas si la fecha es inválida', () => {
    const vm = mapReserva(dto({ fecha: 'NO_VALIDO', hora: '20:00' }));
    expect(vm.fechaHoraLabel).toBe('NO_VALIDO 20:00');
  });
});

describe('mapReservas', () => {
  it('mapea todos los DTOs', () => {
    const vms = mapReservas([dto({ id: 'r1' }), dto({ id: 'r2' })]);
    expect(vms).toHaveLength(2);
    expect(vms[0].id).toBe('r1');
    expect(vms[1].id).toBe('r2');
  });

  it('devuelve array vacío para entrada vacía', () => {
    expect(mapReservas([])).toHaveLength(0);
  });
});

