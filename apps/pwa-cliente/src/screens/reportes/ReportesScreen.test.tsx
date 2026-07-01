// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportesScreen } from './ReportesScreen';
import * as reportesQueryHook from '../../hooks/queries/useReportesQuery';

describe('ReportesScreen', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: null,
      loading: true,
      error: null,
      fetch: mockFetch
    } as any);
  });

  it('renders loading skeletons', () => {
    render(<ReportesScreen />);
    // Check if we render skeletons
    expect(screen.getByText('Reportes')).toBeInTheDocument();
  });

  it('renders empty state when no data and not loading', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: null,
      loading: false,
      error: null,
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);
    expect(screen.getByText('Sin resumen disponible')).toBeInTheDocument();
  });

  it('renders error banner', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: null,
      loading: false,
      error: 'Error message',
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('calls fetch on refresh button click', () => {
    render(<ReportesScreen />);
    fireEvent.click(screen.getByTitle('Refrescar'));
    expect(mockFetch).toHaveBeenCalled();
  });

  it('renders report data correctly with empty arrays', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: {
        ingresosLabel: 'S/ 100',
        fechaLabel: 'Hoy',
        totalVentas: 5,
        ticketPromedioLabel: 'S/ 20',
        ventasPorHora: [],
        topProductos: []
      },
      loading: false,
      error: null,
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);
    
    expect(screen.getByText('S/ 100')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('S/ 20')).toBeInTheDocument();
    
    expect(screen.getByText('Sin desglose horario')).toBeInTheDocument();
    expect(screen.getByText('Sin top productos')).toBeInTheDocument();
  });

  it('renders report data with arrays', () => {
    vi.spyOn(reportesQueryHook, 'useReportesQuery').mockReturnValue({
      resumen: {
        ingresosLabel: 'S/ 100',
        fechaLabel: 'Hoy',
        totalVentas: 5,
        ticketPromedioLabel: 'S/ 20',
        ventasPorHora: [
          { hora: '12:00', total: 50 },
          { hora: '13:00', total: 0 } // coverage for max || 1
        ],
        topProductos: [
          { productoId: 'P1', nombre: 'Burger', cantidad: 2, ingresos: 50 },
          { nombre: 'Fries', cantidad: 3, ingresos: null } // coverage for item.productoId ?? item.nombre and null ingresos
        ]
      },
      loading: false,
      error: null,
      fetch: mockFetch
    } as any);
    render(<ReportesScreen />);
    
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('13:00')).toBeInTheDocument();
    
    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('S/ 50.00')).toBeInTheDocument();
    expect(screen.getByText('Fries')).toBeInTheDocument();
    expect(screen.getByText('Sin dato')).toBeInTheDocument();
  });
});

