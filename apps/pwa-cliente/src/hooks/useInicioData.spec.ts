import { renderHook } from '@testing-library/react';
import { useInicioData } from './useInicioData';
import { vi } from 'vitest';

vi.mock('./queries/useMesasQuery', () => ({
  useMesasQuery: () => ({ mesas: [] }),
}));

vi.mock('./queries/usePedidosQuery', () => ({
  usePedidosQuery: () => ({ pedidos: [] }),
}));

vi.mock('./queries/useCajaQuery', () => ({
  useCajaQuery: () => ({ resumen: null }),
}));

vi.mock('./queries/useReportesQuery', () => ({
  useReportesQuery: () => ({ resumen: null }),
}));

vi.mock('./queries/useReservasQuery', () => ({
  useReservasQuery: () => ({ reservas: [] }),
}));

vi.mock('./queries/useInventarioQuery', () => ({
  useInventarioQuery: () => ({ productos: [] }),
}));

describe('useInicioData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
