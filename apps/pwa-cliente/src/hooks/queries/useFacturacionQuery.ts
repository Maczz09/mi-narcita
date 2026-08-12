// hooks/queries/useFacturacionQuery.ts — Emisión de boletas/facturas SUNAT
//
// /facturacion no está en el allowlist de sede de client.ts (a propósito,
// mismo criterio que /reportes) — la sede del admin general se resuelve acá
// con useSedeActualQuery() y se pasa explícita a cada llamada.

import { useQuery, useMutation } from '@tanstack/react-query';
import * as facturacionApi from '../../api/facturacion.api';
import { useSedeActualQuery } from './useSedesQuery';
import { queryClient } from '../../api/queryClient';
import { primerMensaje } from '../../utils/feedback';
import type { ComprobantePagoDto, EmitirComprobantePayload } from '../../types/facturacion.types';

const ESTADOS_PENDIENTES = new Set(['FIRMADO', 'ENVIADO']);

// Mientras algún comprobante emitido siga esperando el veredicto de SUNAT
// (el envío real lo hace un cron cada 30s en servicio-facturacion), se
// refresca solo cada 8s; en cuanto todo quedó ACEPTADO/RECHAZADO/OBSERVADO,
// deja de pedir de más.
function refetchMientrasPendiente(query: { state: { data?: unknown } }): number | false {
  const data = query.state.data as ComprobantePagoDto[] | undefined;
  const pendiente = data?.some((c) => c.comprobante && ESTADOS_PENDIENTES.has(c.comprobante.estado));
  return pendiente ? 8000 : false;
}

export function useFacturacionQuery() {
  const { sede } = useSedeActualQuery();
  const sedeId = sede?.id;

  const disponiblesQuery = useQuery({
    queryKey: ['facturacion', 'disponibles', sedeId],
    queryFn: () => facturacionApi.listarDisponibles(sedeId),
  });

  const todosQuery = useQuery({
    queryKey: ['facturacion', 'todos', sedeId],
    queryFn: () => facturacionApi.listarTodos(sedeId),
    refetchInterval: refetchMientrasPendiente,
  });

  const empresasQuery = useQuery({
    queryKey: ['facturacion', 'empresas'],
    queryFn: () => facturacionApi.listarEmpresas(),
    staleTime: 1000 * 60 * 10,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['facturacion'], exact: false, refetchType: 'active' });

  const mutationEmitir = useMutation({
    mutationFn: ({ cuentaId, payload }: { cuentaId: string; payload: EmitirComprobantePayload }) =>
      facturacionApi.emitir(cuentaId, payload),
    onSuccess: invalidate,
  });

  return {
    disponibles: disponiblesQuery.data ?? [],
    emitidos: (todosQuery.data ?? []).filter((c) => c.estado === 'EMITIDO'),
    empresas: empresasQuery.data ?? [],
    loading: disponiblesQuery.isLoading || todosQuery.isLoading,
    emitiendo: mutationEmitir.isPending,
    error: disponiblesQuery.error?.message ?? todosQuery.error?.message ?? mutationEmitir.error?.message ?? null,
    success: primerMensaje([mutationEmitir.isSuccess, 'Comprobante firmado — enviándose a SUNAT.']),
    fetch: () => {
      void disponiblesQuery.refetch();
      void todosQuery.refetch();
    },
    emitirComprobante: async (cuentaId: string, payload: EmitirComprobantePayload) => {
      await mutationEmitir.mutateAsync({ cuentaId, payload });
    },
    clearFeedback: () => mutationEmitir.reset(),
  };
}
