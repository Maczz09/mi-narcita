// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { mapCuenta } from './cuenta.mapper';

function pedidoDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pedido-1',
    mesaId: 'mesa-1',
    numeroMesa: 1,
    total: 50,
    estado: 'PENDIENTE',
    createdAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    items: [
      {
        id: 'item-1',
        productoId: 'prod-1',
        nombre: 'Nachos',
        cantidad: 2,
        precioUnitario: 25,
        area: 'COCINA',
        estado: 'PENDIENTE',
      },
    ],
    ...overrides,
  };
}

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cuenta-1',
    mesaId: 'mesa-1',
    pedidos: [pedidoDto()],
    total: 50,
    estado: 'ABIERTA',
    ticket: null,
    createdAt: '2026-06-07T10:00:00.000Z',
    updatedAt: '2026-06-07T10:30:00.000Z',
    ...overrides,
  };
}

describe('mapCuenta', () => {
  it('mapea campos básicos', () => {
    const vm = mapCuenta(dto());
    expect(vm.id).toBe('cuenta-1');
    expect(vm.mesaId).toBe('mesa-1');
    expect(vm.total).toBe(50);
    expect(vm.estado).toBe('ABIERTA');
    expect(vm.ticket).toBeNull();
    expect(vm.createdAt).toBe('2026-06-07T10:00:00.000Z');
    expect(vm.updatedAt).toBe('2026-06-07T10:30:00.000Z');
  });

  it('estadoLabel correcto para cada estado', () => {
    expect(mapCuenta(dto({ estado: 'ABIERTA' })).estadoLabel).toBe('Abierta');
    expect(mapCuenta(dto({ estado: 'CERRADA' })).estadoLabel).toBe('Cerrada');
    expect(mapCuenta(dto({ estado: 'PAGADA' })).estadoLabel).toBe('Pagada');
  });

  it('estadoLabel devuelve el estado crudo para estados desconocidos', () => {
    const vm = mapCuenta(dto({ estado: 'NUEVO_ESTADO' }));
    expect(vm.estadoLabel).toBe('NUEVO_ESTADO');
  });

  it('mapea pedidos y cuenta cantidadPedidos', () => {
    const vm = mapCuenta(dto({ pedidos: [pedidoDto(), pedidoDto({ id: 'p2' })] }));
    expect(vm.cantidadPedidos).toBe(2);
  });

  it('cantidadItems suma los items de todos los pedidos', () => {
    // 1 pedido con 1 item de cantidad=2
    const vm = mapCuenta(dto());
    expect(vm.cantidadItems).toBe(2);
  });

  it('cantidadItems 0 cuando no hay pedidos', () => {
    const vm = mapCuenta(dto({ pedidos: [] }));
    expect(vm.cantidadItems).toBe(0);
    expect(vm.cantidadPedidos).toBe(0);
  });

  it('maneja pedidos no-array como array vacío', () => {
    const vm = mapCuenta(dto({ pedidos: null }));
    expect(vm.pedidos).toHaveLength(0);
    expect(vm.cantidadPedidos).toBe(0);
  });

  it('ticket string se propaga', () => {
    const vm = mapCuenta(dto({ ticket: 'ticket-abc' }));
    expect(vm.ticket).toBe('ticket-abc');
  });
});

