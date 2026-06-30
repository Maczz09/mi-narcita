// @ts-nocheck
import { renderHook } from '@testing-library/react';
import { useInicioData } from './useInicioData';
import {  } from '@jest/globals';

jest.mock('./queries/useMesasQuery', () => ({
  useMesasQuery: () => ({ mesas: [] }),
}));

jest.mock('./queries/usePedidosQuery', () => ({
  usePedidosQuery: () => ({ pedidos: [] }),
}));

jest.mock('./queries/useCajaQuery', () => ({
  useCajaQuery: () => ({ resumen: null }),
}));

jest.mock('./queries/useReportesQuery', () => ({
  useReportesQuery: () => ({ resumen: null }),
}));

jest.mock('./queries/useReservasQuery', () => ({
  useReservasQuery: () => ({ reservas: [] }),
}));

jest.mock('./queries/useInventarioQuery', () => ({
  useInventarioQuery: () => ({ productos: [] }),
}));

describe('useInicioData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default values when no data is provided', () => {
    const { result } = renderHook(() => useInicioData());
    
    expect(result.current.totalVentas).toBe(0);
    expect(result.current.cuentas).toBe(0);
    expect(result.current.turnoAbierto).toBe(false);
    expect(result.current.salon.total).toBe(0);
    expect(result.current.cocina.activos).toBe(0);
    expect(result.current.actividad).toEqual([]);
    expect(result.current.atencionCount).toBe(0);
  });
});

