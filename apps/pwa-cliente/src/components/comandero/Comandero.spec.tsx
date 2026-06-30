import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Comandero } from './Comandero';

jest.mock('../../hooks/queries/useInventarioQuery', () => ({
  useInventarioQuery: () => ({
    data: { items: [], nextCursor: null },
    isLoading: false,
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
  })
}));

jest.mock('../../hooks/queries/useMesasQuery', () => ({
  useMesasQuery: () => ({
    data: []
  })
}));

jest.mock('../../hooks/queries/usePedidosQuery', () => ({
  usePedidosQuery: () => ({
    crear: { mutateAsync: jest.fn(), isPending: false }
  })
}));

jest.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

jest.mock('../../hooks/useComanda', () => ({
  useComanda: () => ({
    cart: [],
    canal: 'SALON',
    mesaId: '1',
    cliente: '',
    nota: '',
    add: jest.fn(),
    del: jest.fn(),
    upd: jest.fn(),
    setCanal: jest.fn(),
    setMesa: jest.fn(),
    setCliente: jest.fn(),
    setNota: jest.fn(),
    valid: true,
    total: 0,
    reset: jest.fn()
  })
}));

jest.mock('../ui/ToastProvider', () => ({
  useToast: () => ({ show: jest.fn() })
}));

describe('Comandero', () => {
  it('debe renderizar el título de Nuevo pedido', () => {
    render(<Comandero onClose={jest.fn()} />);
    expect(screen.getByText('Nuevo pedido')).toBeInTheDocument();
  });

  it('debe permitir cambiar de canal', () => {
    render(<Comandero onClose={jest.fn()} />);
    const btnDelivery = screen.getByText('Delivery');
    fireEvent.click(btnDelivery);
    expect(btnDelivery).toBeInTheDocument();
  });

  it('debe mostrar estado de carga vacío', () => {
    // Si no hay productos, mostrará "Sin resultados"
    render(<Comandero onClose={jest.fn()} />);
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });
});