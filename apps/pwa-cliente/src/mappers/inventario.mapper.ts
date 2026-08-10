// mappers/inventario.mapper.ts - ProductoDto -> ProductoVM

import type { CategoriaDto, MenuDiarioItemDto, MenuDiarioItemVM, ProductoDto, ProductoVM } from '../types/inventario.types';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(value);
}

function stockClass(stock: number | null): string {
  if (stock === null) return 'badge-muted';
  if (stock <= 0) return 'badge-danger';
  if (stock <= 5) return 'badge-warn';
  return 'badge-ok';
}

export function mapProducto(dto: ProductoDto, categorias: CategoriaDto[] = []): ProductoVM {
  const categoria = dto.categoria ?? categorias.find((item) => item.id === dto.categoriaId) ?? null;
  const stockActual = dto.stockActual ?? null;

  return {
    id: dto.id,
    categoriaId: dto.categoriaId,
    categoriaNombre: categoria?.nombre ?? null,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? null,
    precio: Number(dto.precio),
    precioLabel: formatMoney(Number(dto.precio)),

    disponible: dto.disponible,
    stockActual,
    stockLabel: stockActual === null ? 'Sin control' : String(stockActual),
    stockClass: stockClass(stockActual),
  };
}

export function mapProductos(dtos: ProductoDto[], categorias: CategoriaDto[] = []): ProductoVM[] {
  return dtos.map((dto) => mapProducto(dto, categorias));
}

export function mapMenuDiarioItem(dto: MenuDiarioItemDto): MenuDiarioItemVM | null {
  if (!dto.producto) return null;
  return {
    id: dto.id,
    disponible: dto.disponible,
    producto: mapProducto(dto.producto),
  };
}

export function mapMenuDiario(dtos: MenuDiarioItemDto[]): MenuDiarioItemVM[] {
  return dtos.map(mapMenuDiarioItem).filter((item): item is MenuDiarioItemVM => item !== null);
}
