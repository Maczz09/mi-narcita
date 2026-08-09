// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistorialCajaScreen } from './HistorialCajaScreen';
import { useHistorialCajaQuery, useTurnoDetalleQuery } from '../../hooks/queries/useHistorialCajaQuery';

vi.mock('../../hooks/queries/useHistorialCajaQuery', () => ({
  useHistorialCajaQuery: vi.fn(),
  useTurnoDetalleQuery: vi.fn(),
}));

const mockTurnos = [
  { id: 't1', cajaId: 'T01', cajaNombre: 'Terminal 01', cajeroNombre: 'Yurlury Quispe', estado: 'CERRADA', abiertoAt: '2026-08-08T11:05:00.000Z', cerradoAt: '2026-08-08T19:00:00.000Z' },
  { id: 't2', cajaId: 'T01', cajaNombre: 'Terminal 01', cajeroNombre: null, estado: 'ABIERTA', abiertoAt: '2026-08-09T08:00:00.000Z', cerradoAt: null },
];

function baseListMock(overrides: Record<string, unknown> = {}) {
  return {
    turnos: mockTurnos,
    nextCursor: null,
    loading: false,
    loadingMore: false,
    error: null,
    fetch: vi.fn(),
    fetchMore: vi.fn(),
    ...overrides,
  };
}

function baseDetalleMock(overrides: Record<string, unknown> = {}) {
  return {
    detalle: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('HistorialCajaScreen', () => {
  beforeEach(() => {
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock() as any);
    vi.mocked(useTurnoDetalleQuery).mockReturnValue(baseDetalleMock() as any);
  });

  it('renderiza la lista de turnos con sus KPIs', () => {
    render(<HistorialCajaScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Historial de caja' })).toBeInTheDocument();
    expect(screen.getByText('Yurlury Quispe')).toBeInTheDocument();
    expect(screen.getAllByText('Terminal 01')).toHaveLength(2);
  });

  it('filtra por estado CERRADA por defecto', () => {
    render(<HistorialCajaScreen />);
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'CERRADA' }),
    );
  });

  it('cambia el filtro de estado al hacer click en los chips', () => {
    render(<HistorialCajaScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: undefined }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abiertas' }));
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'ABIERTA' }),
    );
  });

  it('aplica el filtro de fecha', () => {
    render(<HistorialCajaScreen />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-08-08' } });
    expect(useHistorialCajaQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: '2026-08-01', hasta: '2026-08-08' }),
    );
  });

  it('muestra el estado vacío cuando no hay turnos', () => {
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock({ turnos: [] }) as any);
    render(<HistorialCajaScreen />);
    expect(screen.getByText('Sin turnos')).toBeInTheDocument();
  });

  it('muestra el banner de error', () => {
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock({ error: 'No se pudo cargar' }) as any);
    render(<HistorialCajaScreen />);
    expect(screen.getByText('No se pudo cargar')).toBeInTheDocument();
  });

  it('abre el detalle de un turno al hacer click en la fila', async () => {
    vi.mocked(useTurnoDetalleQuery).mockReturnValue(
      baseDetalleMock({
        detalle: {
          turno: { cajaNombre: 'Terminal 01', cajeroNombre: 'Yurlury Quispe', abiertoAt: '2026-08-08T11:05:00.000Z', cerradoAt: '2026-08-08T19:00:00.000Z' },
          totalVentas: 864,
          propinas: 40,
          efectivoEsperado: 500,
          arqueo: { efectivoEsperado: 500, efectivoContado: 498, diferencia: -2 },
          porMetodo: { EFECTIVO: 500, TARJETA: 200, YAPE: 100, PLIN: 0, TRANSFERENCIA: 64 },
        },
      }) as any,
    );

    render(<HistorialCajaScreen />);
    fireEvent.click(screen.getByText('Yurlury Quispe'));

    await waitFor(() => {
      expect(screen.getByText('S/ 864.00')).toBeInTheDocument();
    });
    expect(screen.getByText('S/ -2.00')).toBeInTheDocument();
  });

  it('carga más turnos con fetchMore', () => {
    const fetchMore = vi.fn();
    vi.mocked(useHistorialCajaQuery).mockReturnValue(baseListMock({ nextCursor: 'cur1', fetchMore }) as any);
    render(<HistorialCajaScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Cargar más/i }));
    expect(fetchMore).toHaveBeenCalled();
  });
});
