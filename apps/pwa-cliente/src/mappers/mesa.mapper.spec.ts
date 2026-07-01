// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { mapMesa, mapMesas } from './mesa.mapper';

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mesa-1',
    numero: 1,
    capacidad: 4,
    ubicacion: 'Salón A',
    estado: 'LIBRE',
    cuentaAsociada: null,
    ...overrides,
  };
}

describe('mapMesa', () => {
  it('mapea id, capacidad y ubicacion correctamente', () => {
    const vm = mapMesa(dto());
    expect(vm.id).toBe('mesa-1');
    expect(vm.capacidad).toBe(4);
    expect(vm.ubicacion).toBe('Salón A');
  });

  it('padea número con ceros a 2 dígitos', () => {
    expect(mapMesa(dto({ numero: 1 })).numero).toBe('01');
    expect(mapMesa(dto({ numero: 9 })).numero).toBe('09');
    expect(mapMesa(dto({ numero: 12 })).numero).toBe('12');
  });

  it('conserva el número raw para ordenamiento', () => {
    expect(mapMesa(dto({ numero: 5 })).numeroRaw).toBe(5);
  });

  it('asigna clase CSS correcta por estado', () => {
    expect(mapMesa(dto({ estado: 'LIBRE' })).estadoClass).toBe('libre');
    expect(mapMesa(dto({ estado: 'OCUPADA' })).estadoClass).toBe('ocup');
    expect(mapMesa(dto({ estado: 'RESERVADA' })).estadoClass).toBe('resv');
  });

  it('asigna label legible por estado', () => {
    expect(mapMesa(dto({ estado: 'LIBRE' })).estadoLabel).toBe('Libre');
    expect(mapMesa(dto({ estado: 'OCUPADA' })).estadoLabel).toBe('Ocupada');
    expect(mapMesa(dto({ estado: 'RESERVADA' })).estadoLabel).toBe('Reservada');
  });

  it('propaga cuentaAsociada', () => {
    expect(mapMesa(dto({ cuentaAsociada: null })).cuentaAsociada).toBeNull();
    expect(mapMesa(dto({ cuentaAsociada: 'cuenta-abc' })).cuentaAsociada).toBe('cuenta-abc');
  });

  it('estado desconocido devuelve clase y label vacíos', () => {
    const vm = mapMesa(dto({ estado: 'ROTO' }));
    expect(vm.estadoClass).toBe('');
    expect(vm.estadoLabel).toBe('ROTO');
  });
});

describe('mapMesas', () => {
  it('ordena por numeroRaw ascendente', () => {
    const mesas = [dto({ id: 'm3', numero: 3 }), dto({ id: 'm1', numero: 1 }), dto({ id: 'm2', numero: 2 })];
    const vms = mapMesas(mesas);
    expect(vms.map((m) => m.numeroRaw)).toEqual([1, 2, 3]);
  });

  it('mapea todos los elementos', () => {
    const mesas = [dto({ id: 'm1' }), dto({ id: 'm2' })];
    expect(mapMesas(mesas)).toHaveLength(2);
  });

  it('devuelve array vacío para entrada vacía', () => {
    expect(mapMesas([])).toHaveLength(0);
  });
});

