// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { mapUsuario, mapUsuarios } from './usuario.mapper';

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-1',
    nombre: 'Ana Torres',
    email: 'ana@restoapp.pe',
    rol: 'CAJERO',
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapUsuario', () => {
  it('mapea campos básicos', () => {
    const vm = mapUsuario(dto());
    expect(vm.id).toBe('user-1');
    expect(vm.nombre).toBe('Ana Torres');
    expect(vm.email).toBe('ana@restoapp.pe');
    expect(vm.rol).toBe('CAJERO');
    expect(vm.activo).toBe(true);
    expect(vm.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('asigna rolLabel legible para cada rol conocido', () => {
    const roles: [string, string][] = [
      ['ADMIN', 'Admin'],
      ['CAJERO', 'Cajero'],
      ['COCINA', 'Cocina'],
      ['MESERO', 'Mesero'],
      ['RECEPCION', 'Recepción'],
      ['GERENCIA', 'Gerencia'],
      ['SISTEMA', 'Sistema'],
    ];
    for (const [rol, label] of roles) {
      expect(mapUsuario(dto({ rol })).rolLabel).toBe(label);
    }
  });

  it('usa el rol como label cuando el rol no está en el mapa', () => {
    const vm = mapUsuario(dto({ rol: 'ROL_NUEVO' }));
    expect(vm.rolLabel).toBe('ROL_NUEVO');
  });

  it('estadoLabel "Activo" cuando activo=true', () => {
    expect(mapUsuario(dto({ activo: true })).estadoLabel).toBe('Activo');
  });

  it('estadoLabel "Inactivo" cuando activo=false', () => {
    expect(mapUsuario(dto({ activo: false })).estadoLabel).toBe('Inactivo');
  });

  it('estadoClass badge-ok cuando activo=true', () => {
    expect(mapUsuario(dto({ activo: true })).estadoClass).toBe('badge-ok');
  });

  it('estadoClass badge-muted cuando activo=false', () => {
    expect(mapUsuario(dto({ activo: false })).estadoClass).toBe('badge-muted');
  });

  it('createdAtLabel es una fecha formateada (string no vacío)', () => {
    const vm = mapUsuario(dto({ createdAt: '2026-03-15T10:00:00.000Z' }));
    expect(typeof vm.createdAtLabel).toBe('string');
    expect(vm.createdAtLabel.length).toBeGreaterThan(0);
  });
});

describe('mapUsuarios', () => {
  it('mapea todos los DTOs', () => {
    const vms = mapUsuarios([dto({ id: 'u1' }), dto({ id: 'u2' })]);
    expect(vms).toHaveLength(2);
    expect(vms[0].id).toBe('u1');
  });

  it('devuelve array vacío para entrada vacía', () => {
    expect(mapUsuarios([])).toHaveLength(0);
  });
});

