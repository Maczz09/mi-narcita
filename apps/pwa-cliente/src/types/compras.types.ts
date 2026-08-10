// types/compras.types.ts - DTOs y ViewModels de Compras (proveedores, insumos,
// órdenes de compra, recepciones y comprobantes). Los DTOs vienen directo de
// @org/contracts: el backend y el frontend comparten la misma forma.

import type {
  ActualizarInsumoCommand,
  ActualizarProveedorCommand,
  ComprobanteCompraDto as ContractComprobanteCompraDto,
  CrearInsumoCommand,
  CrearOrdenCompraCommand,
  CrearProveedorCommand,
  InsumoDto as ContractInsumoDto,
  ListarInsumosQuery,
  ListarOrdenesQuery,
  ListarProveedoresQuery,
  OrdenCompraDto as ContractOrdenCompraDto,
  OrdenCompraEstado as ContractOrdenCompraEstado,
  OrdenCompraItemDto as ContractOrdenCompraItemDto,
  ProveedorDto as ContractProveedorDto,
  RecepcionCompraDto as ContractRecepcionCompraDto,
  RegistrarRecepcionCommand,
  ResumenComprasDto as ContractResumenComprasDto,
} from '@org/contracts';

export const OrdenCompraEstado = {
  Borrador: 'BORRADOR',
  Enviada: 'ENVIADA',
  Parcial: 'PARCIAL',
  Recibida: 'RECIBIDA',
  Anulada: 'ANULADA',
} as const satisfies Record<string, ContractOrdenCompraEstado>;
export type OrdenCompraEstado = ContractOrdenCompraEstado;

export type ProveedorDto = ContractProveedorDto;
export type InsumoDto = ContractInsumoDto;
export type OrdenCompraDto = ContractOrdenCompraDto;
export type OrdenCompraItemDto = ContractOrdenCompraItemDto;
export type RecepcionCompraDto = ContractRecepcionCompraDto;
export type ComprobanteCompraDto = ContractComprobanteCompraDto;
export type ResumenComprasDto = ContractResumenComprasDto;

export type ProveedorListQuery = ListarProveedoresQuery;
export type InsumoListQuery = ListarInsumosQuery;
export type OrdenListQuery = ListarOrdenesQuery;

export type CrearProveedorPayload = CrearProveedorCommand;
export type ActualizarProveedorPayload = ActualizarProveedorCommand;
export type CrearInsumoPayload = CrearInsumoCommand;
export type ActualizarInsumoPayload = ActualizarInsumoCommand;
export type CrearOrdenPayload = CrearOrdenCompraCommand;
export type RegistrarRecepcionPayload = RegistrarRecepcionCommand;

// ── ViewModels (campos derivados para la UI) ──────────────────────

export interface ProveedorVM extends ProveedorDto {
  iniciales: string;
}

export interface InsumoVM extends InsumoDto {
  bajoMinimo: boolean;
}

export interface OrdenCompraItemVM extends OrdenCompraItemDto {
  pendiente: number;
  subtotal: number;
}

export interface OrdenCompraVM extends Omit<OrdenCompraDto, 'items'> {
  items: OrdenCompraItemVM[];
  estadoLabel: string;
  estadoClass: string;
  fechaEmisionLabel: string;
  fechaEntregaLabel: string;
  puedeEnviar: boolean;
  puedeRecibir: boolean;
  puedeCerrar: boolean;
  puedeAnular: boolean;
  puedeEditar: boolean;
}

export interface OrdenDetalle {
  orden: OrdenCompraDto;
  recepciones: RecepcionCompraDto[];
  comprobantes: ComprobanteCompraDto[];
}
