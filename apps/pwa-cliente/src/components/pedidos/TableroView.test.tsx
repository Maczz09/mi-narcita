// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TableroView } from './TableroView';
import type { PedidoVM } from '../../types/pedido.types';

vi.mock('./pedidos.meta', () => ({
  CANAL_META: {
    SALON: { label: 'Salón', cls: 'salon', ic: 'Mesas' },
    DELIVERY: { label: 'Delivery', cls: 'delivery', ic: 'Delivery' },
    LLEVAR: { label: 'Llevar', cls: 'llevar', ic: 'Bag' },
  },
  nextLabelFor: vi.fn(() => 'Avanzar Test')
}));

const mockPedido = (canal: 'SALON'|'DELIVERY'|'LLEVAR', id: string, estado: string, proveedor?: string): PedidoVM => ({
  id,
  canal,
  estado,
  estadoLabel: estado,
  estadoClass: estado.toLowerCase(),
  mesaNumero: canal === 'SALON' ? '12' : undefined,
  cliente: canal === 'SALON' ? undefined : 'Test Client',
  direccion: canal === 'DELIVERY' ? 'Dir 1' : undefined,
  proveedor,
  cantidadItems: 4,
  total: 100,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // late
  items: [
    { id: '1', nombre: 'A', cantidad: 1 },
    { id: '2', nombre: 'B', cantidad: 1 },
    { id: '3', nombre: 'C', cantidad: 1 },
    { id: '4', nombre: 'D', cantidad: 1 },
  ]
} as any);

describe('TableroView', () => {
  it('renders empty columns', () => {
    render(<TableroView pedidos={[]} onAvanzar={vi.fn()} onDetalle={vi.fn()} actionLoading={null} online={true} now={Date.now()} />);
    expect(screen.getAllByText('Sin pedidos').length).toBeGreaterThan(0);
  });

  it('renders cards correctly', () => {
    const onAvanzar = vi.fn();
    const onDetalle = vi.fn();
    const p1 = mockPedido('SALON', '1234567890', 'PENDIENTE');
    const p2 = mockPedido('DELIVERY', '0987654321', 'EN_PREPARACION', 'Rappi');
    const p3 = mockPedido('LLEVAR', '1111111111', 'LISTO');
    delete (p3 as any).cliente;

    render(<TableroView pedidos={[p1, p2, p3]} onAvanzar={onAvanzar} onDetalle={onDetalle} actionLoading={null} online={true} now={Date.now()} />);
    
    expect(screen.getByText('Mesa 12')).toBeInTheDocument();
    expect(screen.getByText('Dir 1')).toBeInTheDocument();
    expect(screen.getByText('Rappi')).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getAllByText('+1 más').length).toBeGreaterThan(0);

    // click detail
    fireEvent.click(screen.getAllByRole('button', { name: /Ver detalle/i })[0]);
    expect(onDetalle).toHaveBeenCalledWith(p1);

    // click avanzar
    fireEvent.click(screen.getAllByRole('button', { name: /Avanzar Test/i })[0]);
    expect(onAvanzar).toHaveBeenCalledWith(p1);
  });

  it('shows spinner for actionLoading', () => {
    const p1 = mockPedido('SALON', '1234567890', 'PENDIENTE');
    const { container } = render(<TableroView pedidos={[p1]} onAvanzar={vi.fn()} onDetalle={vi.fn()} actionLoading={p1.id} online={true} now={Date.now()} />);
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });
});
