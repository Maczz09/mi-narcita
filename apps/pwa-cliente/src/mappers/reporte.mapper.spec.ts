// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { mapResumen } from './reporte.mapper';

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fecha: '2026-06-07',
    totalVentas: 10,
    ingresosTotales: 1500,
    ventasPorHora: [{ hora: '12:00', total: 3, ingresos: 400 }],
    topProductos: [{ nombre: 'Nachos', cantidad: 5 }],
    ...overrides,
  };
}

describe('mapResumen', () => {
  it('mapea fecha, totalVentas e ingresosTotales', () => {
    const vm = mapResumen(dto());
    expect(vm.fecha).toBe('2026-06-07');
    expect(vm.totalVentas).toBe(10);
    expect(vm.ingresosTotales).toBe(1500);
  });

  it('fechaLabel es una cadena con la fecha formateada en español', () => {
    const vm = mapResumen(dto({ fecha: '2026-06-07' }));
    expect(typeof vm.fechaLabel).toBe('string');
    expect(vm.fechaLabel.length).toBeGreaterThan(0);
    // No debe coincidir con el formato ISO crudo
    expect(vm.fechaLabel).not.toBe('2026-06-07');
  });

  it('fechaLabel devuelve la fecha cruda si es inválida', () => {
    const vm = mapResumen(dto({ fecha: 'NO_VALIDA' }));
    expect(vm.fechaLabel).toBe('NO_VALIDA');
  });

  it('ingresosLabel es string con formato de moneda PEN', () => {
    const vm = mapResumen(dto({ ingresosTotales: 1500 }));
    expect(typeof vm.ingresosLabel).toBe('string');
    expect(vm.ingresosLabel).toContain('1');
  });

  it('ticketPromedio calcula correctamente', () => {
    const vm = mapResumen(dto({ totalVentas: 5, ingresosTotales: 500 }));
    expect(vm.ticketPromedio).toBe(100);
  });

  it('ticketPromedio es null cuando totalVentas es 0', () => {
    const vm = mapResumen(dto({ totalVentas: 0, ingresosTotales: 0 }));
    expect(vm.ticketPromedio).toBeNull();
  });

  it('ticketPromedioLabel "Sin ventas" cuando ticketPromedio es null', () => {
    const vm = mapResumen(dto({ totalVentas: 0, ingresosTotales: 0 }));
    expect(vm.ticketPromedioLabel).toBe('Sin ventas');
  });

  it('ticketPromedioLabel es string con formato de moneda cuando hay ventas', () => {
    const vm = mapResumen(dto({ totalVentas: 4, ingresosTotales: 400 }));
    expect(typeof vm.ticketPromedioLabel).toBe('string');
    expect(vm.ticketPromedioLabel).not.toBe('Sin ventas');
  });

  it('propaga ventasPorHora tal cual', () => {
    const horas = [{ hora: '14:00', total: 2 }];
    const vm = mapResumen(dto({ ventasPorHora: horas }));
    expect(vm.ventasPorHora).toEqual(horas);
  });

  it('ventasPorHora es array vacío si no viene en el DTO', () => {
    const vm = mapResumen(dto({ ventasPorHora: undefined }));
    expect(vm.ventasPorHora).toEqual([]);
  });

  it('propaga topProductos tal cual', () => {
    const prods = [{ nombre: 'Nachos', cantidad: 5 }];
    const vm = mapResumen(dto({ topProductos: prods }));
    expect(vm.topProductos).toEqual(prods);
  });

  it('topProductos es array vacío si no viene en el DTO', () => {
    const vm = mapResumen(dto({ topProductos: undefined }));
    expect(vm.topProductos).toEqual([]);
  });
});

