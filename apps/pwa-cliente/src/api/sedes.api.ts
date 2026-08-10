// api/sedes.api.ts — CRUD de sedes (T-23: multi-sede)

import { client } from './client';
import { unwrapArray, unwrapEntity } from './response';
import type { SedeDto, CrearSedePayload, ActualizarSedePayload } from '../types/sede.types';

export async function getAll(): Promise<SedeDto[]> {
  const response = await client.get<{ sedes: SedeDto[] } | SedeDto[]>('/identidad/sedes');
  return unwrapArray<SedeDto>(response, 'sedes');
}

export async function crear(payload: CrearSedePayload): Promise<SedeDto> {
  const response = await client.post<{ sede: SedeDto } | SedeDto>('/identidad/sedes', payload);
  return unwrapEntity<SedeDto>(response, 'sede');
}

export async function actualizar(id: string, payload: ActualizarSedePayload): Promise<SedeDto> {
  const response = await client.patch<{ sede: SedeDto } | SedeDto>(`/identidad/sedes/${id}`, payload);
  return unwrapEntity<SedeDto>(response, 'sede');
}

export async function eliminar(id: string): Promise<void> {
  await client.delete(`/identidad/sedes/${id}`);
}
