// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventarioScreen } from './InventarioScreen';
import * as onlineStatusHook from '../../hooks/useOnlineStatus';
import * as inventarioQueryHook from '../../hooks/queries/useInventarioQuery';

vi.mock('../../components/inventario/ProductoTable', () => ({
  ProductoTable: ({ onToggleDisponible, onReponer, onReponerQuick, onLoadMore, onStockInput, stockInputs }: any) => (
    <div data-testid="producto-table">
      <button onClick={() => onToggleDisponible({ id: 'P1', disponible: true })}>Toggle P1</button>
      <button onClick={() => onReponer('P1')}>Reponer P1</button>
      <button onClick={() => onReponerQuick('P1', 5)}>Quick Reponer P1</button>
      <button onClick={() => onLoadMore()}>Load More</button>
      <input data-testid="stock-input-P1" value={stockInputs['P1'] || ''} onChange={(e) => onStockInput('P1', e.target.value)} />
    </div>
  )
}));

vi.mock('../../components/inventario/NuevoProductoForm', () => ({
  NuevoProductoForm: ({ form, onChange, onSubmit }: any) => (
    <form data-testid="nuevo-producto-form" onSubmit={onSubmit}>
      <input data-testid="form-nombre" value={form.nombre} onChange={(e) => onChange('nombre', e.target.value)} />
      <button type="submit">Submit Form</button>
    </form>
  )
}));

describe('InventarioScreen', () => {
  const mockCrearProducto = vi.fn().mockResolvedValue(true);
  const mockActualizarProducto = vi.fn().mockResolvedValue(true);
  const mockReponerStock = vi.fn().mockResolvedValue(true);
  const mockClearFeedback = vi.fn();
  const mockFetch = vi.fn();
  const mockFetchMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(true);
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [{ id: 'C1', nombre: 'Categoría 1' }],
      productos: [
        { id: 'P1', nombre: 'Producto 1', categoriaId: 'C1', stockActual: 10, disponible: true, precio: 10, minStock: 5 },
        { id: 'P2', nombre: 'Producto 2', categoriaId: 'C1', stockActual: 0, disponible: false, precio: 5, minStock: 2 }
      ],
      nextCursor: 'cursor123',
      loading: false,
      loadingMore: false,
      saving: false,
      error: null,
      success: null,
      fetch: mockFetch,
      fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto,
      actualizarProducto: mockActualizarProducto,
      reponerStock: mockReponerStock,
      clearFeedback: mockClearFeedback
    } as any);
  });

  it('renders InventarioScreen and triggers fetch on refresh', () => {
    render(<InventarioScreen />);
    expect(screen.getByText('Inventario')).toBeInTheDocument();
    
    const refreshBtn = screen.getByTitle('Refrescar');
    fireEvent.click(refreshBtn);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('shows error feedback and can clear it', () => {
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [], productos: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: 'Error message', success: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto, actualizarProducto: mockActualizarProducto, reponerStock: mockReponerStock, clearFeedback: mockClearFeedback
    } as any);
    render(<InventarioScreen />);
    expect(screen.getByText('Error message')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cerrar'));
    expect(mockClearFeedback).toHaveBeenCalled();
  });

  it('shows offline warning', () => {
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    render(<InventarioScreen />);
    expect(screen.getByText('Sin conexión. Las mutaciones están deshabilitadas.')).toBeInTheDocument();
  });

  it('handles search and category change', () => {
    render(<InventarioScreen />);
    const searchInput = screen.getByPlaceholderText('Buscar producto…');
    fireEvent.change(searchInput, { target: { value: 'Prod' } });
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'C1' } });
    
    // Changing value should just work
    expect((searchInput as HTMLInputElement).value).toBe('Prod');
    expect((select as HTMLSelectElement).value).toBe('C1');
  });

  it('handles new product creation', async () => {
    render(<InventarioScreen />);
    const nameInput = screen.getByTestId('form-nombre');
    fireEvent.change(nameInput, { target: { value: 'New Prod' } });
    
    const form = screen.getByTestId('nuevo-producto-form');
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(mockCrearProducto).toHaveBeenCalled();
    });
  });

  it('does not create product if offline', async () => {
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    render(<InventarioScreen />);
    const form = screen.getByTestId('nuevo-producto-form');
    fireEvent.submit(form);
    expect(mockCrearProducto).not.toHaveBeenCalled();
  });
  
  it('handles errors when creating product', async () => {
    mockCrearProducto.mockRejectedValueOnce(new Error('Network error'));
    render(<InventarioScreen />);
    const form = screen.getByTestId('nuevo-producto-form');
    
    // We expect console.error to be called
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fireEvent.submit(form);
    
    // Await promise resolution
    await new Promise(process.nextTick);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles product table actions', async () => {
    render(<InventarioScreen />);
    
    fireEvent.click(screen.getByText('Toggle P1'));
    await waitFor(() => {
      expect(mockActualizarProducto).toHaveBeenCalledWith('P1', { disponible: false });
    });

    // Set stock input and reponer
    const stockInput = screen.getByTestId('stock-input-P1');
    fireEvent.change(stockInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    await waitFor(() => {
      expect(mockReponerStock).toHaveBeenCalledWith('P1', 10);
    });
    
    fireEvent.click(screen.getByText('Quick Reponer P1'));
    await waitFor(() => {
      expect(mockReponerStock).toHaveBeenCalledWith('P1', 5);
    });
  });
  
  it('does not reponer if quantity is invalid or offline', async () => {
    render(<InventarioScreen />);
    const stockInput = screen.getByTestId('stock-input-P1');
    fireEvent.change(stockInput, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    expect(mockReponerStock).not.toHaveBeenCalled();
    
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    fireEvent.change(stockInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    expect(mockReponerStock).not.toHaveBeenCalled();
  });
  
  it('handles toggle and quick reponer offline or saving correctly', async () => {
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [], productos: [], nextCursor: null, loading: false, loadingMore: false, saving: true,
      error: null, success: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto, actualizarProducto: mockActualizarProducto, reponerStock: mockReponerStock, clearFeedback: mockClearFeedback
    } as any);
    const { unmount } = render(<InventarioScreen />);
    fireEvent.click(screen.getByText('Toggle P1'));
    expect(mockActualizarProducto).not.toHaveBeenCalled();
    unmount();
    
    vi.spyOn(onlineStatusHook, 'useOnlineStatus').mockReturnValue(false);
    vi.spyOn(inventarioQueryHook, 'useInventarioQuery').mockReturnValue({
      categorias: [], productos: [], nextCursor: null, loading: false, loadingMore: false, saving: false,
      error: null, success: null, fetch: mockFetch, fetchMore: mockFetchMore,
      crearProducto: mockCrearProducto, actualizarProducto: mockActualizarProducto, reponerStock: mockReponerStock, clearFeedback: mockClearFeedback
    } as any);
    render(<InventarioScreen />);
    fireEvent.click(screen.getByText('Quick Reponer P1'));
    expect(mockReponerStock).not.toHaveBeenCalled();
  });
  
  it('catches errors in quick reponer and toggle', async () => {
    mockActualizarProducto.mockRejectedValueOnce(new Error('error toggle'));
    mockReponerStock.mockRejectedValueOnce(new Error('error reponer'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<InventarioScreen />);
    fireEvent.click(screen.getByText('Toggle P1'));
    await new Promise(process.nextTick);
    expect(consoleSpy).toHaveBeenCalled();
    
    fireEvent.click(screen.getByText('Quick Reponer P1'));
    await new Promise(process.nextTick);
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    
    consoleSpy.mockRestore();
  });
  
  it('catches errors in handleReponer', async () => {
    mockReponerStock.mockRejectedValueOnce(new Error('error handle reponer'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<InventarioScreen />);
    const stockInput = screen.getByTestId('stock-input-P1');
    fireEvent.change(stockInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('Reponer P1'));
    
    await new Promise(process.nextTick);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

