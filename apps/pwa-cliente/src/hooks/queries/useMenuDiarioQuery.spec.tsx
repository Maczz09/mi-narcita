// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMenuDiarioQuery } from './useMenuDiarioQuery';
import * as inventarioApi from '../../api/inventario.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/inventario.api', () => ({
  getMenuDelDia: vi.fn(),
  agregarAlMenu: vi.fn(),
  actualizarMenuDiario: vi.fn(),
  quitarDelMenu: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const dtoBase = {
  id: 'md-1',
  fecha: '2026-08-09',
  productoId: 'prod-1',
  disponible: true,
  producto: {
    id: 'prod-1',
    categoriaId: 'cat-1',
    categoria: { id: 'cat-1', nombre: 'Platos de Fondo' },
    nombre: 'Ají de Gallina',
    descripcion: null,
    precio: 28,
    disponible: true,
    stockActual: null,
  },
};

const createWrapper = () => {
  const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useMenuDiarioQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carga el menú del día y lo mapea a VM con el producto anidado', async () => {
    vi.mocked(inventarioApi.getMenuDelDia).mockResolvedValue([dtoBase]);

    const { result } = renderHook(() => useMenuDiarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.menu).toHaveLength(1);
    expect(result.current.menu[0].disponible).toBe(true);
    expect(result.current.menu[0].producto.nombre).toBe('Ají de Gallina');
    expect(result.current.menu[0].producto.precioLabel).toContain('28');
  });

  it('agrega un plato existente al menú e invalida la query', async () => {
    vi.mocked(inventarioApi.getMenuDelDia).mockResolvedValue([]);
    vi.mocked(inventarioApi.agregarAlMenu).mockResolvedValue(dtoBase);

    const { result } = renderHook(() => useMenuDiarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.agregarAlMenu({ productoId: 'prod-1' });

    expect(inventarioApi.agregarAlMenu).toHaveBeenCalledWith({ productoId: 'prod-1' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['menu-diario'] }),
    );
  });

  it('activa/desactiva un plato del menú', async () => {
    vi.mocked(inventarioApi.getMenuDelDia).mockResolvedValue([]);
    vi.mocked(inventarioApi.actualizarMenuDiario).mockResolvedValue({ ...dtoBase, disponible: false });

    const { result } = renderHook(() => useMenuDiarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.actualizarDisponibilidad('md-1', false);

    expect(inventarioApi.actualizarMenuDiario).toHaveBeenCalledWith('md-1', { disponible: false });
  });

  it('quita un plato del menú del día', async () => {
    vi.mocked(inventarioApi.getMenuDelDia).mockResolvedValue([]);
    vi.mocked(inventarioApi.quitarDelMenu).mockResolvedValue(undefined);

    const { result } = renderHook(() => useMenuDiarioQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.quitarDelMenu('md-1');

    expect(inventarioApi.quitarDelMenu).toHaveBeenCalledWith('md-1');
  });
});
