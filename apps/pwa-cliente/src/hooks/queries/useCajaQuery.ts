import { useMutation, useQuery } from '@tanstack/react-query';
import * as cajaApi from '../../api/caja.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import type {
  AbrirTurnoPayload,
  CerrarTurnoPayload,
  CrearMovimientoCajaPayload,
} from '../../types/caja.types';

export const CAJA_QUERY_KEY = ['caja'];

export function useCajaQuery() {
  const resumenQuery = useQuery({
    queryKey: [...CAJA_QUERY_KEY, 'turno-activo', 'resumen'],
    queryFn: cajaApi.getResumenActivo,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: CAJA_QUERY_KEY });

  const abrirMutation = useMutation({
    mutationFn: (payload: AbrirTurnoPayload) => cajaApi.abrirTurno(payload),
    onSuccess: refresh,
  });

  const movimientoMutation = useMutation({
    mutationFn: ({ turnoId, payload }: { turnoId: string; payload: CrearMovimientoCajaPayload }) =>
      cajaApi.crearMovimiento(turnoId, payload),
    onSuccess: refresh,
  });

  const cierreMutation = useMutation({
    mutationFn: ({ turnoId, payload }: { turnoId: string; payload: CerrarTurnoPayload }) =>
      cajaApi.cerrarTurno(turnoId, payload),
    onSuccess: refresh,
  });

  return {
    resumen: resumenQuery.data ?? null,
    turno: resumenQuery.data?.turno ?? null,
    loading: resumenQuery.isLoading || abrirMutation.isPending || movimientoMutation.isPending || cierreMutation.isPending,
    error:
      resumenQuery.error?.message ||
      abrirMutation.error?.message ||
      movimientoMutation.error?.message ||
      cierreMutation.error?.message ||
      null,
    abrirTurno: (payload: AbrirTurnoPayload) => abrirMutation.mutateAsync(payload),
    crearMovimiento: (turnoId: string, payload: CrearMovimientoCajaPayload) =>
      movimientoMutation.mutateAsync({ turnoId, payload }),
    cerrarTurno: (turnoId: string, payload: CerrarTurnoPayload) =>
      cierreMutation.mutateAsync({ turnoId, payload }),
    refetch: resumenQuery.refetch,
    clearFeedback: () => {
      abrirMutation.reset();
      movimientoMutation.reset();
      cierreMutation.reset();
    },
  };
}
