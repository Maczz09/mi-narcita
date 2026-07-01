// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartaScreen } from './CartaScreen';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { useToast } from '../../components/ui/ToastProvider';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn()
}));

vi.mock('../../hooks/queries/useInventarioQuery', () => ({
  useInventarioQuery: vi.fn()
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn()
}));

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Search: () => <svg data-testid="icon-search" />,
    Plus: () => <svg data-testid="icon-plus" />,
    Alert: () => <svg data-testid="icon-alert" />,
    Check: () => <svg data-testid="icon-check" />,
    Pedidos: () => <svg data-testid="icon-pedidos" />,
    Close: () => <svg data-testid="icon-close" />
  }
}));

vi.mock('../../components/ui/Stat', () => ({
  MiniStat: ({ k, v, d }: any) => <div data-testid={`stat-${k}`}>{v} - {d}</div>
}));

const mockCategorias = [
  { id: 'cat1', nombre: 'Platos de Fondo' },
  { id: 'cat2', nombre: 'Bebidas' }
];

const mockProductos = [
  { id: 'p1', nombre: 'Lomo Saltado', descripcion: 'Rico', categoriaId: 'cat1', categoriaNombre: 'Platos de Fondo', precio: 25.5, precioLabel: 'S/ 25.50', disponible: true },
  { id: 'p2', nombre: 'Chicha', descripcion: '', categoriaId: 'cat2', categoriaNombre: 'Bebidas', precio: 5, precioLabel: 'S/ 5.00', disponible: false }
];

describe('CartaScreen', () => {
  const toastMock = vi.fn();

  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: toastMock } as any);
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn()
    } as any);
  });

  it('renders and handles filtering', () => {
    render(<CartaScreen />);

    expect(screen.getByText('Carta / Menú')).toBeDefined();
    
    // Check categories tabs
    expect(screen.getAllByText(/Platos de Fondo/i)[0]).toBeDefined();
    
    // Switch tab
    fireEvent.click(screen.getAllByText(/Bebidas/i)[0]);
    
    // Search
    fireEvent.change(screen.getByPlaceholderText('Buscar plato…'), { target: { value: 'Lomo' } });
  });

  it('handles toggle disp', async () => {
    const actualizarProducto = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto
    } as any);

    render(<CartaScreen />);

    // Click toggle of first product
    const toggles = screen.getAllByRole('button', { name: /Disponible/i });
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(actualizarProducto).toHaveBeenCalledWith('p1', { disponible: false });
    });
  });

  it('handles toggle disp offline and error', async () => {
    const actualizarProducto = vi.fn().mockRejectedValue(new Error('Update failed'));
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto
    } as any);

    const { rerender } = render(<CartaScreen />);
    
    // Click toggle 
    const toggles = screen.getAllByRole('button', { name: /Disponible/i });
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({ title: 'No se pudo actualizar', msg: 'Update failed', icon: 'Alert', kind: 'err' });
    });
    
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    rerender(<CartaScreen />);
    
    toastMock.mockClear();
    fireEvent.click(toggles[0]);
    expect(actualizarProducto).toHaveBeenCalledTimes(1); // not called again
  });

  it('handles edit product and save error', async () => {
    const actualizarProducto = vi.fn().mockRejectedValue(new Error('Edit error'));
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto
    } as any);

    render(<CartaScreen />);

    // Click on row to edit
    fireEvent.click(screen.getByText('Lomo Saltado'));
    
    // Edit Drawer is open
    expect(screen.getByLabelText('Nombre')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Lomo Saltado Editado' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    
    await waitFor(() => {
      expect(actualizarProducto).toHaveBeenCalledWith('p1', { nombre: 'Lomo Saltado Editado', categoriaId: 'cat1', precio: 25.5, disponible: true });
    });
    
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({ title: 'No se pudo guardar', msg: 'Edit error', icon: 'Alert', kind: 'err' });
    });

    // Close
    fireEvent.click(screen.getByTestId('scrim'));
  });

  it('handles create product', async () => {
    const crearProducto = vi.fn();
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: mockProductos,
      loading: false,
      saving: false,
      crearProducto,
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    // Nuevo Plato
    fireEvent.click(screen.getByRole('button', { name: /Nuevo plato/i }));
    
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ceviche' } });
    fireEvent.change(screen.getByLabelText('Precio de venta'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'cat2' } });
    
    // Toggle disp
    const toggles = screen.getAllByRole('button');
    const drawerToggle = toggles.find(b => b.className.includes('toggle') && !b.hasAttribute('title'));
    if (drawerToggle) fireEvent.click(drawerToggle); // Turn off
    
    fireEvent.click(screen.getByRole('button', { name: /Crear plato/i }));

    await waitFor(() => {
      expect(crearProducto).toHaveBeenCalledWith({ nombre: 'Ceviche', categoriaId: 'cat2', precio: 35, disponible: false });
    });
  });

  it('handles loading state and empty state', () => {
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: [],
      productos: [],
      loading: true,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    expect(screen.getByText('Cargando carta…')).toBeDefined();
  });
  
  it('handles empty filtered state', () => {
    vi.mocked(useInventarioQuery).mockReturnValue({
      categorias: mockCategorias,
      productos: [],
      loading: false,
      saving: false,
      crearProducto: vi.fn(),
      actualizarProducto: vi.fn()
    } as any);

    render(<CartaScreen />);

    expect(screen.getByText(/Sin platos. Crea uno con "Nuevo plato"./i)).toBeDefined();
  });
});
