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

// Sede a mostrar bajo el nombre de marca (Sidebar): a diferencia del resto
// de endpoints de este archivo, no requiere ADMIN — cualquier usuario
// autenticado puede ver su propia sede. `sedeId` se inyecta solo para el
// admin general vía el allowlist de client.ts; un usuario pineado la ignora
// (el backend ya resuelve la suya desde el JWT).
export async function obtenerActual(): Promise<SedeDto | null> {
  const response = await client.get<{ sede: SedeDto | null }>('/identidad/sedes/actual');
  return response.sede;
}
