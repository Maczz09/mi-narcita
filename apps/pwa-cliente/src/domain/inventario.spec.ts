// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { stockNivel, computeInventarioKpis, INITIAL_PRODUCT } from './inventario';

describe('inventario domain', () => {
  it('stockNivel works correctly', () => {
    expect(stockNivel(null)).toBe('none');
    expect(stockNivel(0)).toBe('out');
    expect(stockNivel(-1)).toBe('out');
    expect(stockNivel(5)).toBe('low');
    expect(stockNivel(3)).toBe('low');
    expect(stockNivel(6)).toBe('ok');
    expect(stockNivel(100)).toBe('ok');
  });

  it('computeInventarioKpis works correctly', () => {
    const productos = [
      { disponible: true, stockActual: 10 },
      { disponible: true, stockActual: 4 },
      { disponible: false, stockActual: 0 },
      { disponible: true, stockActual: null },
    ];

    const kpis = computeInventarioKpis(productos);
    expect(kpis).toEqual({
      total: 4,
      disponibles: 3,
      bajo: 1,
      agotados: 1,
    });
  });

  it('INITIAL_PRODUCT is correctly shaped', () => {
    expect(INITIAL_PRODUCT).toEqual({
      categoriaId: '',
      nombre: '',
      descripcion: '',
      precio: 0,
      disponible: true,
      stockActual: 0,
    });
  });
});

