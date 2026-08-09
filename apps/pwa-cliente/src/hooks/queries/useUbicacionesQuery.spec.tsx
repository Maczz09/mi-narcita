// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUbicacionesQuery, UBICACIONES_QUERY_KEY } from './useUbicacionesQuery';
import * as mesasApi from '../../api/mesas.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/mesas.api', () => ({
  getUbicaciones: vi.fn(),
  crearUbicacion: vi.fn(),
  actualizarUbicacion: vi.fn(),
  eliminarUbicacion: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useUbicacionesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and sorts ubicaciones by nombre', async () => {
    vi.mocked(mesasApi.getUbicaciones).mockResolvedValue([
      { id: 'u2', nombre: 'Terraza' },
      { id: 'u1', nombre: 'Barra' },
    ] as any);

    const { result } = renderHook(() => useUbicacionesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mesasApi.getUbicaciones).toHaveBeenCalled();
    expect(result.current.ubicaciones).toEqual([
      { id: 'u1', nombre: 'Barra' },
      { id: 'u2', nombre: 'Terraza' },
    ]);
    expect(result.current.loadError).toBeNull();
  });

  it('exposes error if load fails', async () => {
    vi.mocked(mesasApi.getUbicaciones).mockRejectedValue(new Error('Load Error'));

    const { result } = renderHook(() => useUbicacionesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe('Load Error');
    expect(result.current.error).toBe('Load Error');
  });

  it('crearUbicacion invalidates the ubicaciones list', async () => {
    vi.mocked(mesasApi.getUbicaciones).mockResolvedValue([] as any);
    vi.mocked(mesasApi.crearUbicacion).mockResolvedValue({ id: 'u1', nombre: 'Azotea' } as any);

    const { result } = renderHook(() => useUbicacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.crearUbicacion({ nombre: 'Azotea' });

    expect(mesasApi.crearUbicacion).toHaveBeenCalledWith({ nombre: 'Azotea' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: UBICACIONES_QUERY_KEY });
    await waitFor(() => expect(result.current.success).toBe('Ubicación creada.'));
  });

  it('actualizarUbicacion invalidates both ubicaciones and mesas (el nombre va denormalizado en cada mesa)', async () => {
    vi.mocked(mesasApi.getUbicaciones).mockResolvedValue([] as any);
    vi.mocked(mesasApi.actualizarUbicacion).mockResolvedValue({ id: 'u1', nombre: 'Salón Principal' } as any);

    const { result } = renderHook(() => useUbicacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizarUbicacion('u1', { nombre: 'Salón Principal' });

    expect(mesasApi.actualizarUbicacion).toHaveBeenCalledWith('u1', { nombre: 'Salón Principal' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: UBICACIONES_QUERY_KEY });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['mesas'] });
    await waitFor(() => expect(result.current.success).toBe('Ubicación actualizada.'));
  });

  it('eliminarUbicacion invalidates the ubicaciones list and surfaces backend error', async () => {
    vi.mocked(mesasApi.getUbicaciones).mockResolvedValue([] as any);
    vi.mocked(mesasApi.eliminarUbicacion).mockRejectedValue(new Error('No se puede eliminar: tiene 3 mesa(s) asociada(s).'));

    const { result } = renderHook(() => useUbicacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.eliminarUbicacion('u1'); } catch { /* esperado */ }
    await waitFor(() => expect(result.current.error).toBe('No se puede eliminar: tiene 3 mesa(s) asociada(s).'));

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: UBICACIONES_QUERY_KEY });
  });

  it('handles clearFeedback', async () => {
    vi.mocked(mesasApi.getUbicaciones).mockResolvedValue([] as any);
    vi.mocked(mesasApi.crearUbicacion).mockRejectedValue(new Error('Crear Error'));

    const { result } = renderHook(() => useUbicacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.crearUbicacion({ nombre: 'X' }); } catch { /* esperado */ }
    await waitFor(() => expect(result.current.error).toBe('Crear Error'));

    result.current.clearFeedback();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
