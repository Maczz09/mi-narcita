import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePedidosQuery } from './usePedidosQuery';
import * as pedidosApi from '../../api/pedidos.api';
import { vi } from 'vitest';
import React from 'react';

vi.mock('../../api/pedidos.api', () => ({
  getPage: vi.fn(),
  crear: vi.fn(),
  avanzarEstado: vi.fn(),
  avanzarItem: vi.fn(),
}));

describe('usePedidosQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches pedidos on mount', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({
      data: [{ id: '1', mesaId: '1', estado: 'PENDIENTE', items: [] }],
      nextCursor: null,
      count: 1,
    } as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pedidos).toHaveLength(1);
    expect(pedidosApi.getPage).toHaveBeenCalledWith({ cursor: undefined, limit: 50, mesaId: '1' });
  });

  it('crear calls mutation', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null, count: 0 } as any);
    vi.mocked(pedidosApi.crear).mockResolvedValueOnce({ id: '2', mesaId: '1', estado: 'PENDIENTE', items: [] } as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });

    await result.current.crear({ mesaId: '1', items: [], canal: 'SALON' } as any);

    expect(pedidosApi.crear).toHaveBeenCalledWith({ mesaId: '1', items: [], canal: 'SALON' });
  });

  it('avanzarEstado calls mutation', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null, count: 0 } as any);
    vi.mocked(pedidosApi.avanzarEstado).mockResolvedValueOnce({ id: '1', estado: 'PREPARANDO', items: [] } as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });

    await result.current.avanzarEstado('1', 'PREPARANDO');

    expect(pedidosApi.avanzarEstado).toHaveBeenCalledWith('1', { estado: 'PREPARANDO' });
  });

  it('avanzarItem calls mutation', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null, count: 0 } as any);
    vi.mocked(pedidosApi.avanzarItem).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });

    await result.current.avanzarItem('item-1', 'PREPARANDO');

    expect(pedidosApi.avanzarItem).toHaveBeenCalledWith('item-1', { estado: 'PREPARANDO' });
  });
});
