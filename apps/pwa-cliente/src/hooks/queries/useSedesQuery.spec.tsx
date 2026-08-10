// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSedesQuery, SEDES_QUERY_KEY } from './useSedesQuery';
import * as sedesApi from '../../api/sedes.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/sedes.api', () => ({
  getAll: vi.fn(),
  crear: vi.fn(),
  actualizar: vi.fn(),
  eliminar: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useSedesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches sedes', async () => {
    vi.mocked(sedesApi.getAll).mockResolvedValue([{ id: 's1', nombre: 'Sede 1', activa: true } as any]);

    const { result } = renderHook(() => useSedesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sedes).toEqual([{ id: 's1', nombre: 'Sede 1', activa: true }]);
  });

  it('handles error', async () => {
    vi.mocked(sedesApi.getAll).mockRejectedValue(new Error('Sedes Error'));

    const { result } = renderHook(() => useSedesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Sedes Error');
  });

  it('crea una sede e invalida la caché', async () => {
    vi.mocked(sedesApi.getAll).mockResolvedValue([]);
    vi.mocked(sedesApi.crear).mockResolvedValue({ id: 's1', nombre: 'Nueva' } as any);

    const { result } = renderHook(() => useSedesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.crearSede({ nombre: 'Nueva' });

    expect(sedesApi.crear).toHaveBeenCalledWith({ nombre: 'Nueva' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SEDES_QUERY_KEY }));
  });

  it('actualiza una sede e invalida la caché', async () => {
    vi.mocked(sedesApi.getAll).mockResolvedValue([]);
    vi.mocked(sedesApi.actualizar).mockResolvedValue({ id: 's1', nombre: 'Editada' } as any);

    const { result } = renderHook(() => useSedesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizarSede('s1', { activa: false });

    expect(sedesApi.actualizar).toHaveBeenCalledWith('s1', { activa: false });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SEDES_QUERY_KEY }));
  });

  it('elimina una sede e invalida la caché', async () => {
    vi.mocked(sedesApi.getAll).mockResolvedValue([]);
    vi.mocked(sedesApi.eliminar).mockResolvedValue(undefined);

    const { result } = renderHook(() => useSedesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.eliminarSede('s1');

    expect(sedesApi.eliminar).toHaveBeenCalledWith('s1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: SEDES_QUERY_KEY }));
  });

  it('handles clearFeedback', async () => {
    vi.mocked(sedesApi.getAll).mockResolvedValue([]);
    vi.mocked(sedesApi.crear).mockRejectedValue(new Error('Crear Error'));

    const { result } = renderHook(() => useSedesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.crearSede({ nombre: 'x' }); } catch { /* esperado */ }
    await waitFor(() => expect(result.current.error).toBe('Crear Error'));

    result.current.clearFeedback();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
