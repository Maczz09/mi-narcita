// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUsuariosQuery, USUARIOS_QUERY_KEY } from './useUsuariosQuery';
import * as usuariosApi from '../../api/usuarios.api';
import { mapUsuarios, mapUsuario } from '../../mappers/usuario.mapper';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/usuarios.api', () => ({
  getPage: vi.fn(),
  crear: vi.fn(),
  cambiarRol: vi.fn(),
}));

vi.mock('../../mappers/usuario.mapper', () => ({
  mapUsuarios: vi.fn((dtos) => dtos.map((d: any) => ({ ...d, mapped: true }))),
  mapUsuario: vi.fn((dto) => ({ ...dto, mapped: true })),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueriesData: vi.fn(),
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

describe('useUsuariosQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and map usuarios page', async () => {
    vi.mocked(usuariosApi.getPage).mockResolvedValue({ data: [{ id: 'u1' }], nextCursor: 'cur1' });

    const { result } = renderHook(() => useUsuariosQuery({ rol: 'ADMIN', search: 'test' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(usuariosApi.getPage).toHaveBeenCalledWith({ cursor: undefined, limit: 20, rol: 'ADMIN', search: 'test' });
    expect(mapUsuarios).toHaveBeenCalledWith([{ id: 'u1' }]);
    expect(result.current.usuarios).toEqual([{ id: 'u1', mapped: true }]);
    expect(result.current.nextCursor).toBe('cur1');
  });

  it('should fetchMore', async () => {
    let calls = 0;
    vi.mocked(usuariosApi.getPage).mockImplementation(async () => {
      calls++;
      if (calls === 1) return { data: [{ id: 'u1' }], nextCursor: 'cur1' };
      return { data: [{ id: 'u2' }], nextCursor: null };
    });

    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetchMore();
    
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.usuarios).toEqual([
      { id: 'u1', mapped: true },
      { id: 'u2', mapped: true }
    ]);
    expect(result.current.nextCursor).toBeNull();
  });

  it('should handle fetchMore when no more pages', async () => {
    vi.mocked(usuariosApi.getPage).mockResolvedValue({ data: [{ id: 'u1' }], nextCursor: null });

    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetchMore();

    expect(usuariosApi.getPage).toHaveBeenCalledTimes(1);
  });

  it('should handle error', async () => {
    vi.mocked(usuariosApi.getPage).mockRejectedValue(new Error('Page Error'));

    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Page Error');
  });

  it('should crear usuario and update cache', async () => {
    vi.mocked(usuariosApi.getPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(usuariosApi.crear).mockResolvedValue({ id: 'u1' } as any);

    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let updaterFn: any;
    vi.mocked(queryClient.setQueriesData).mockImplementation((filters, fn: any) => {
      updaterFn = fn;
    });

    await result.current.crear({} as any);

    expect(usuariosApi.crear).toHaveBeenCalledWith({});
    expect(queryClient.setQueriesData).toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: USUARIOS_QUERY_KEY }));

    // Test updater fn
    const newUsuario = { id: 'u1', mapped: true };
    const oldData = { pages: [{ usuarios: [{ id: 'u2' }], nextCursor: null }] };
    const newData = updaterFn(oldData);
    expect(newData.pages[0].usuarios).toEqual([newUsuario, { id: 'u2' }]);
    
    // update existing
    const oldData2 = { pages: [{ usuarios: [newUsuario], nextCursor: null }] };
    const newData2 = updaterFn(oldData2);
    expect(newData2.pages[0].usuarios).toEqual([newUsuario]);

    // null current
    const newDataNull = updaterFn(null);
    expect(newDataNull).toBeNull();
    
    const newDataEmpty = updaterFn({ pages: [] });
    expect(newDataEmpty).toEqual({ pages: [] });
  });

  it('should cambiarRol usuario', async () => {
    vi.mocked(usuariosApi.getPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(usuariosApi.cambiarRol).mockResolvedValue({ id: 'u1' } as any);

    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.cambiarRol('u1', 'ADMIN');

    expect(usuariosApi.cambiarRol).toHaveBeenCalledWith('u1', { rol: 'ADMIN' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: USUARIOS_QUERY_KEY }));
  });

  it('should fetch fetch', async () => {
    vi.mocked(usuariosApi.getPage).mockResolvedValue({ data: [], nextCursor: null });
    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.fetch).toBe('function');
  });
  
  it('should handle clearFeedback', async () => {
    vi.mocked(usuariosApi.getPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(usuariosApi.crear).mockRejectedValue(new Error('Crear Error'));

    const { result } = renderHook(() => useUsuariosQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.crear({} as any); } catch(e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render

    expect(result.current.error).toBe('Crear Error');

    result.current.clearFeedback();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
