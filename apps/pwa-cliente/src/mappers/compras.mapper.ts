// mappers/compras.mapper.ts - DTOs de Compras -> ViewModels de UI

import type {
  InsumoDto,
  InsumoVM,
  OrdenCompraDto,
  OrdenCompraEstado,
  OrdenCompraItemDto,
  OrdenCompraItemVM,
  OrdenCompraVM,
  ProveedorDto,
  ProveedorVM,
} from '../types/compras.types';

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

const ESTADO_LABEL: Record<OrdenCompraEstado, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  PARCIAL: 'Recepción parcial',
  RECIBIDA: 'Recibida',
  ANULADA: 'Anulada',
};

const ESTADO_CLASS: Record<OrdenCompraEstado, string> = {
  BORRADOR: 'badge-muted',
  ENVIADA: 'badge-info',
  PARCIAL: 'badge-warn',
  RECIBIDA: 'badge-ok',
  ANULADA: 'badge-danger',
};

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function mapProveedor(dto: ProveedorDto): ProveedorVM {
  return { ...dto, iniciales: iniciales(dto.nombre) };
}

export function mapProveedores(dtos: ProveedorDto[]): ProveedorVM[] {
  return dtos.map(mapProveedor);
}

export function mapInsumo(dto: InsumoDto): InsumoVM {
  return { ...dto, bajoMinimo: dto.stockActual <= dto.stockMinimo };
}

export function mapInsumos(dtos: InsumoDto[]): InsumoVM[] {
  return dtos.map(mapInsumo);
}

function mapOrdenItem(dto: OrdenCompraItemDto): OrdenCompraItemVM {
  return {
    ...dto,
    pendiente: Math.max(0, dto.cantidadPedida - dto.cantidadRecibida),
    subtotal: dto.cantidadPedida * dto.costoUnitario,
  };
}

const FECHA_FMT = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });

function fechaLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FECHA_FMT.format(d);
}

export function mapOrden(dto: OrdenCompraDto): OrdenCompraVM {
  return {
    ...dto,
    items: dto.items.map(mapOrdenItem),
    estadoLabel: ESTADO_LABEL[dto.estado] ?? dto.estado,
    estadoClass: ESTADO_CLASS[dto.estado] ?? 'badge-muted',
    fechaEmisionLabel: fechaLabel(dto.fechaEmision),
    fechaEntregaLabel: fechaLabel(dto.fechaEntregaEsperada),
    puedeEditar: dto.estado === 'BORRADOR',
    puedeEnviar: dto.estado === 'BORRADOR',
    puedeRecibir: dto.estado === 'ENVIADA' || dto.estado === 'PARCIAL',
    puedeCerrar: dto.estado === 'ENVIADA' || dto.estado === 'PARCIAL',
    puedeAnular: dto.estado === 'BORRADOR' || dto.estado === 'ENVIADA' || dto.estado === 'PARCIAL',
  };
}

export function mapOrdenes(dtos: OrdenCompraDto[]): OrdenCompraVM[] {
  return dtos.map(mapOrden);
}
