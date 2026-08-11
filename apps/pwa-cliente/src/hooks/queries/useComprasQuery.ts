import { useMutation, useQuery } from '@tanstack/react-query';
import * as comprasApi from '../../api/compras.api';
import { mapInsumos, mapOrden, mapOrdenes, mapProveedores } from '../../mappers/compras.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type {
  ActualizarInsumoPayload,
  ActualizarOrdenPayload,
  ActualizarProveedorPayload,
  CrearInsumoPayload,
  CrearOrdenPayload,
  CrearProveedorPayload,
  InsumoListQuery,
  OrdenListQuery,
  ProveedorListQuery,
  RegistrarRecepcionPayload,
} from '../../types/compras.types';
import { INVENTARIO_PRODUCTOS_KEY } from './useInventarioQuery';

export const COMPRAS_PROVEEDORES_KEY = ['compras-proveedores'];
export const COMPRAS_INSUMOS_KEY = ['compras-insumos'];
export const COMPRAS_ORDENES_KEY = ['compras-ordenes'];
export const COMPRAS_ORDEN_KEY = ['compras-orden'];
export const COMPRAS_RESUMEN_KEY = ['compras-resumen'];
export const COMPRAS_COMPROBANTES_KEY = ['compras-comprobantes'];

function invalidar(key: string[]) {
  void queryClient.invalidateQueries({ queryKey: key, exact: false, refetchType: 'active' });
}

function invalidarTrasCompra() {
  invalidar(COMPRAS_ORDENES_KEY);
  invalidar(COMPRAS_ORDEN_KEY);
  invalidar(COMPRAS_INSUMOS_KEY);
  invalidar(COMPRAS_RESUMEN_KEY);
  // La recepción puede reponer stock en Inventario vía evento async
  // (compra.recibida); invalidar es un refresco best-effort, no garantiza que
  // el evento ya se procesó.
  invalidar(INVENTARIO_PRODUCTOS_KEY);
}

// ── Proveedores ──────────────────────────────────────────────────

export function useProveedoresQuery(query: ProveedorListQuery = {}) {
  const proveedoresQuery = useQuery({
    queryKey: [...COMPRAS_PROVEEDORES_KEY, query],
    queryFn: () => comprasApi.listarProveedores(query),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: (payload: CrearProveedorPayload) => comprasApi.crearProveedor(payload),
    onSuccess: () => invalidar(COMPRAS_PROVEEDORES_KEY),
  });
  const mutationActualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarProveedorPayload }) =>
      comprasApi.actualizarProveedor(id, payload),
    onSuccess: () => invalidar(COMPRAS_PROVEEDORES_KEY),
  });
  const mutationEliminar = useMutation({
    mutationFn: (id: string) => comprasApi.eliminarProveedor(id),
    onSuccess: () => invalidar(COMPRAS_PROVEEDORES_KEY),
  });

  return {
    proveedores: proveedoresQuery.data ? mapProveedores(proveedoresQuery.data) : [],
    loading: proveedoresQuery.isLoading,
    saving: mutationCrear.isPending || mutationActualizar.isPending || mutationEliminar.isPending,
    error:
      (proveedoresQuery.error || mutationCrear.error || mutationActualizar.error || mutationEliminar.error)
        ?.message ?? null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Proveedor creado.'],
      [mutationActualizar.isSuccess, 'Proveedor actualizado.'],
      [mutationEliminar.isSuccess, 'Proveedor eliminado.'],
    ),
    crear: (payload: CrearProveedorPayload) => mutationCrear.mutateAsync(payload),
    actualizar: (id: string, payload: ActualizarProveedorPayload) => mutationActualizar.mutateAsync({ id, payload }),
    eliminar: (id: string) => mutationEliminar.mutateAsync(id),
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
    },
  };
}

// ── Insumos ──────────────────────────────────────────────────────

export function useInsumosQuery(query: InsumoListQuery = {}) {
  const insumosQuery = useQuery({
    queryKey: [...COMPRAS_INSUMOS_KEY, query],
    queryFn: () => comprasApi.listarInsumos(query),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: (payload: CrearInsumoPayload) => comprasApi.crearInsumo(payload),
    onSuccess: () => invalidar(COMPRAS_INSUMOS_KEY),
  });
  const mutationActualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarInsumoPayload }) =>
      comprasApi.actualizarInsumo(id, payload),
    onSuccess: () => invalidar(COMPRAS_INSUMOS_KEY),
  });
  const mutationEliminar = useMutation({
    mutationFn: (id: string) => comprasApi.eliminarInsumo(id),
    onSuccess: () => invalidar(COMPRAS_INSUMOS_KEY),
  });

  return {
    insumos: insumosQuery.data ? mapInsumos(insumosQuery.data) : [],
    loading: insumosQuery.isLoading,
    saving: mutationCrear.isPending || mutationActualizar.isPending || mutationEliminar.isPending,
    error:
      (insumosQuery.error || mutationCrear.error || mutationActualizar.error || mutationEliminar.error)?.message ??
      null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Insumo creado.'],
      [mutationActualizar.isSuccess, 'Insumo actualizado.'],
      [mutationEliminar.isSuccess, 'Insumo eliminado.'],
    ),
    crear: (payload: CrearInsumoPayload) => mutationCrear.mutateAsync(payload),
    actualizar: (id: string, payload: ActualizarInsumoPayload) => mutationActualizar.mutateAsync({ id, payload }),
    eliminar: (id: string) => mutationEliminar.mutateAsync(id),
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
    },
  };
}

// ── Órdenes de compra ────────────────────────────────────────────

export function useOrdenesQuery(query: OrdenListQuery = {}) {
  const ordenesQuery = useQuery({
    queryKey: [...COMPRAS_ORDENES_KEY, query],
    queryFn: () => comprasApi.listarOrdenes(query),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: (payload: CrearOrdenPayload) => comprasApi.crearOrden(payload),
    onSuccess: () => {
      invalidar(COMPRAS_ORDENES_KEY);
      invalidar(COMPRAS_RESUMEN_KEY);
    },
  });
  const mutationActualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarOrdenPayload }) =>
      comprasApi.actualizarOrden(id, payload),
    onSuccess: () => {
      invalidar(COMPRAS_ORDENES_KEY);
      invalidar(COMPRAS_ORDEN_KEY);
      invalidar(COMPRAS_RESUMEN_KEY);
    },
  });
  const mutationEliminar = useMutation({
    mutationFn: (id: string) => comprasApi.eliminarOrden(id),
    onSuccess: () => {
      invalidar(COMPRAS_ORDENES_KEY);
      invalidar(COMPRAS_RESUMEN_KEY);
    },
  });
  const mutationEnviar = useMutation({
    mutationFn: (id: string) => comprasApi.enviarOrden(id),
    onSuccess: () => {
      invalidar(COMPRAS_ORDENES_KEY);
      invalidar(COMPRAS_ORDEN_KEY);
      invalidar(COMPRAS_RESUMEN_KEY);
    },
  });
  const mutationCerrar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) => comprasApi.cerrarOrden(id, motivo),
    onSuccess: invalidarTrasCompra,
  });
  const mutationAnular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) => comprasApi.anularOrden(id, motivo),
    onSuccess: () => {
      invalidar(COMPRAS_ORDENES_KEY);
      invalidar(COMPRAS_ORDEN_KEY);
      invalidar(COMPRAS_RESUMEN_KEY);
    },
  });
  const mutationRecibir = useMutation({
    mutationFn: ({ ordenId, payload }: { ordenId: string; payload: RegistrarRecepcionPayload }) =>
      comprasApi.registrarRecepcion(ordenId, payload),
    onSuccess: invalidarTrasCompra,
  });

  const saving =
    mutationCrear.isPending ||
    mutationActualizar.isPending ||
    mutationEliminar.isPending ||
    mutationEnviar.isPending ||
    mutationCerrar.isPending ||
    mutationAnular.isPending ||
    mutationRecibir.isPending;

  return {
    ordenes: ordenesQuery.data ? mapOrdenes(ordenesQuery.data) : [],
    loading: ordenesQuery.isLoading,
    saving,
    error:
      (ordenesQuery.error ||
        mutationCrear.error ||
        mutationActualizar.error ||
        mutationEliminar.error ||
        mutationEnviar.error ||
        mutationCerrar.error ||
        mutationAnular.error ||
        mutationRecibir.error)?.message ?? null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Orden de compra creada.'],
      [mutationActualizar.isSuccess, 'Orden de compra actualizada.'],
      [mutationEliminar.isSuccess, 'Orden de compra eliminada.'],
      [mutationEnviar.isSuccess, 'Orden enviada al proveedor.'],
      [mutationCerrar.isSuccess, 'Orden cerrada con faltante.'],
      [mutationAnular.isSuccess, 'Orden anulada.'],
      [mutationRecibir.isSuccess, 'Recepción registrada.'],
    ),
    crear: (payload: CrearOrdenPayload) => mutationCrear.mutateAsync(payload),
    actualizar: (id: string, payload: ActualizarOrdenPayload) => mutationActualizar.mutateAsync({ id, payload }),
    eliminar: (id: string) => mutationEliminar.mutateAsync(id),
    enviar: (id: string) => mutationEnviar.mutateAsync(id),
    cerrar: (id: string, motivo?: string) => mutationCerrar.mutateAsync({ id, motivo }),
    anular: (id: string, motivo?: string) => mutationAnular.mutateAsync({ id, motivo }),
    recibir: (ordenId: string, payload: RegistrarRecepcionPayload) => mutationRecibir.mutateAsync({ ordenId, payload }),
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
      mutationEnviar.reset();
      mutationCerrar.reset();
      mutationAnular.reset();
      mutationRecibir.reset();
    },
  };
}

export function useOrdenDetalleQuery(id: string | null) {
  const detalleQuery = useQuery({
    queryKey: [...COMPRAS_ORDEN_KEY, id],
    queryFn: () => comprasApi.obtenerOrden(id as string),
    enabled: id != null,
    retry: retrySalvo404,
  });

  return {
    orden: detalleQuery.data ? mapOrden(detalleQuery.data.orden) : null,
    recepciones: detalleQuery.data?.recepciones ?? [],
    comprobantes: detalleQuery.data?.comprobantes ?? [],
    loading: detalleQuery.isLoading,
    error: detalleQuery.error?.message ?? null,
    refetch: detalleQuery.refetch,
  };
}

export function useResumenComprasQuery() {
  const resumenQuery = useQuery({
    queryKey: COMPRAS_RESUMEN_KEY,
    queryFn: () => comprasApi.resumen(),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  return {
    resumen: resumenQuery.data ?? null,
    loading: resumenQuery.isLoading,
  };
}

// ── Comprobantes (foto de boleta/factura) ────────────────────────

export function useComprobantesMutation() {
  const mutationSubir = useMutation({
    mutationFn: ({
      archivo,
      ordenId,
      recepcionId,
      tipo,
      nombreArchivo,
    }: {
      archivo: Blob;
      ordenId?: string;
      recepcionId?: string;
      tipo?: string;
      nombreArchivo?: string;
    }) => comprasApi.subirComprobante(archivo, { ordenId, recepcionId, tipo, nombreArchivo }),
    onSuccess: () => {
      invalidar(COMPRAS_ORDEN_KEY);
      invalidar(COMPRAS_COMPROBANTES_KEY);
    },
  });

  const mutationEliminar = useMutation({
    mutationFn: (id: string) => comprasApi.eliminarComprobante(id),
    onSuccess: () => {
      invalidar(COMPRAS_ORDEN_KEY);
      invalidar(COMPRAS_COMPROBANTES_KEY);
    },
  });

  return {
    subiendo: mutationSubir.isPending,
    eliminando: mutationEliminar.isPending,
    error: (mutationSubir.error || mutationEliminar.error)?.message ?? null,
    subir: (args: { archivo: Blob; ordenId?: string; recepcionId?: string; tipo?: string; nombreArchivo?: string }) =>
      mutationSubir.mutateAsync(args),
    eliminar: (id: string) => mutationEliminar.mutateAsync(id),
    clearFeedback: () => {
      mutationSubir.reset();
      mutationEliminar.reset();
    },
  };
}
