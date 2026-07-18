import { useQuery, useMutation } from '@tanstack/react-query';
import * as mesasApi from '../../api/mesas.api';
import { mapMesas, mapMesa } from '../../mappers/mesa.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type { CrearMesaPayload, EstadoMesa, MesaVM } from '../../types/mesa.types';

export const MESAS_QUERY_KEY = ['mesas'];

export function useMesasQuery() {
  const query = useQuery({
    queryKey: MESAS_QUERY_KEY,
    queryFn: async () => {
      const dtos = await mesasApi.getAll();
      return mapMesas(dtos);
    },
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const mutationEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoMesa }) => {
      const dto = await mesasApi.cambiarEstado(id, { estado });
      return mapMesa(dto);
    },
    onMutate: async ({ id, estado }) => {
      await queryClient.cancelQueries({ queryKey: MESAS_QUERY_KEY });
      const previousMesas = queryClient.getQueryData<MesaVM[]>(MESAS_QUERY_KEY);

      if (previousMesas) {
        queryClient.setQueryData<MesaVM[]>(MESAS_QUERY_KEY, (old) =>
          old?.map((m) =>
            m.id === id ? { ...m, estado, estadoClass: estado.toLowerCase(), estadoLabel: estado } : m
          )
        );
      }

      return { previousMesas };
    },
    onError: (err, newMesa, context) => {
      if (context?.previousMesas) {
        queryClient.setQueryData(MESAS_QUERY_KEY, context.previousMesas);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: MESAS_QUERY_KEY });
    },
  });

  const mutationCrear = useMutation({
    mutationFn: async (payload: CrearMesaPayload) => {
      const dto = await mesasApi.crear(payload);
      return mapMesa(dto);
    },
    onSuccess: (mesa) => {
      queryClient.setQueryData<MesaVM[]>(MESAS_QUERY_KEY, (old) =>
        [...(old ?? []), mesa].sort((a, b) => a.numeroRaw - b.numeroRaw)
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: MESAS_QUERY_KEY });
    },
  });

  return {
    mesas: query.data ?? [],
    loading: query.isLoading,
    saving: mutationCrear.isPending || mutationEstado.isPending,
    loadError: query.isError ? query.error.message : null,
    error: query.isError ? query.error.message : mutationCrear.error?.message || mutationEstado.error?.message || null,
    success: primerMensaje(
      [mutationCrear.isSuccess, 'Mesa creada.'],
      [mutationEstado.isSuccess, 'Estado actualizado.'],
    ),
    fetch: query.refetch,
    crearMesa: async (payload: CrearMesaPayload) => {
      return mutationCrear.mutateAsync(payload);
    },
    optimisticCambiarEstado: async (id: string, estado: EstadoMesa) => {
      return mutationEstado.mutateAsync({ id, estado });
    },
    clearFeedback: () => {
      mutationCrear.reset();
      mutationEstado.reset();
    },
  };
}
