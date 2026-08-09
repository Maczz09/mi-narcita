import { client } from './client';
import type {
  AbrirTurnoPayload,
  ActualizarTransaccionPayload,
  CajaResumenDto,
  CerrarTurnoPayload,
  CrearMovimientoCajaPayload,
  ListarTurnosQuery,
  MovimientoCajaDto,
  TransaccionDto,
  TurnoCajaDto,
  TurnoListResponse,
} from '../types/caja.types';

export function getResumenActivo(): Promise<CajaResumenDto> {
  return client.get<CajaResumenDto>('/caja/turnos/activo/resumen');
}

export function listarTurnos(query: ListarTurnosQuery = {}): Promise<TurnoListResponse> {
  const params = new URLSearchParams();
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.estado) params.set('estado', query.estado);
  if (query.desde) params.set('desde', query.desde);
  if (query.hasta) params.set('hasta', query.hasta);
  const qs = params.toString();
  return client.get<TurnoListResponse>(`/caja/turnos${qs ? `?${qs}` : ''}`);
}

export function obtenerResumenTurno(id: string): Promise<CajaResumenDto> {
  return client.get<CajaResumenDto>(`/caja/turnos/${id}/resumen`);
}

export function abrirTurno(payload: AbrirTurnoPayload): Promise<TurnoCajaDto> {
  return client.post<TurnoCajaDto>('/caja/turnos/abrir', payload);
}

export function crearMovimiento(turnoId: string, payload: CrearMovimientoCajaPayload): Promise<MovimientoCajaDto> {
  return client.post<MovimientoCajaDto>(`/caja/turnos/${turnoId}/movimientos`, payload);
}

export function cerrarTurno(turnoId: string, payload: CerrarTurnoPayload) {
  return client.post(`/caja/turnos/${turnoId}/cerrar`, payload);
}

/** GET /caja/:id — Detalle de una transacción (cobro) */
export function obtenerTransaccion(id: string): Promise<TransaccionDto> {
  return client.get<TransaccionDto>(`/caja/${id}`);
}

/** PATCH /caja/:id — Corrige método de pago y/o notas de un cobro ya cerrado */
export function actualizarTransaccion(id: string, payload: ActualizarTransaccionPayload): Promise<{ message: string; transaccion: TransaccionDto }> {
  return client.patch<{ message: string; transaccion: TransaccionDto }>(`/caja/${id}`, payload);
}
