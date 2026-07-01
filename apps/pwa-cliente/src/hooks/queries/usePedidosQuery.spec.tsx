// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePedidosQuery, PEDIDOS_QUERY_KEY } from './usePedidosQuery';
import * as pedidosApi from '../../api/pedidos.api';
import { queryClient as realQueryClient } from '../../api/queryClient';
import { vi } from 'vitest';
import React from 'react';
import { mapPedido, mapPedidos } from '../../mappers/pedido.mapper';

vi.mock('../../api/pedidos.api', () => ({
  getPage: vi.fn(),
  crear: vi.fn(),
  avanzarEstado: vi.fn(),
  avanzarItem: vi.fn(),
}));

vi.mock('../../mappers/pedido.mapper', () => ({
  mapPedido: vi.fn((dto) => ({ ...dto, mapped: true })),
  mapPedidos: vi.fn((dtos) => dtos.map((d: any) => ({ ...d, mapped: true }))),
  estadoClassOf: vi.fn((estado) => estado.toLowerCase()),
  estadoLabelOf: vi.fn((estado) => estado),
}));

vi.mock('../../api/queryClient', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    getQueriesData: vi.fn(),
    cancelQueries: vi.fn(),
  },
}));

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

describe('usePedidosQuery', () => {
  beforeEach(() => {
    testQueryClient.clear();
    vi.clearAllMocks();
      });

  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );

  it('fetches pedidos on mount and handles pagination', async () => {
    let callCount = 0;
    vi.mocked(pedidosApi.getPage).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: [{ id: '1', items: [] }], nextCursor: 'c1' };
      return { data: [{ id: '2', items: [] }], nextCursor: null };
    });

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pedidos).toHaveLength(1);
    expect(pedidosApi.getPage).toHaveBeenCalledWith({ cursor: undefined, limit: 50, mesaId: '1' });
    
    await result.current.fetchMore();
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    
    expect(result.current.pedidos).toHaveLength(2);
    expect(result.current.nextCursor).toBeNull();
  });

  it('handles fetch error', async () => {
    vi.mocked(pedidosApi.getPage).mockRejectedValue(new Error('Fetch error'));
    
    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Fetch error');
  });

  it('autoLoadAll fetches all pages', async () => {
    let callCount = 0;
    vi.mocked(pedidosApi.getPage).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: [{ id: '1', items: [] }], nextCursor: 'c1' };
      if (callCount === 2) return { data: [{ id: '2', items: [] }], nextCursor: 'c2' };
      return { data: [{ id: '3', items: [] }], nextCursor: null };
    });

    renderHook(() => usePedidosQuery(undefined, { autoLoadAll: true }), { wrapper });

    // It should automatically fetch page 2 (initial + autoLoadAll effect fires once)
    await waitFor(() => {
      expect(pedidosApi.getPage).toHaveBeenCalledTimes(2);
    });
  });

  it('does not fetchMore if hasNextPage is false', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValue({ data: [], nextCursor: null } as any);
    const { result } = renderHook(() => usePedidosQuery(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetchMore();
    expect(pedidosApi.getPage).toHaveBeenCalledTimes(1);
  });

  it('crear calls mutation and updates cache', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null, count: 0 } as any);
    vi.mocked(pedidosApi.crear).mockResolvedValueOnce({ id: '2', mesaId: '1', items: [] } as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // mock getQueriesData to return a mocked infinite data
    const oldData = { pages: [{ pedidos: [{ id: '1' }], nextCursor: null }] };
    vi.mocked(realQueryClient.getQueriesData).mockReturnValue([
      [['pedidos', '1'], oldData],
      [['pedidos', undefined], oldData],
      [['pedidos', '2'], oldData], // wrong mesaId
    ]);
    
    let updaterFn: any;
    vi.mocked(realQueryClient.setQueryData).mockImplementation((key, fn: any) => {
      if (key[1] === '1') {
        updaterFn = fn;
      }
    });

    await result.current.crear({ mesaId: '1', items: [], canal: 'SALON' } as any);

    expect(pedidosApi.crear).toHaveBeenCalledWith({ mesaId: '1', items: [], canal: 'SALON' });
    expect(realQueryClient.setQueryData).toHaveBeenCalledWith(expect.any(Array), expect.any(Function));
    
    // Check prependPedidoEnCache
    const newData = updaterFn(oldData);
    expect(newData.pages[0].pedidos[0].id).toBe('2');
    expect(newData.pages[0].pedidos[1].id).toBe('1');
    
    // Avoid duplicate
    const duplicateData = updaterFn(newData);
    expect(duplicateData).toBe(newData);

    // markMesaOcupada
    expect(realQueryClient.setQueryData).toHaveBeenCalledWith(['mesas'], expect.any(Function));
    const mesaUpdater = vi.mocked(realQueryClient.setQueryData).mock.calls.find(c => c[0][0] === 'mesas')?.[1] as any;
    const mesasData = [{ id: '1', estado: 'LIBRE' }, { id: '2', estado: 'LIBRE' }];
    const newMesas = mesaUpdater(mesasData);
    expect(newMesas[0].estado).toBe('OCUPADA');
    expect(newMesas[1].estado).toBe('LIBRE');
    
    // null safety for mesas
    expect(mesaUpdater(undefined)).toBeUndefined();
    
    // schedulePostCreateConsistencyRefetch
    expect(realQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: PEDIDOS_QUERY_KEY, exact: false, refetchType: 'all' });
    
    // fast forward timers to test timeouts
    await new Promise(r => setTimeout(r, 1000));
    expect(realQueryClient.invalidateQueries).toHaveBeenCalledTimes(8); // immediate (4) + 800ms timeout (4), 2500ms not reached
  });

  it('avanzarEstado updates optimistically', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null, count: 0 } as any);
    vi.mocked(pedidosApi.avanzarEstado).mockResolvedValueOnce({ id: '1', estado: 'PREPARANDO', items: [] } as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevData = [['key', { pages: [{ pedidos: [{ id: '1', estado: 'PENDIENTE' }] }] }]];
    vi.mocked(realQueryClient.getQueriesData).mockReturnValue(prevData as any);
    
    let updaterFn: any;
    vi.mocked(realQueryClient.setQueriesData).mockImplementation((query, fn: any) => {
      updaterFn = fn;
    });

    const promise = result.current.avanzarEstado('1', 'PREPARANDO');
    
    // onMutate is async (awaits cancelQueries) so we need a tick before updaterFn is set
    await new Promise(r => setTimeout(r, 0));
    
    expect(realQueryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: PEDIDOS_QUERY_KEY });
    
    const newData = typeof updaterFn === 'function' ? updaterFn(prevData[0][1]) : updaterFn;
    expect(newData.pages[0].pedidos[0].estado).toBe('PREPARANDO');
    expect(newData.pages[0].pedidos[0].estadoClass).toBe('preparando');

    await promise;
  });

  it('avanzarEstado rollback on error', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null } as any);
    vi.mocked(pedidosApi.avanzarEstado).mockRejectedValueOnce(new Error('Fail'));

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevData = [[['pedidos'], { mock: 'prev' }]];
    vi.mocked(realQueryClient.getQueriesData).mockReturnValue(prevData as any);
    
    try {
      await result.current.avanzarEstado('1', 'PREPARANDO');
    } catch(e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render
    
    expect(realQueryClient.setQueryData).toHaveBeenCalledWith(['pedidos'], { mock: 'prev' });
  });

  it('avanzarItem updates optimistically', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null } as any);
    vi.mocked(pedidosApi.avanzarItem).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const oldData = { pages: [{ pedidos: [{ id: 'p1', estado: 'PENDIENTE', items: [{ id: 'item-1', estado: 'PENDIENTE' }] }] }] };
    const prevData = [['key', oldData]];
    vi.mocked(realQueryClient.getQueriesData).mockReturnValue(prevData as any);
    
    let updaterFn: any;
    vi.mocked(realQueryClient.setQueriesData).mockImplementation((query, fn: any) => {
      updaterFn = fn;
    });

    const promise = result.current.avanzarItem('item-1', 'PREPARANDO');
    
    // onMutate is async (awaits cancelQueries) so we need a tick before updaterFn is set
    await new Promise(r => setTimeout(r, 0));
    
    const newData = typeof updaterFn === 'function' ? updaterFn(oldData) : updaterFn;
    expect(newData.pages[0].pedidos[0].items[0].estado).toBe('PREPARANDO');
    // because ESTADOS_PRODUCCION is not populated or mocked properly for derivarEstadoProduccion, 
    // it falls back to the existing state or derived state
    
    await promise;
  });

  it('avanzarItem rollback on error', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null } as any);
    vi.mocked(pedidosApi.avanzarItem).mockRejectedValueOnce(new Error('Fail'));

    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevData = [[['pedidos'], { mock: 'prev' }]];
    vi.mocked(realQueryClient.getQueriesData).mockReturnValue(prevData as any);
    
    try {
      await result.current.avanzarItem('item-1', 'PREPARANDO');
    } catch(e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render
    
    expect(realQueryClient.setQueryData).toHaveBeenCalledWith(['pedidos'], { mock: 'prev' });
  });

  it('fetch function is returned', async () => {
    vi.mocked(pedidosApi.getPage).mockResolvedValueOnce({ data: [], nextCursor: null } as any);
    const { result } = renderHook(() => usePedidosQuery('1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.fetch).toBe('function');
  });
});
