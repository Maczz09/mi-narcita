// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useOrdenesQuery, useProveedoresQuery } from './useComprasQuery';
import * as comprasApi from '../../api/compras.api';
import { queryClient } from '../../api/queryClient';

vi.mock('../../api/compras.api', () => ({
  listarProveedores: vi.fn(),
  crearProveedor: vi.fn(),
  actualizarProveedor: vi.fn(),
  eliminarProveedor: vi.fn(),
  listarInsumos: vi.fn(),
  crearInsumo: vi.fn(),
  actualizarInsumo: vi.fn(),
  eliminarInsumo: vi.fn(),
  listarOrdenes: vi.fn(),
  obtenerOrden: vi.fn(),
  crearOrden: vi.fn(),
  enviarOrden: vi.fn(),
  cerrarOrden: vi.fn(),
  anularOrden: vi.fn(),
  eliminarOrden: vi.fn(),
  resumen: vi.fn(),
  registrarRecepcion: vi.fn(),
  listarComprobantes: vi.fn(),
  subirComprobante: vi.fn(),
  eliminarComprobante: vi.fn(),
  obtenerArchivoBlob: vi.fn(),
  obtenerMiniaturaBlob: vi.fn(),
}));

vi.mock('../../api/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/queryClient')>()),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const proveedorDto = {
  id: 'pr-1', sedeId: 's1', nombre: 'Pesquera del Sur', ruc: null, categoria: null,
  contacto: null, telefono: null, diasEntrega: null, condicionPago: null, activo: true,
  createdAt: '2026-06-01T00:00:00.000Z',
};

const ordenDto = {
  id: 'oc-1', sedeId: 's1', codigo: 'OC-1001', proveedorId: null, proveedorNombre: 'X',
  estado: 'ENVIADA', fechaEmision: '2026-06-01T00:00:00.000Z', fechaEnvio: null,
  fechaEntregaEsperada: null, fechaCierre: null, moneda: 'PEN', total: 100, notas: null,
  usuarioId: null, usuarioNombre: null,
  items: [{ id: 'it-1', insumoId: 'i-1', insumoNombre: 'Pescado', unidad: 'kg', cantidadPedida: 10, cantidadRecibida: 0, costoUnitario: 10 }],
  createdAt: '2026-06-01T00:00:00.000Z',
};

const createWrapper = () => {
  const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useComprasQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useProveedoresQuery', () => {
    it('lista proveedores y mapea las iniciales', async () => {
      vi.mocked(comprasApi.listarProveedores).mockResolvedValue([proveedorDto]);

      const { result } = renderHook(() => useProveedoresQuery(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.proveedores).toHaveLength(1);
      expect(result.current.proveedores[0].iniciales).toBe('PD');
    });

    it('crea un proveedor e invalida el listado', async () => {
      vi.mocked(comprasApi.listarProveedores).mockResolvedValue([]);
      vi.mocked(comprasApi.crearProveedor).mockResolvedValue({ message: 'ok', proveedor: proveedorDto });

      const { result } = renderHook(() => useProveedoresQuery(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.crear({ nombre: 'Pesquera del Sur' });

      expect(comprasApi.crearProveedor).toHaveBeenCalledWith({ nombre: 'Pesquera del Sur' });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['compras-proveedores'] }));
    });
  });

  describe('useOrdenesQuery', () => {
    it('lista órdenes de compra', async () => {
      vi.mocked(comprasApi.listarOrdenes).mockResolvedValue([ordenDto]);

      const { result } = renderHook(() => useOrdenesQuery(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.ordenes).toHaveLength(1);
      expect(result.current.ordenes[0].codigo).toBe('OC-1001');
    });

    it('registrar una recepción invalida órdenes, insumos, resumen e inventario (stock puede reponerse)', async () => {
      vi.mocked(comprasApi.listarOrdenes).mockResolvedValue([]);
      vi.mocked(comprasApi.registrarRecepcion).mockResolvedValue({
        orden: { ...ordenDto, estado: 'RECIBIDA' },
        recepcion: { id: 'rc-1', sedeId: 's1', ordenId: 'oc-1', fecha: '2026-06-02T00:00:00.000Z', observaciones: null, usuarioId: null, usuarioNombre: null, items: [], createdAt: '2026-06-02T00:00:00.000Z' },
      });

      const { result } = renderHook(() => useOrdenesQuery(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.recibir('oc-1', { items: [{ ordenItemId: 'it-1', cantidadRecibida: 10 }] });

      expect(comprasApi.registrarRecepcion).toHaveBeenCalledWith('oc-1', { items: [{ ordenItemId: 'it-1', cantidadRecibida: 10 }] });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['compras-ordenes'] }));
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['compras-insumos'] }));
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['compras-resumen'] }));
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['inventario-productos'] }));
    });
  });
});
