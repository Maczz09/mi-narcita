// api/mesas.api.ts — Llamadas al servicio de mesas

import { client } from './client';
import { unwrapArray, unwrapEntity } from './response';
import type {
  MesaDto,
  ActualizarEstadoMesaPayload,
  CrearMesaPayload,
  UbicacionDto,
  CrearUbicacionPayload,
  ActualizarUbicacionPayload,
  UnirMesasPayload,
} from '../types/mesa.types';

/** GET /mesas — Listar todas las mesas */
export async function getAll(): Promise<MesaDto[]> {
  const response = await client.get<MesaDto[] | { mesas: MesaDto[] }>('/mesas');
  return unwrapArray<MesaDto>(response, 'mesas');
}

/** GET /mesas/:id — Obtener mesa por ID */
export async function getById(id: string): Promise<MesaDto> {
  const response = await client.get<MesaDto | { mesa: MesaDto }>(`/mesas/${id}`);
  return unwrapEntity<MesaDto>(response, 'mesa');
}

/** POST /mesas — Crear mesa física del salón */
export async function crear(payload: CrearMesaPayload): Promise<MesaDto> {
  const response = await client.post<MesaDto | { mesa: MesaDto }>('/mesas', payload);
  return unwrapEntity<MesaDto>(response, 'mesa');
}

/** PATCH /mesas/:id/estado — Cambiar estado de la mesa */
export async function cambiarEstado(
  id: string,
  payload: ActualizarEstadoMesaPayload,
): Promise<MesaDto> {
  const response = await client.patch<MesaDto | { mesa: MesaDto }>(`/mesas/${id}/estado`, payload);
  return unwrapEntity<MesaDto>(response, 'mesa');
}

/** GET /mesas/ubicaciones — Listar ubicaciones (zonas del salón) */
export async function getUbicaciones(): Promise<UbicacionDto[]> {
  const response = await client.get<UbicacionDto[] | { ubicaciones: UbicacionDto[] }>('/mesas/ubicaciones');
  return unwrapArray<UbicacionDto>(response, 'ubicaciones');
}

/** POST /mesas/ubicaciones — Crear ubicación */
export async function crearUbicacion(payload: CrearUbicacionPayload): Promise<UbicacionDto> {
  const response = await client.post<UbicacionDto | { ubicacion: UbicacionDto }>('/mesas/ubicaciones', payload);
  return unwrapEntity<UbicacionDto>(response, 'ubicacion');
}

/** PATCH /mesas/ubicaciones/:id — Renombrar ubicación */
export async function actualizarUbicacion(id: string, payload: ActualizarUbicacionPayload): Promise<UbicacionDto> {
  const response = await client.patch<UbicacionDto | { ubicacion: UbicacionDto }>(`/mesas/ubicaciones/${id}`, payload);
  return unwrapEntity<UbicacionDto>(response, 'ubicacion');
}

/** DELETE /mesas/ubicaciones/:id — Eliminar ubicación (falla si tiene mesas asociadas) */
export async function eliminarUbicacion(id: string): Promise<void> {
  await client.delete(`/mesas/ubicaciones/${id}`);
}

/** POST /mesas/unir — Unir 2+ mesas en un solo grupo con cuenta compartida */
export async function unirMesas(payload: UnirMesasPayload): Promise<MesaDto[]> {
  const response = await client.post<MesaDto[] | { mesas: MesaDto[] }>('/mesas/unir', payload);
  return unwrapArray<MesaDto>(response, 'mesas');
}

/** POST /mesas/:id/separar — Separar el grupo de mesas al que pertenece `id` */
export async function separarMesas(id: string): Promise<MesaDto[]> {
  const response = await client.post<MesaDto[] | { mesas: MesaDto[] }>(`/mesas/${id}/separar`);
  return unwrapArray<MesaDto>(response, 'mesas');
}
