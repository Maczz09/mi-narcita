// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHistorialCajaQuery, useTurnoDetalleQuery } from './useHistorialCajaQuery';
import * as cajaApi from '../../api/caja.api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/caja.api', () => ({
  listarTurnos: vi.fn(),
  obtenerResumenTurno: vi.fn(),
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useHistorialCajaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista los turnos y expone nextCursor', async () => {
    vi.mocked(cajaApi.listarTurnos).mockResolvedValue({
      data: [{ id: 't1' } as any],
      nextCursor: 'cur1',
    });

    const { result } = renderHook(() => useHistorialCajaQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.turnos).toEqual([{ id: 't1' }]);
    expect(result.current.nextCursor).toBe('cur1');
  });

  it('pasa el filtro estado/desde/hasta al API', async () => {
    vi.mocked(cajaApi.listarTurnos).mockResolvedValue({ data: [], nextCursor: null });

    const { result } = renderHook(
      () => useHistorialCajaQuery({ estado: 'CERRADA', desde: '2026-06-01', hasta: '2026-06-30' }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(cajaApi.listarTurnos).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'CERRADA', desde: '2026-06-01', hasta: '2026-06-30' }),
    );
  });

  it('trae más páginas con fetchMore', async () => {
    let calls = 0;
    vi.mocked(cajaApi.listarTurnos).mockImplementation(async () => {
      calls++;
      if (calls === 1) return { data: [{ id: 't1' } as any], nextCursor: 'cur1' };
      return { data: [{ id: 't2' } as any], nextCursor: null };
    });

    const { result } = renderHook(() => useHistorialCajaQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetchMore();
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.turnos).toEqual([{ id: 't1' }, { id: 't2' }]);
    expect(result.current.nextCursor).toBeNull();
  });

  it('reporta errores', async () => {
    vi.mocked(cajaApi.listarTurnos).mockRejectedValue(new Error('Historial Error'));

    const { result } = renderHook(() => useHistorialCajaQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Historial Error');
  });
});

describe('useTurnoDetalleQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no consulta si turnoId es null', () => {
    const { result } = renderHook(() => useTurnoDetalleQuery(null), { wrapper: createWrapper() });
    expect(cajaApi.obtenerResumenTurno).not.toHaveBeenCalled();
    expect(result.current.detalle).toBeNull();
  });

  it('consulta el detalle cuando hay turnoId', async () => {
    vi.mocked(cajaApi.obtenerResumenTurno).mockResolvedValue({ turno: { id: 't1' } } as any);

    const { result } = renderHook(() => useTurnoDetalleQuery('t1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(cajaApi.obtenerResumenTurno).toHaveBeenCalledWith('t1');
    expect(result.current.detalle).toEqual({ turno: { id: 't1' } });
  });

  it('reporta errores del detalle', async () => {
    vi.mocked(cajaApi.obtenerResumenTurno).mockRejectedValue(new Error('Detalle Error'));

    const { result } = renderHook(() => useTurnoDetalleQuery('t1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Detalle Error');
  });
});
