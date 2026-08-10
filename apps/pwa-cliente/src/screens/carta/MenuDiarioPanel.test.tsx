// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MenuDiarioPanel } from './MenuDiarioPanel';
import { useMenuDiarioQuery } from '../../hooks/queries/useMenuDiarioQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import type { ProductoVM } from '../../types/inventario.types';

vi.mock('../../hooks/queries/useMenuDiarioQuery');
vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../components/ui/ToastProvider', () => ({ useToast: vi.fn() }));
vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

const productoVM = (over: Partial<ProductoVM> = {}): ProductoVM => ({
  id: 'prod-1',
  categoriaId: 'cat-1',
  categoriaNombre: 'Entradas',
  nombre: 'Causa Limeña',
  descripcion: null,
  precio: 22,
  precioLabel: 'S/ 22.00',
  disponible: true,
  stockActual: null,
  stockLabel: 'Sin control',
  stockClass: 'badge-ok',
  ...over,
});

const categorias = [{ id: 'cat-1', nombre: 'Entradas', descripcion: null, parentId: null }];

describe('MenuDiarioPanel', () => {
  const agregarAlMenu = vi.fn();
  const actualizarDisponibilidad = vi.fn();
  const quitarDelMenu = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
    vi.mocked(useMenuDiarioQuery).mockReturnValue({
      menu: [],
      loading: false,
      saving: false,
      error: null,
      success: null,
      agregarAlMenu,
      actualizarDisponibilidad,
      quitarDelMenu,
      fetch: vi.fn(),
      clearFeedback: vi.fn(),
    } as any);
  });

  it('muestra el estado vacío cuando no hay platos en el menú de hoy', () => {
    render(<MenuDiarioPanel productos={[]} categorias={categorias} />);
    expect(screen.getByText(/Aún no hay platos en el menú de hoy/)).toBeInTheDocument();
  });

  it('lista los platos del menú con su disponibilidad', () => {
    vi.mocked(useMenuDiarioQuery).mockReturnValue({
      menu: [
        { id: 'md-1', disponible: true, producto: productoVM({ nombre: 'Ceviche Clásico', precioLabel: 'S/ 35.00' }) },
        { id: 'md-2', disponible: false, producto: productoVM({ id: 'prod-2', nombre: 'Lomo Saltado', precioLabel: 'S/ 42.00' }) },
      ],
      loading: false, saving: false, error: null, success: null,
      agregarAlMenu, actualizarDisponibilidad, quitarDelMenu, fetch: vi.fn(), clearFeedback: vi.fn(),
    } as any);

    render(<MenuDiarioPanel productos={[]} categorias={categorias} />);

    expect(screen.getByText('Ceviche Clásico')).toBeInTheDocument();
    expect(screen.getByText('Lomo Saltado')).toBeInTheDocument();
  });

  it('activa/desactiva un plato del menú al tocar el toggle', () => {
    vi.mocked(useMenuDiarioQuery).mockReturnValue({
      menu: [{ id: 'md-1', disponible: true, producto: productoVM() }],
      loading: false, saving: false, error: null, success: null,
      agregarAlMenu, actualizarDisponibilidad, quitarDelMenu, fetch: vi.fn(), clearFeedback: vi.fn(),
    } as any);

    render(<MenuDiarioPanel productos={[]} categorias={categorias} />);
    fireEvent.click(screen.getByTitle('Disponible'));

    expect(actualizarDisponibilidad).toHaveBeenCalledWith('md-1', false);
  });

  it('quita un plato del menú del día', () => {
    vi.mocked(useMenuDiarioQuery).mockReturnValue({
      menu: [{ id: 'md-1', disponible: true, producto: productoVM() }],
      loading: false, saving: false, error: null, success: null,
      agregarAlMenu, actualizarDisponibilidad, quitarDelMenu, fetch: vi.fn(), clearFeedback: vi.fn(),
    } as any);

    render(<MenuDiarioPanel productos={[]} categorias={categorias} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(quitarDelMenu).toHaveBeenCalledWith('md-1');
  });

  it('agrega un plato existente desde el drawer', async () => {
    render(<MenuDiarioPanel productos={[productoVM()]} categorias={categorias} />);

    fireEvent.click(screen.getByRole('button', { name: /Agregar al menú/i }));
    fireEvent.click(screen.getByText('Causa Limeña'));

    await waitFor(() => expect(agregarAlMenu).toHaveBeenCalledWith({ productoId: 'prod-1' }));
  });

  it('crea un plato nuevo y lo agrega al menú desde el drawer', async () => {
    agregarAlMenu.mockResolvedValue({});
    render(<MenuDiarioPanel productos={[]} categorias={categorias} />);

    fireEvent.click(screen.getByRole('button', { name: /Agregar al menú/i }));
    fireEvent.click(screen.getByText('Plato nuevo'));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Especial del día' } });
    fireEvent.change(screen.getByLabelText('Precio de venta'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear y agregar al menú/i }));

    await waitFor(() =>
      expect(agregarAlMenu).toHaveBeenCalledWith({
        producto: { nombre: 'Especial del día', categoriaId: 'cat-1', precio: 25 },
      }),
    );
  });
});
