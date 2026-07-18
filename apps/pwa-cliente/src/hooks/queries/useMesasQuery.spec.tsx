// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMesasQuery, MESAS_QUERY_KEY } from './useMesasQuery';
import * as mesasApi from '../../api/mesas.api';
import { mapMesas, mapMesa } from '../../mappers/mesa.mapper';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/mesas.api', () => ({
  getAll: vi.fn(),
  cambiarEstado: vi.fn(),
  crear: vi.fn(),
}));

vi.mock('../../mappers/mesa.mapper', () => ({
  mapMesas: vi.fn((dtos) => dtos.map((d: any) => ({ ...d, mapped: true }))),
  mapMesa: vi.fn((dto) => ({ ...dto, mapped: true })),
}));

// We need to keep some real methods on queryClient for optimistic updates to work properly
const realQueryClient = new QueryClient();

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  },
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 }, // T-05: reintentos del hook instantáneos en test
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useMesasQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and map mesas', async () => {
    vi.mocked(mesasApi.getAll).mockResolvedValue([{ id: 'm1' }] as any);

    const { result } = renderHook(() => useMesasQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mesasApi.getAll).toHaveBeenCalled();
    expect(mapMesas).toHaveBeenCalledWith([{ id: 'm1' }]);
    expect(result.current.mesas).toEqual([{ id: 'm1', mapped: true }]);
    expect(result.current.loadError).toBeNull();
  });

  it('should expose error if load fails', async () => {
    vi.mocked(mesasApi.getAll).mockRejectedValue(new Error('Load Error'));

    const { result } = renderHook(() => useMesasQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe('Load Error');
    expect(result.current.error).toBe('Load Error');
  });

  it('should crearMesa and update cache', async () => {
    vi.mocked(mesasApi.getAll).mockResolvedValue([] as any);
    vi.mocked(mesasApi.crear).mockResolvedValue({ id: 'm1', numeroRaw: 1 } as any);

    const { result } = renderHook(() => useMesasQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // intercept setQueryData to test it
    let updateFn: any;
    vi.mocked(queryClient.setQueryData).mockImplementation((key, fn: any) => {
      updateFn = fn;
    });

    await result.current.crearMesa({ numero: '1' } as any);

    expect(mesasApi.crear).toHaveBeenCalledWith({ numero: '1' });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(MESAS_QUERY_KEY, expect.any(Function));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: MESAS_QUERY_KEY });
    await waitFor(() => expect(result.current.success).toBe('Mesa creada.'));

    // test the setQueryData updater fn
    const oldMesas = [{ id: 'm2', numeroRaw: 2 }];
    const newMesas = updateFn(oldMesas);
    expect(newMesas).toEqual([
      { id: 'm1', numeroRaw: 1, mapped: true },
      { id: 'm2', numeroRaw: 2 }
    ]);
    
    // test with null oldMesas
    const newMesasNull = updateFn(null);
    expect(newMesasNull).toEqual([{ id: 'm1', numeroRaw: 1, mapped: true }]);
  });

  it('should optimisticCambiarEstado and rollback on error', async () => {
    vi.mocked(mesasApi.getAll).mockResolvedValue([] as any);
    vi.mocked(mesasApi.cambiarEstado).mockRejectedValue(new Error('Cambiar Error'));
    
    const previousMesas = [{ id: 'm1', estado: 'OCUPADA' }];
    vi.mocked(queryClient.getQueryData).mockReturnValue(previousMesas);

    const { result } = renderHook(() => useMesasQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let updateFn: any;
    vi.mocked(queryClient.setQueryData).mockImplementation((key, fn: any) => {
      if (typeof fn === 'function') updateFn = fn;
    });

    try {
      await result.current.optimisticCambiarEstado('m1', 'LIBRE' as any);
    } catch(e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render

    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: MESAS_QUERY_KEY });
    expect(queryClient.getQueryData).toHaveBeenCalledWith(MESAS_QUERY_KEY);
    
    // test the optimistic updater
    const newMesas = updateFn(previousMesas);
    expect(newMesas).toEqual([{ id: 'm1', estado: 'LIBRE', estadoClass: 'libre', estadoLabel: 'LIBRE' }]);
    
    // Test rollback due to error
    expect(queryClient.setQueryData).toHaveBeenCalledWith(MESAS_QUERY_KEY, previousMesas);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: MESAS_QUERY_KEY });
    
    expect(result.current.error).toBe('Cambiar Error');
  });

  it('should handle clearFeedback', async () => {
    vi.mocked(mesasApi.getAll).mockResolvedValue([] as any);
    vi.mocked(mesasApi.crear).mockRejectedValue(new Error('Crear Error'));

    const { result } = renderHook(() => useMesasQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.crearMesa({} as any); } catch(e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render

    expect(result.current.error).toBe('Crear Error');

    result.current.clearFeedback();
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('should expose fetch', async () => {
    vi.mocked(mesasApi.getAll).mockResolvedValue([] as any);
    const { result } = renderHook(() => useMesasQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.fetch).toBe('function');
  });
});
