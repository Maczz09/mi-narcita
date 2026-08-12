import { describe, it, expect } from 'vitest';
import { formatMoney, mapInsumo, mapOrden, mapProveedor } from './compras.mapper';
import type { InsumoDto, OrdenCompraDto, ProveedorDto } from '../types/compras.types';

describe('compras.mapper (frontend)', () => {
  it('formatMoney formatea en soles', () => {
    expect(formatMoney(42)).toContain('42.00');
  });

  it('mapProveedor calcula las iniciales del nombre', () => {
    const dto: ProveedorDto = {
      id: 'pr-1', sedeId: 's1', nombre: 'Pesquera del Sur', ruc: null, categoria: null,
      contacto: null, telefono: null, diasEntrega: null, condicionPago: null, activo: true,
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    expect(mapProveedor(dto).iniciales).toBe('PD');
  });

  it('mapInsumo marca bajoMinimo cuando stockActual <= stockMinimo', () => {
    const dto: InsumoDto = {
      id: 'i-1', sedeId: 's1', nombre: 'Pescado', unidad: 'kg', stockActual: 1, stockMinimo: 3,
      costoUnitario: 28, proveedorId: null, proveedorNombre: null, productoId: null,
      factorConversion: 1, activo: true, createdAt: '2026-06-01T00:00:00.000Z',
    };
    expect(mapInsumo(dto).bajoMinimo).toBe(true);
    expect(mapInsumo({ ...dto, stockActual: 40 }).bajoMinimo).toBe(false);
  });

  it('mapOrden deriva pendiente/subtotal por ítem y los flags puede* según el estado', () => {
    const dto: OrdenCompraDto = {
      id: 'oc-1', sedeId: 's1', codigo: 'OC-1001', proveedorId: null, proveedorNombre: 'X',
      estado: 'PARCIAL', fechaEmision: '2026-06-01T00:00:00.000Z', fechaEnvio: null,
      fechaEntregaEsperada: null, fechaCierre: null, moneda: 'PEN', total: 336, notas: null,
      usuarioId: null, usuarioNombre: null,
      items: [
        { id: 'it-1', insumoId: 'i-1', insumoNombre: 'Pescado', unidad: 'kg', cantidadPedida: 12, cantidadRecibida: 5, costoUnitario: 28 },
      ],
      createdAt: '2026-06-01T00:00:00.000Z',
      comprobantesCount: 0,
    };
    const vm = mapOrden(dto);

    expect(vm.items[0].pendiente).toBe(7);
    expect(vm.items[0].subtotal).toBe(336);
    expect(vm.estadoLabel).toBe('Recepción parcial');
    expect(vm.puedeRecibir).toBe(true);
    expect(vm.puedeEnviar).toBe(false);
    expect(vm.puedeEditar).toBe(false);
    expect(vm.puedeAnular).toBe(true);
  });
});
