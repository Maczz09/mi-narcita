// @ts-nocheck
import { describe, expect, it } from '@jest/globals';
import { mapPedido } from './pedido.mapper';
import type { PedidoDto } from '../types/pedido.types';

function createPedido(overrides: Partial<PedidoDto> = {}): PedidoDto {
  return {
    id: 'pedido-1',
    mesaId: 'mesa-1',
    numeroMesa: 1,
    total: 20,
    estado: 'PENDIENTE',
    createdAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    items: [
      {
        id: 'item-1',
        productoId: 'producto-1',
        nombre: 'Nachos',
        cantidad: 2,
        precioUnitario: 10,
        area: 'COCINA',
        estado: 'PENDIENTE',
      },
    ],
    ...overrides,
  };
}

describe('mapPedido', () => {
  it('usa el id real del backend como identidad del item', () => {
    const vm = mapPedido(createPedido());

    expect(vm.items[0].id).toBe('item-1');
  });

  it('falla si un item llega sin id real del backend', () => {
    const pedido = createPedido({
      items: [
        {
          productoId: 'producto-1',
          nombre: 'Nachos',
          cantidad: 2,
          precioUnitario: 10,
        } as unknown as PedidoDto['items'][number],
      ],
    });

    expect(() => mapPedido(pedido)).toThrow(
      'Pedido pedido-1 contiene un item sin id real del backend',
    );
  });
});

