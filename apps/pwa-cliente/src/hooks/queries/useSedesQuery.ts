import { useQuery, useMutation } from '@tanstack/react-query';
import * as sedesApi from '../../api/sedes.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type { SedeDto, CrearSedePayload, ActualizarSedePayload } from '../../types/sede.types';

export const SEDES_QUERY_KEY = ['sedes'];
export const SEDE_ACTUAL_QUERY_KEY = ['sede-actual'];

// Sede a mostrar bajo el nombre de marca (Sidebar): funciona para admin
// general (sedeId inyectado por el allowlist de client.ts según la sede
// elegida) y para usuario pineado (el backend resuelve la suya del JWT).
// Se invalida junto con todo lo demás cuando SedeSwitcher cambia de sede
// (invalidateQueries() sin filtro en elegir()).
export function useSedeActualQuery() {
  const query = useQuery({
    queryKey: SEDE_ACTUAL_QUERY_KEY,
    queryFn: () => sedesApi.obtenerActual(),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  return {
    sede: query.data ?? null,
    loading: query.isLoading,
  };
}

export function useSedesQuery(options: { enabled?: boolean } = {}) {
  const sedesQuery = useQuery({
    queryKey: SEDES_QUERY_KEY,
    queryFn: () => sedesApi.getAll(),
    // GET /identidad/sedes es ADMIN-only en el backend; un caller que sabe de
    // antemano que el usuario no es admin general (p. ej. ReportesScreen)
    // pasa enabled:false para no disparar un 403 innecesario.
    enabled: options.enabled ?? true,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: SEDES_QUERY_KEY, exact: false, refetchType: 'active' });

  const mutationCrear = useMutation({
    mutationFn: (payload: CrearSedePayload) => sedesApi.crear(payload),
    onSuccess: invalidate,
  });

  const mutationActualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActualizarSedePayload }) => sedesApi.actualizar(id, payload),
    onSuccess: invalidate,
  });

  const mutationEliminar = useMutation({
    mutationFn: (id: string) => sedesApi.eliminar(id),
    onSuccess: invalidate,
  });

  const saving = mutationCrear.isPending || mutationActualizar.isPending || mutationEliminar.isPending;
  const error = sedesQuery.error || mutationCrear.error || mutationActualizar.error || mutationEliminar.error;
  const success = primerMensaje(
    [mutationCrear.isSuccess, 'Sede creada.'],
    [mutationActualizar.isSuccess, 'Sede actualizada.'],
    [mutationEliminar.isSuccess, 'Sede eliminada.'],
  );

  return {
    sedes: sedesQuery.data ?? ([] as SedeDto[]),
    loading: sedesQuery.isLoading,
    saving,
    error: error ? error.message : null,
    success,
    fetch: sedesQuery.refetch,
    crearSede: async (payload: CrearSedePayload) => {
      await mutationCrear.mutateAsync(payload);
    },
    actualizarSede: async (id: string, payload: ActualizarSedePayload) => {
      await mutationActualizar.mutateAsync({ id, payload });
    },
    eliminarSede: async (id: string) => {
      await mutationEliminar.mutateAsync(id);
    },
    clearFeedback: () => {
      mutationCrear.reset();
      mutationActualizar.reset();
      mutationEliminar.reset();
    },
  };
}
