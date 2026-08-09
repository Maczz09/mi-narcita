// hooks/queries/useHistorialCajaQuery.ts — Historial de turnos/cierres de caja
// (solo ADMIN/SISTEMA, ver auth/permisos.ts). Lista paginada + detalle on-demand.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as cajaApi from '../../api/caja.api';
import { retrySalvo404, refetchSiError } from '../../api/queryClient';
import type { TurnoCajaEstado } from '../../types/caja.types';

export const HISTORIAL_CAJA_QUERY_KEY = ['caja', 'historial'];
export const TURNO_DETALLE_QUERY_KEY = ['caja', 'turno-detalle'];

export interface HistorialCajaFiltro {
  estado?: TurnoCajaEstado;
  desde?: string;
  hasta?: string;
}

export function useHistorialCajaQuery(filtro: HistorialCajaFiltro = {}) {
  const turnosQuery = useInfiniteQuery({
    queryKey: [...HISTORIAL_CAJA_QUERY_KEY, filtro.estado, filtro.desde, filtro.hasta],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await cajaApi.listarTurnos({
        cursor: pageParam,
        limit: 20,
        estado: filtro.estado,
        desde: filtro.desde,
        hasta: filtro.hasta,
      });
      return response;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  return {
    turnos: turnosQuery.data?.pages.flatMap((page) => page.data) ?? [],
    nextCursor: turnosQuery.hasNextPage
      ? turnosQuery.data?.pages.at(-1)?.nextCursor ?? null
      : null,
    loading: turnosQuery.isLoading,
    loadingMore: turnosQuery.isFetchingNextPage,
    error: turnosQuery.error ? turnosQuery.error.message : null,
    fetch: turnosQuery.refetch,
    fetchMore: async () => {
      if (turnosQuery.hasNextPage) await turnosQuery.fetchNextPage();
    },
  };
}

export function useTurnoDetalleQuery(turnoId: string | null) {
  const detalleQuery = useQuery({
    queryKey: [...TURNO_DETALLE_QUERY_KEY, turnoId],
    queryFn: () => cajaApi.obtenerResumenTurno(turnoId as string),
    enabled: turnoId != null,
    retry: retrySalvo404,
  });

  return {
    detalle: detalleQuery.data ?? null,
    loading: detalleQuery.isLoading,
    error: detalleQuery.error ? detalleQuery.error.message : null,
  };
}
