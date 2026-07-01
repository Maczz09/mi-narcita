import { describe, it, expect } from 'vitest';
import { computeKpis, METODOS_ORDEN } from './cajaMeta';
import type { MovimientoCajaDto } from '../../types/caja.types';

describe('cajaMeta', () => {
  it('computes KPIs correctly from movements', () => {
    const movs: MovimientoCajaDto[] = [
      { id: '1', tipo: 'VENTA', metodo: 'EFECTIVO', monto: 100, propina: 10, descripcion: '', createdAt: '', referencia: '' },
      { id: '2', tipo: 'VENTA', metodo: 'TARJETA', monto: 200, propina: 20, descripcion: '', createdAt: '', referencia: '' },
      { id: '3', tipo: 'VENTA', metodo: 'YAPE', monto: 50, propina: 0, descripcion: '', createdAt: '', referencia: '' },
      { id: '4', tipo: 'INGRESO', metodo: 'EFECTIVO', monto: 100, descripcion: '', createdAt: '', referencia: '' },
      { id: '5', tipo: 'EGRESO', metodo: 'EFECTIVO', monto: -50, descripcion: '', createdAt: '', referencia: '' },
    ];

    const kpis = computeKpis(movs, 150);
    
    expect(kpis.totalVentas).toBe(350);
    expect(kpis.totalIngresos).toBe(100);
    expect(kpis.totalEgresos).toBe(-50);
    expect(kpis.propinas).toBe(30);
    expect(kpis.efectivoEsperado).toBe(150);
    expect(kpis.comprobantes).toBe(3);
    
    expect(kpis.porMetodo.EFECTIVO).toBe(100);
    expect(kpis.porMetodo.TARJETA).toBe(200);
    expect(kpis.porMetodo.YAPE).toBe(50);
    expect(kpis.porMetodo.PLIN).toBe(0);
    expect(kpis.porMetodo.TRANSFERENCIA).toBe(0);
  });
});
