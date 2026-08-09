// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTransaccionDetalleQuery } from './useTransaccionDetalleQuery';
import * as cajaApi from '../../api/caja.api';
import * as cuentasApi from '../../api/cuentas.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/caja.api', () => ({
  obtenerTransaccion: vi.fn(),
  actualizarTransaccion: vi.fn(),
}));

vi.mock('../../api/cuentas.api', () => ({
  getById: vi.fn(),
}));

vi.mock('../../mappers/cuenta.mapper', () => ({
  mapCuenta: vi.fn((dto: any) => ({ ...dto, mapped: true })),
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

describe('useTransaccionDetalleQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carga la transacción y la cuenta vinculada', async () => {
    vi.mocked(cajaApi.obtenerTransaccion).mockResolvedValue({ id: 't1', metodo: 'EFECTIVO' } as any);
    vi.mocked(cuentasApi.getById).mockResolvedValue({ id: 'c1' } as any);

    const { result } = renderHook(() => useTransaccionDetalleQuery('t1', 'c1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(cajaApi.obtenerTransaccion).toHaveBeenCalledWith('t1');
    expect(cuentasApi.getById).toHaveBeenCalledWith('c1');
    expect(result.current.transaccion).toEqual({ id: 't1', metodo: 'EFECTIVO' });
    expect(result.current.cuenta).toEqual({ id: 'c1', mapped: true });
  });

  it('no pide la cuenta si cuentaId es null', async () => {
    vi.mocked(cajaApi.obtenerTransaccion).mockResolvedValue({ id: 't1', metodo: 'EFECTIVO' } as any);

    const { result } = renderHook(() => useTransaccionDetalleQuery('t1', null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(cuentasApi.getById).not.toHaveBeenCalled();
    expect(result.current.cuenta).toBeNull();
  });

  it('actualiza la transacción e invalida el detalle y el resumen de caja', async () => {
    vi.mocked(cajaApi.obtenerTransaccion).mockResolvedValue({ id: 't1', metodo: 'EFECTIVO' } as any);
    vi.mocked(cajaApi.actualizarTransaccion).mockResolvedValue({ message: 'ok', transaccion: { id: 't1', metodo: 'TARJETA' } } as any);

    const { result } = renderHook(() => useTransaccionDetalleQuery('t1', null), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizar({ metodo: 'TARJETA' });

    expect(cajaApi.actualizarTransaccion).toHaveBeenCalledWith('t1', { metodo: 'TARJETA' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['caja', 'transaccion', 't1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['caja'] });
    await waitFor(() => expect(result.current.success).toBe('Cobro actualizado.'));
  });
});
