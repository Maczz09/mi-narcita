import { useQuery, useMutation } from '@tanstack/react-query';
import * as mesasApi from '../../api/mesas.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type { CrearUbicacionPayload, ActualizarUbicacionPayload, UbicacionVM } from '../../types/mesa.types';

export const UBICACIONES_QUERY_KEY = ['ubicaciones'];

export function useUbicacionesQuery() {
  const query = useQuery({
    queryKey: UBICACIONES_QUERY_KEY,
    queryFn: async () => {
      const dtos = await mesasApi.getUbicaciones();
      return dtos.map((d): UbicacionVM => ({ id: d.id, nombre: d.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationCrear = useMutation({
    mutationFn: (payload: CrearUbicacionPayload) => mesasApi.crearUbicacion(payload),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: UBICACIONES_QUERY_KEY });
    },
  });

  const mutationActualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarUbicacionPayload }) =>
      mesasApi.actualizarUbicacion(id, payload),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: UBICACIONES_QUERY_KEY });
      // El nombre de la ubicación va denormalizado en cada MesaVM (mapMesa) —
      // sin invalidar mesas, el plano de salón seguiría mostrando el nombre viejo.
      void queryClient.invalidateQueries({ queryKey: ['mesas'] });
    },
  });

  const mutationEliminar = useMutation({
    mutationFn: (id: string) => mesasApi.eliminarUbicacion(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: UBICACIONES_QUERY_KEY });
    },
  });

  return {
    ubicaciones: query.data ?? [],
    loading: query.isLoading,
    saving: mutationCrear.isPending || mutationActualizar.isPending || mutationEliminar.isPending,
    loadError: query.isError ? query.error.message : null,
    error:
      query.isError ? query.error.message
        : mutationCrear.error?.message || mutationActualizar.error?.message || mutationEliminar.error?.message || null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Ubicación creada.'],
      [mutationActualizar.isSuccess, 'Ubicación actualizada.'],
      [mutationEliminar.isSuccess, 'Ubicación eliminada.'],
    ),
    fetch: query.refetch,
    crearUbicacion: (payload: CrearUbicacionPayload) => mutationCrear.mutateAsync(payload),
    actualizarUbicacion: (id: string, payload: ActualizarUbicacionPayload) =>
      mutationActualizar.mutateAsync({ id, payload }),
    eliminarUbicacion: (id: string) => mutationEliminar.mutateAsync(id),
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
    },
  };
}
