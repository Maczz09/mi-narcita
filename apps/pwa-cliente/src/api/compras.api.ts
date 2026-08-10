// api/compras.api.ts - Llamadas al servicio de Compras (proveedores, insumos,
// órdenes de compra, recepciones y comprobantes de boleta/factura).

import { client } from './client';
import { unwrapEntity } from './response';
import type {
  ActualizarInsumoPayload,
  ActualizarProveedorPayload,
  ComprobanteCompraDto,
  CrearInsumoPayload,
  CrearOrdenPayload,
  CrearProveedorPayload,
  InsumoDto,
  InsumoListQuery,
  OrdenCompraDto,
  OrdenDetalle,
  OrdenListQuery,
  ProveedorDto,
  ProveedorListQuery,
  RecepcionCompraDto,
  RegistrarRecepcionPayload,
  ResumenComprasDto,
} from '../types/compras.types';

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

// ── Proveedores ──────────────────────────────────────────────────

export async function listarProveedores(query: ProveedorListQuery = {}): Promise<ProveedorDto[]> {
  const qs = toQueryString({ search: query.search, activo: query.activo, limit: query.limit ?? 100 });
  const response = await client.get<{ data: ProveedorDto[]; nextCursor: string | null }>(`/compras/proveedores${qs}`);
  return response.data;
}

export function crearProveedor(payload: CrearProveedorPayload): Promise<{ message: string; proveedor: ProveedorDto }> {
  return client.post('/compras/proveedores', payload);
}

export function actualizarProveedor(id: string, payload: ActualizarProveedorPayload): Promise<{ message: string; proveedor: ProveedorDto }> {
  return client.patch(`/compras/proveedores/${id}`, payload);
}

export function eliminarProveedor(id: string): Promise<{ message: string }> {
  return client.delete(`/compras/proveedores/${id}`);
}

// ── Insumos ──────────────────────────────────────────────────────

export async function listarInsumos(query: InsumoListQuery = {}): Promise<InsumoDto[]> {
  const qs = toQueryString({
    search: query.search,
    bajoMinimo: query.bajoMinimo,
    proveedorId: query.proveedorId,
    limit: query.limit ?? 100,
  });
  const response = await client.get<{ data: InsumoDto[]; nextCursor: string | null }>(`/compras/insumos${qs}`);
  return response.data;
}

export function crearInsumo(payload: CrearInsumoPayload): Promise<{ message: string; insumo: InsumoDto }> {
  return client.post('/compras/insumos', payload);
}

export function actualizarInsumo(id: string, payload: ActualizarInsumoPayload): Promise<{ message: string; insumo: InsumoDto }> {
  return client.patch(`/compras/insumos/${id}`, payload);
}

export function eliminarInsumo(id: string): Promise<{ message: string }> {
  return client.delete(`/compras/insumos/${id}`);
}

// ── Órdenes de compra ────────────────────────────────────────────

export async function listarOrdenes(query: OrdenListQuery = {}): Promise<OrdenCompraDto[]> {
  const qs = toQueryString({
    estado: query.estado,
    proveedorId: query.proveedorId,
    desde: query.desde,
    hasta: query.hasta,
    limit: query.limit ?? 100,
  });
  const response = await client.get<{ data: OrdenCompraDto[]; nextCursor: string | null }>(`/compras/ordenes${qs}`);
  return response.data;
}

export function obtenerOrden(id: string): Promise<OrdenDetalle> {
  return client.get(`/compras/ordenes/${id}`);
}

export async function crearOrden(payload: CrearOrdenPayload): Promise<OrdenCompraDto> {
  const response = await client.post<{ message: string; orden: OrdenCompraDto }>('/compras/ordenes', payload);
  return unwrapEntity<OrdenCompraDto>(response, 'orden');
}

export async function enviarOrden(id: string): Promise<OrdenCompraDto> {
  const response = await client.post<{ message: string; orden: OrdenCompraDto }>(`/compras/ordenes/${id}/enviar`);
  return unwrapEntity<OrdenCompraDto>(response, 'orden');
}

export async function cerrarOrden(id: string, motivo?: string): Promise<OrdenCompraDto> {
  const response = await client.post<{ message: string; orden: OrdenCompraDto }>(`/compras/ordenes/${id}/cerrar`, { motivo });
  return unwrapEntity<OrdenCompraDto>(response, 'orden');
}

export async function anularOrden(id: string, motivo?: string): Promise<OrdenCompraDto> {
  const response = await client.post<{ message: string; orden: OrdenCompraDto }>(`/compras/ordenes/${id}/anular`, { motivo });
  return unwrapEntity<OrdenCompraDto>(response, 'orden');
}

export function eliminarOrden(id: string): Promise<{ message: string }> {
  return client.delete(`/compras/ordenes/${id}`);
}

export function resumen(): Promise<ResumenComprasDto> {
  return client.get('/compras/resumen');
}

// ── Recepciones ──────────────────────────────────────────────────

export async function registrarRecepcion(
  ordenId: string,
  payload: RegistrarRecepcionPayload,
): Promise<{ orden: OrdenCompraDto; recepcion: RecepcionCompraDto }> {
  return client.post(`/compras/ordenes/${ordenId}/recepciones`, payload);
}

// ── Comprobantes (foto de boleta/factura) ────────────────────────

export async function listarComprobantes(ordenId: string): Promise<ComprobanteCompraDto[]> {
  const response = await client.get<{ data: ComprobanteCompraDto[] }>(`/compras/comprobantes?ordenId=${ordenId}`);
  return response.data;
}

export function subirComprobante(
  archivo: Blob,
  campos: { ordenId?: string; recepcionId?: string; tipo?: string; nombreArchivo?: string },
): Promise<{ message: string; comprobante: ComprobanteCompraDto }> {
  const form = new FormData();
  form.append('file', archivo, campos.nombreArchivo ?? 'comprobante.webp');
  if (campos.ordenId) form.append('ordenId', campos.ordenId);
  if (campos.recepcionId) form.append('recepcionId', campos.recepcionId);
  if (campos.tipo) form.append('tipo', campos.tipo);
  return client.postForm('/compras/comprobantes', form);
}

export function eliminarComprobante(id: string): Promise<{ message: string }> {
  return client.delete(`/compras/comprobantes/${id}`);
}

export function obtenerArchivoBlob(id: string): Promise<Blob> {
  return client.getBlob(`/compras/comprobantes/${id}/archivo`);
}

export function obtenerMiniaturaBlob(id: string): Promise<Blob> {
  return client.getBlob(`/compras/comprobantes/${id}/miniatura`);
}
