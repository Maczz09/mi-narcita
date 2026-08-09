// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TicketCard } from './TicketCard';
import type { PedidoVM, PedidoItemVM } from '../../types/pedido.types';

const mockPedido = (meseroNombre?: string): PedidoVM => ({
  id: '1234567890',
  mesaId: 'm1',
  mesaNumero: '01',
  items: [],
  total: 50,
  estado: 'PENDIENTE',
  estadoClass: 'badge-warn',
  estadoLabel: 'Pendiente',
  createdAt: new Date().toISOString(),
  meseroNombre,
  canal: 'SALON',
  cantidadItems: 1,
} as any);

const mockItems: PedidoItemVM[] = [
  { id: 'i1', productoId: 'p1', nombre: 'Ceviche', cantidad: 1, precioUnitario: 35, subtotal: 35, area: 'COCINA', notas: '', estado: 'PENDIENTE', estadoClass: 'badge-warn', estadoLabel: 'Pendiente' },
];

const col = { estado: 'PENDIENTE' as const, label: 'Nuevos', color: '#000' };

describe('TicketCard', () => {
  it('renders the mesero name when present', () => {
    render(
      <TicketCard
        p={mockPedido('Max Garcia')}
        items={mockItems}
        col={col}
        now={Date.now()}
        online={true}
        onAdvance={vi.fn()}
        onRegress={vi.fn()}
        onBump={vi.fn()}
      />
    );
    expect(screen.getByText('Max Garcia')).toBeInTheDocument();
  });

  it('does not render a mesero line when the name is absent', () => {
    render(
      <TicketCard
        p={mockPedido(undefined)}
        items={mockItems}
        col={col}
        now={Date.now()}
        online={true}
        onAdvance={vi.fn()}
        onRegress={vi.fn()}
        onBump={vi.fn()}
      />
    );
    expect(screen.queryByTitle(/Enviado por/)).not.toBeInTheDocument();
  });
});
