// api/inventario.api.ts - Llamadas al servicio de inventario

import { client } from './client';
import { unwrapArray, unwrapEntity } from './response';
import type {
  ActualizarCategoriaPayload,
  ActualizarProductoPayload,
  CategoriaDto,
  CategoriaResponse,
  CategoriasResponse,
  CrearCategoriaPayload,
  CrearProductoPayload,
  ProductoDto,
  ProductoListQuery,
  ProductoListResponse,
  ProductoResponse,
  ProductosResponse,
} from '../types/inventario.types';

export async function getCategorias(): Promise<CategoriaDto[]> {
  const response = await client.get<CategoriasResponse | CategoriaDto[]>('/inventario/categorias');
  return unwrapArray<CategoriaDto>(response, 'categorias');
}

export async function crearCategoria(payload: CrearCategoriaPayload): Promise<CategoriaDto> {
  const response = await client.post<CategoriaResponse | CategoriaDto>('/inventario/categorias', payload);
  return unwrapEntity<CategoriaDto>(response, 'categoria');
}

export async function actualizarCategoria(id: string, payload: ActualizarCategoriaPayload): Promise<CategoriaDto> {
  const response = await client.patch<CategoriaResponse | CategoriaDto>(`/inventario/categorias/${id}`, payload);
  return unwrapEntity<CategoriaDto>(response, 'categoria');
}

export async function eliminarCategoria(id: string): Promise<void> {
  await client.delete(`/inventario/categorias/${id}`);
}

function buildProductosQuery(query: ProductoListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.categoriaId) params.set('categoriaId', query.categoriaId);
  if (query.disponible != null) params.set('disponible', String(query.disponible));
  if (query.conStock != null) params.set('conStock', String(query.conStock));
  if (query.search) params.set('search', query.search);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.updatedSince) params.set('updatedSince', query.updatedSince);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getProductosPage(
  query: ProductoListQuery = {},
): Promise<ProductoListResponse> {
  const response = await client.get<
    ProductoListResponse | ProductosResponse | ProductoDto[]
  >(`/inventario/productos${buildProductosQuery(query)}`);

  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data)
  ) {
    return response;
  }

  return {
    data: unwrapArray<ProductoDto>(response, 'productos'),
    nextCursor: null,
  };
}

export async function getProductos(categoriaId?: string): Promise<ProductoDto[]> {
  const response = await getProductosPage({ categoriaId, limit: 50 });
  return response.data;
}

export async function crearProducto(payload: CrearProductoPayload): Promise<ProductoDto> {
  const response = await client.post<ProductoResponse | ProductoDto>('/inventario/productos', payload);
  return unwrapEntity<ProductoDto>(response, 'producto');
}

export async function actualizarProducto(
  id: string,
  payload: ActualizarProductoPayload,
): Promise<ProductoDto> {
  const response = await client.patch<ProductoResponse | ProductoDto>(
    `/inventario/productos/${id}`,
    payload,
  );
  return unwrapEntity<ProductoDto>(response, 'producto');
}

export async function reponerStock(id: string, cantidad: number): Promise<ProductoDto> {
  const response = await client.patch<ProductoResponse | ProductoDto>(`/inventario/productos/${id}/stock`, {
    stock: cantidad,
  });
  return unwrapEntity<ProductoDto>(response, 'producto');
}
