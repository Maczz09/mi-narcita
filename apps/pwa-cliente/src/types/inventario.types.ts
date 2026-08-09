// types/inventario.types.ts - DTOs y ViewModels de inventario

import type {
  CategoriaDto as ContractCategoriaDto,
  CrearCategoriaCommand,
  ActualizarCategoriaCommand,
  CrearProductoCommand,
  ActualizarProductoCommand,
  ListarProductosQuery,
  ProductoDto as ContractProductoDto,
  ProductoListResponse as ContractProductoListResponse,
} from '@org/contracts';

export type CategoriaDto = ContractCategoriaDto;
export type CrearCategoriaPayload = CrearCategoriaCommand;
export type ActualizarCategoriaPayload = ActualizarCategoriaCommand;
export type ProductoDto = ContractProductoDto;
export type ProductoListQuery = ListarProductosQuery;
export type ProductoListResponse = ContractProductoListResponse;

export interface ProductoVM {
  id: string;
  categoriaId: string;
  categoriaNombre: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precioLabel: string;
  disponible: boolean;
  stockActual: number | null;
  stockLabel: string;
  stockClass: string;
}

export type CrearProductoPayload = CrearProductoCommand;
export type ActualizarProductoPayload = ActualizarProductoCommand;

export interface ProductoResponse {
  message: string;
  producto: ProductoDto;
}

export interface CategoriasResponse {
  categorias: CategoriaDto[];
}

export interface CategoriaResponse {
  message: string;
  categoria: CategoriaDto;
}

export interface ProductosResponse {
  productos: ProductoDto[];
}
