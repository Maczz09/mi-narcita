// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMermasQuery } from './useMermasQuery';
import * as inventarioApi from '../../api/inventario.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/inventario.api', () => ({
  getMermas: vi.fn(),
  registrarMerma: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const dtoBase = {
  id: 'merma-1',
  productoId: 'prod-1',
  producto: { id: 'prod-1', categoriaId: 'c1', nombre: 'Cerveza', precio: 8, disponible: true, stockActual: 7 },
  cantidad: 3,
  motivo: 'Botellas rotas',
  usuarioId: 'u-1',
  usuarioNombre: 'Ana',
  createdAt: '2026-08-09T20:00:00.000Z',
};

const createWrapper = () => {
  const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useMermasQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carga y mapea el historial de mermas', async () => {
    vi.mocked(inventarioApi.getMermas).mockResolvedValue([dtoBase]);

    const { result } = renderHook(() => useMermasQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.mermas).toHaveLength(1);
    expect(result.current.mermas[0].productoNombre).toBe('Cerveza');
    expect(result.current.mermas[0].cantidad).toBe(3);
    expect(result.current.mermas[0].motivo).toBe('Botellas rotas');
  });

  it('registra una merma e invalida el historial y el catálogo', async () => {
    vi.mocked(inventarioApi.getMermas).mockResolvedValue([]);
    vi.mocked(inventarioApi.registrarMerma).mockResolvedValue(dtoBase);

    const { result } = renderHook(() => useMermasQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.registrarMerma({ productoId: 'prod-1', cantidad: 3, motivo: 'Botellas rotas' });

    expect(inventarioApi.registrarMerma).toHaveBeenCalledWith({ productoId: 'prod-1', cantidad: 3, motivo: 'Botellas rotas' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['mermas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['inventario-productos'] }));
  });
});
