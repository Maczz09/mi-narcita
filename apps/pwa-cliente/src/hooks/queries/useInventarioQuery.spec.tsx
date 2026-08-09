// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInventarioQuery } from './useInventarioQuery';
import * as inventarioApi from '../../api/inventario.api';
import { mapProductos } from '../../mappers/inventario.mapper';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/inventario.api', () => ({
  getCategorias: vi.fn(),
  getProductosPage: vi.fn(),
  crearProducto: vi.fn(),
  reponerStock: vi.fn(),
  actualizarProducto: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  eliminarCategoria: vi.fn(),
}));

vi.mock('../../mappers/inventario.mapper', () => ({
  mapProductos: vi.fn((prods) => prods.map((p: any) => ({ ...p, mapped: true }))),
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
      queries: { retry: false, retryDelay: 0 }, // T-05: reintentos del hook instantáneos en test
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useInventarioQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch categorias and empty productos initially', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([{ id: 'cat1' }] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categorias).toEqual([{ id: 'cat1' }]);
    expect(result.current.productos).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should map fetched productos with categorias', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([{ id: 'cat1' }] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ 
      data: [{ id: 'p1' }], 
      nextCursor: 'cursor1' 
    });

    const { result } = renderHook(() => useInventarioQuery('cat1', { conStock: true, limit: 10, search: 'test' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(inventarioApi.getProductosPage).toHaveBeenCalledWith({
      categoriaId: 'cat1',
      conStock: true,
      search: 'test',
      cursor: undefined,
      limit: 10,
    });

    expect(mapProductos).toHaveBeenCalledWith([{ id: 'p1' }], [{ id: 'cat1' }]);
    expect(result.current.productos).toEqual([{ id: 'p1', mapped: true }]);
    expect(result.current.nextCursor).toBe('cursor1');
  });

  it('should handle fetch errors', async () => {
    vi.mocked(inventarioApi.getCategorias).mockRejectedValue(new Error('Cat Error'));

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Cat Error');
  });

  it('should fetch more products if nextCursor exists', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([{ id: 'cat1' }] as any);
    
    let callCount = 0;
    vi.mocked(inventarioApi.getProductosPage).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: [{ id: 'p1' }], nextCursor: 'c1' };
      return { data: [{ id: 'p2' }], nextCursor: null };
    });

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetchMore();
    
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.productos).toEqual([
      { id: 'p1', mapped: true },
      { id: 'p2', mapped: true }
    ]);
  });

  it('should handle fetch/refetch', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetch();
    
    // Should have been called twice (initial + refetch)
    expect(inventarioApi.getCategorias).toHaveBeenCalledTimes(2);
    expect(inventarioApi.getProductosPage).toHaveBeenCalledTimes(2);
  });

  it('should not fetchMore if no next page', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.fetchMore();
    expect(inventarioApi.getProductosPage).toHaveBeenCalledTimes(1); // not called again
  });

  it('should crearProducto', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.crearProducto).mockResolvedValue({ id: 'new' } as any);

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.crearProducto({ nombre: 'Test' } as any);

    expect(inventarioApi.crearProducto).toHaveBeenCalledWith({ nombre: 'Test' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inventario-productos'], exact: false, refetchType: 'active' });
    await waitFor(() => expect(result.current.success).toBe('Producto creado.'));
  });

  it('should actualizarProducto', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.actualizarProducto).mockResolvedValue({ id: 'p1' } as any);

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizarProducto('p1', { precio: 10 } as any);

    expect(inventarioApi.actualizarProducto).toHaveBeenCalledWith('p1', { precio: 10 });
    await waitFor(() => expect(result.current.success).toBe('Producto actualizado.'));
  });

  it('should reponerStock', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.reponerStock).mockResolvedValue({ id: 'p1' } as any);

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.reponerStock('p1', 5);

    expect(inventarioApi.reponerStock).toHaveBeenCalledWith('p1', 5);
    await waitFor(() => expect(result.current.success).toBe('Stock actualizado.'));
  });

  it('should crearCategoria', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.crearCategoria).mockResolvedValue({ id: 'cat-new' } as any);

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.crearCategoria({ nombre: 'Bebidas' });

    expect(inventarioApi.crearCategoria).toHaveBeenCalledWith({ nombre: 'Bebidas' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inventario-categorias'], exact: false, refetchType: 'active' });
    await waitFor(() => expect(result.current.success).toBe('Categoría creada.'));
  });

  it('should actualizarCategoria', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.actualizarCategoria).mockResolvedValue({ id: 'cat-1', nombre: 'Bebidas Frías' } as any);

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizarCategoria('cat-1', { nombre: 'Bebidas Frías' });

    expect(inventarioApi.actualizarCategoria).toHaveBeenCalledWith('cat-1', { nombre: 'Bebidas Frías' });
    await waitFor(() => expect(result.current.success).toBe('Categoría actualizada.'));
  });

  it('should eliminarCategoria', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.eliminarCategoria).mockResolvedValue(undefined);

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.eliminarCategoria('cat-1');

    expect(inventarioApi.eliminarCategoria).toHaveBeenCalledWith('cat-1');
    await waitFor(() => expect(result.current.success).toBe('Categoría eliminada.'));
  });

  it('should handle clearFeedback', async () => {
    vi.mocked(inventarioApi.getCategorias).mockResolvedValue([] as any);
    vi.mocked(inventarioApi.getProductosPage).mockResolvedValue({ data: [], nextCursor: null });
    vi.mocked(inventarioApi.crearProducto).mockRejectedValue(new Error('Crear Error'));

    const { result } = renderHook(() => useInventarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    try { await result.current.crearProducto({} as any); } catch(e) {}
    await new Promise(r => setTimeout(r, 0)); // wait for react render

    expect(result.current.error).toBe('Crear Error');

    result.current.clearFeedback();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
