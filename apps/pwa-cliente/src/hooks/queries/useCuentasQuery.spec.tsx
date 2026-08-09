// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCuentasQuery, retryCuentas } from './useCuentasQuery';
import * as cuentasApi from '../../api/cuentas.api';
import { mapCuenta } from '../../mappers/cuenta.mapper';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/cuentas.api', () => ({
  getByMesa: vi.fn(),
  abrir: vi.fn(),
  registrarPago: vi.fn(),
  cerrar: vi.fn(),
  dividir: vi.fn(),
}));

vi.mock('../../mappers/cuenta.mapper', () => ({
  mapCuenta: vi.fn((dto) => ({ ...dto, mapped: true })),
}));

vi.mock('../../api/queryClient', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  },
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    // retryDelay: 0 hace instantáneos los reintentos que ahora hace el hook
    // (retryCuentas) para el caso de error no-404, sin esperar backoffs reales.
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('retryCuentas (predicado de reintento T-03)', () => {
  it('no reintenta en 404 (cuenta inexistente)', () => {
    expect(retryCuentas(0, { status: 404 })).toBe(false);
  });
  it('reintenta un 503 hasta 2 veces y luego se detiene', () => {
    expect(retryCuentas(0, { status: 503 })).toBe(true);
    expect(retryCuentas(1, { status: 503 })).toBe(true);
    expect(retryCuentas(2, { status: 503 })).toBe(false);
  });
});

describe('useCuentasQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not fetch if mesaId is undefined', () => {
    const { result } = renderHook(() => useCuentasQuery(), { wrapper: createWrapper() });
    expect(result.current.cuentaActiva).toBeNull();
    expect(cuentasApi.getByMesa).not.toHaveBeenCalled();
  });

  it('should fetch cuenta if mesaId is provided', async () => {
    vi.mocked(cuentasApi.getByMesa).mockResolvedValue({ id: 'c1' } as any);
    
    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(cuentasApi.getByMesa).toHaveBeenCalledWith('m1');
    expect(mapCuenta).toHaveBeenCalledWith({ id: 'c1' });
    expect(result.current.cuentaActiva).toEqual({ id: 'c1', mapped: true });
  });

  it('should return null if API returns 404', async () => {
    vi.mocked(cuentasApi.getByMesa).mockRejectedValue({ status: 404 });
    
    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cuentaActiva).toBeNull();
    expect(result.current.error).toBeNull(); // it suppresses 404
  });

  it('should expose error if API returns non-404 error', async () => {
    vi.mocked(cuentasApi.getByMesa).mockRejectedValue(new Error('Network Error'));
    
    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network Error');
  });

  it('should handle cargar method', async () => {
    vi.mocked(cuentasApi.getByMesa).mockResolvedValue({ id: 'c1' } as any);
    
    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));
    
    await result.current.cargar('m1'); // same mesa, should refetch
    expect(cuentasApi.getByMesa).toHaveBeenCalledTimes(2);

    await result.current.cargar('m2'); // different mesa, does nothing manually, handled by reactivity
    expect(cuentasApi.getByMesa).toHaveBeenCalledTimes(2);
  });

  it('should handle abrir method', async () => {
    vi.mocked(cuentasApi.abrir).mockResolvedValue({ id: 'c2' } as any);

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await result.current.abrir('m1');
    
    expect(cuentasApi.abrir).toHaveBeenCalledWith('m1');
    expect(queryClient.setQueryData).toHaveBeenCalledWith(expect.any(Array), { id: 'c2', mapped: true });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['mesas'] });
    await waitFor(() => expect(result.current.success).toBe('Cuenta abierta.'));
  });

  it('should handle registrarPago method', async () => {
    vi.mocked(cuentasApi.registrarPago).mockResolvedValue({ ticket: 't1' } as any);

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    const respuesta = await result.current.registrarPago({ monto: 100 } as any);

    // La respuesta se devuelve (no se descarta): CobroMesaDrawer la usa para
    // mostrar la boleta interna imprimible sin esperar al re-render del hook.
    expect(respuesta).toEqual({ ticket: 't1' });
    expect(cuentasApi.registrarPago).toHaveBeenCalledWith({ monto: 100 });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['cuentas'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['mesas'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['pedidos'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['caja'] });
    await waitFor(() => expect(result.current.success).toBe('Pago registrado correctamente.'));
    
    await waitFor(() => {
      expect(result.current.ticket).toBe('t1');
    });
  });

  it('registrarPago refleja el mensaje degradado del backend cuando existe (T-04)', async () => {
    vi.mocked(cuentasApi.registrarPago).mockResolvedValue({ message: 'Pago registrado; cierre de cuenta en proceso', ticket: 't9' } as any);

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });

    await result.current.registrarPago({ monto: 100 } as any);

    await waitFor(() => expect(result.current.success).toBe('Pago registrado; cierre de cuenta en proceso'));
  });

  it('expone refetchCuenta que dispara el refetch del query (T-04)', async () => {
    vi.mocked(cuentasApi.getByMesa).mockResolvedValue({ id: 'c1' } as any);

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.refetchCuenta();
    expect(cuentasApi.getByMesa).toHaveBeenCalledTimes(2);
  });

  it('should handle cerrar method', async () => {
    vi.mocked(cuentasApi.getByMesa).mockResolvedValue({ id: 'c1' } as any);
    vi.mocked(cuentasApi.cerrar).mockResolvedValue({ message: 'Closed', ticket: 't2' } as any);

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.cerrar(10);
    
    expect(cuentasApi.cerrar).toHaveBeenCalledWith('c1', { descuento: 10 });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(expect.any(Array), null);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['mesas'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['pedidos'] });
    
    await waitFor(() => {
      expect(result.current.success).toBe('Closed');
      expect(result.current.ticket).toBe('t2');
    });
  });

  it('should ignore cerrar if no cuenta.id', async () => {
    vi.mocked(cuentasApi.getByMesa).mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.cerrar();
    expect(cuentasApi.cerrar).not.toHaveBeenCalled();
  });

  it('should handle dividir method', async () => {
    vi.mocked(cuentasApi.getByMesa).mockResolvedValue({ id: 'c1' } as any);
    vi.mocked(cuentasApi.dividir).mockResolvedValue({ newAccounts: [] } as any);

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.dividir({} as any);
    
    expect(cuentasApi.dividir).toHaveBeenCalledWith('c1', {});
    
    await waitFor(() => {
      expect(result.current.division).toEqual({ newAccounts: [] });
    });
  });

  it('should ignore dividir if no cuenta.id', async () => {
    vi.mocked(cuentasApi.getByMesa).mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.dividir({} as any);
    expect(cuentasApi.dividir).not.toHaveBeenCalled();
  });

  it('should handle clearFeedback', async () => {
    vi.mocked(cuentasApi.abrir).mockRejectedValue(new Error('Abrir Error'));

    const { result } = renderHook(() => useCuentasQuery('m1'), { wrapper: createWrapper() });
    
    try { await result.current.abrir('m1'); } catch (e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render

    expect(result.current.error).toBe('Abrir Error');

    result.current.clearFeedback();
    
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });
});
