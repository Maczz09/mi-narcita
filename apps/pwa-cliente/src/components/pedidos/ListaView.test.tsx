// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListaView } from './ListaView';
import type { PedidoVM } from '../../types/pedido.types';

vi.mock('./pedidos.meta', () => ({
  CANAL_META: {
    SALON: { label: 'Salón', cls: 'salon', ic: 'Mesas' },
    DELIVERY: { label: 'Delivery', cls: 'delivery', ic: 'Delivery' },
    LLEVAR: { label: 'Llevar', cls: 'llevar', ic: 'Bag' },
  },
  nextLabelFor: vi.fn(() => 'Avanzar Test')
}));

const mockPedido = (canal: 'SALON'|'DELIVERY'|'LLEVAR', id: string): PedidoVM => ({
  id,
  canal,
  estado: 'PENDIENTE',
  estadoLabel: 'Pendiente',
  estadoClass: 'pendiente',
  mesaNumero: canal === 'SALON' ? '12' : undefined,
  cliente: canal === 'SALON' ? undefined : 'Test Client',
  direccion: canal === 'DELIVERY' ? 'Dir 1' : undefined,
  cantidadItems: 2,
  total: 100,
  createdAt: new Date().toISOString(),
  items: []
} as any);

describe('ListaView', () => {
  it('renders empty list if no pedidos', () => {
    render(<ListaView pedidos={[]} onAvanzar={vi.fn()} onDetalle={vi.fn()} actionLoading={null} online={true} now={Date.now()} />);
    expect(screen.getByText('Pedido')).toBeInTheDocument();
  });

  it('renders pedidos and handles actions', () => {
    const onAvanzar = vi.fn();
    const onDetalle = vi.fn();
    const p1 = mockPedido('SALON', '1234567890');
    const p2 = mockPedido('DELIVERY', '0987654321');
    const p3 = mockPedido('LLEVAR', '1111111111');
    delete (p3 as any).cliente;

    render(<ListaView pedidos={[p1, p2, p3]} onAvanzar={onAvanzar} onDetalle={onDetalle} actionLoading={null} online={true} now={Date.now()} />);
    
    // click row
    fireEvent.click(screen.getByText('123456'));
    expect(onDetalle).toHaveBeenCalledWith(p1);

    // click avanzar
    const btns = screen.getAllByRole('button');
    fireEvent.click(btns[0]);
    expect(onAvanzar).toHaveBeenCalledWith(p1);
  });

  it('shows spinner for actionLoading', () => {
    const p1 = mockPedido('SALON', '1234567890');
    const { container } = render(<ListaView pedidos={[p1]} onAvanzar={vi.fn()} onDetalle={vi.fn()} actionLoading={p1.id} online={true} now={Date.now()} />);
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });
});
