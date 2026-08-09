// api/reportes.api.ts - Llamadas al servicio de reportes

import { client } from './client';
import type { ResumenDto, ResumenQuery } from '../types/reporte.types';

export function getResumen(query: ResumenQuery = {}): Promise<ResumenDto> {
  const params = new URLSearchParams();
  if (query.desde) params.set('desde', query.desde);
  if (query.hasta) params.set('hasta', query.hasta);
  const qs = params.toString();
  return client.get<ResumenDto>(`/reportes/resumen${qs ? `?${qs}` : ''}`);
}
