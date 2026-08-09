// hooks/queries/useTransaccionDetalleQuery.ts — Detalle + edición acotada de
// un cobro ya cerrado. La Transacción (servicio-caja) no guarda los ítems —
// vienen de la Cuenta (servicio-cuentas), referenciada por cuentaId.

import { useQuery, useMutation } from '@tanstack/react-query';
import * as cajaApi from '../../api/caja.api';
import * as cuentasApi from '../../api/cuentas.api';
import { mapCuenta } from '../../mappers/cuenta.mapper';
import { queryClient, retrySalvo404 } from '../../api/queryClient';
import { CAJA_QUERY_KEY } from './useCajaQuery';
import type { ActualizarTransaccionPayload } from '../../types/caja.types';

export function useTransaccionDetalleQuery(transaccionId: string, cuentaId: string | null) {
  const transaccionQuery = useQuery({
    queryKey: ['caja', 'transaccion', transaccionId],
    queryFn: () => cajaApi.obtenerTransaccion(transaccionId),
    retry: retrySalvo404,
  });

  const cuentaQuery = useQuery({
    queryKey: ['cuentas', 'detalle', cuentaId],
    queryFn: async () => {
      const dto = await cuentasApi.getById(cuentaId!);
      return mapCuenta(dto);
    },
    enabled: !!cuentaId,
    retry: retrySalvo404,
  });

  const actualizarMutation = useMutation({
    mutationFn: (payload: ActualizarTransaccionPayload) => cajaApi.actualizarTransaccion(transaccionId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['caja', 'transaccion', transaccionId] });
      // El método corregido también cambia "Ingresos por método" / efectivo
      // esperado del resumen del turno (vía el MovimientoCaja vinculado).
      void queryClient.invalidateQueries({ queryKey: CAJA_QUERY_KEY });
    },
  });

  return {
    transaccion: transaccionQuery.data ?? null,
    cuenta: cuentaQuery.data ?? null,
    loading: transaccionQuery.isLoading || cuentaQuery.isLoading,
    error: transaccionQuery.error?.message || cuentaQuery.error?.message || actualizarMutation.error?.message || null,
    success: actualizarMutation.isSuccess ? 'Cobro actualizado.' : null,
    saving: actualizarMutation.isPending,
    actualizar: (payload: ActualizarTransaccionPayload) => actualizarMutation.mutateAsync(payload),
    clearFeedback: () => actualizarMutation.reset(),
  };
}
