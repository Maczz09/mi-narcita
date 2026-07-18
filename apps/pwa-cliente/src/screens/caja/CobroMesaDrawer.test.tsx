// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CobroMesaDrawer } from './CobroMesaDrawer';
import { useCuentasQuery } from '../../hooks/queries/useCuentasQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn()
}));

vi.mock('../../hooks/queries/useCuentasQuery', () => ({
  useCuentasQuery: vi.fn()
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn()
}));

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Close: () => <svg data-testid="icon-close" />,
    Cash: () => <svg data-testid="icon-cash" />,
    Card: () => <svg data-testid="icon-card" />,
    Wallet: () => <svg data-testid="icon-wallet" />,
    Coins: () => <svg data-testid="icon-coins" />,
    Alert: () => <svg data-testid="icon-alert" />,
    Check: () => <svg data-testid="icon-check" />
  }
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn()
}));

const mockCuenta = {
  id: 'cuenta1',
  mesaId: 'mesa1',
  estado: 'ABIERTA',
  total: 100,
  cantidadItems: 2,
  pedidos: [
    {
      id: 'ped1',
      items: [
        { id: 'it1', nombre: 'Plato 1', cantidad: 1, subtotal: 60 },
        { id: 'it2', nombre: 'Plato 2', cantidad: 1, subtotal: 40 }
      ]
    }
  ]
};

describe('CobroMesaDrawer', () => {
  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn(),
      refetchCuenta: vi.fn()
    } as any);
  });

  it('renders and handles exact cash payment', async () => {
    const registrarPago = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago,
      clearFeedback: vi.fn()
    } as any);

    const onClose = vi.fn();
    const onPaid = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);

    expect(screen.getByText('Plato 1')).toBeDefined();
    
    // Descuento
    // The inputs are inputs without labels, we can find them by order or value
    // The first is Descuento, the second is Propina, the third is Recibido
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '5' } });
    
    // Keypad C
    const recibidoInput = screen.getByLabelText('Recibido') as HTMLInputElement;
    fireEvent.click(screen.getByText('C'));
    
    // Keypad 100
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    
    expect(recibidoInput.value).toBe('100');

    // Pay
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => {
      expect(registrarPago).toHaveBeenCalledWith({
        cuentaId: 'cuenta1',
        montoRecibido: 90, // totalBase
        metodo: 'EFECTIVO',
        descuento: 10,
        propina: 5,
        mesaNumero: '12'
      });
      expect(onPaid).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('handles other payment methods and insufficient payment', () => {
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    
    // Change method to Yape
    fireEvent.click(screen.getByText('Yape'));
    
    // Keypad is not there for Yape
    expect(screen.queryByText('Recibido')).toBeNull();
    
    // Change back to Efectivo
    fireEvent.click(screen.getByText('Efectivo'));
    
    const input = screen.getByLabelText('Recibido') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '50' } }); // 50 < 100 total
    
    expect(screen.getByText(/El monto recibido es menor al total./i)).toBeDefined();
    
    const payBtn = screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    expect(payBtn.hasAttribute('disabled')).toBe(true);

    // Exact button
    fireEvent.click(screen.getByText('Exacto'));
    expect(input.value).toBe('100.00');

    // S/ 200 button
    fireEvent.click(screen.getByText('S/ 200'));
    expect(input.value).toBe('200');
  });

  it('handles loading, offline and empty states', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: null,
      loading: true,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);

    const { rerender } = render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Cargando cuenta…')).toBeDefined();

    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: null,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    rerender(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Sin cuenta abierta')).toBeDefined();

    // With cuenta but offline
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    rerender(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    
    expect(screen.getByText('Sin conexión. Reconecta para registrar el pago.')).toBeDefined();
  });

  it('shows error and success messages', () => {
    const clearFeedback = vi.fn();
    const refetchCuenta = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: 'Error mock',
      success: 'Success mock',
      registrarPago: vi.fn(),
      clearFeedback,
      refetchCuenta
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Error mock')).toBeDefined();
    // T-04: con error visible, "Reintentar" dispara refetchCuenta.
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga de la cuenta' }));
    expect(refetchCuenta).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(clearFeedback).toHaveBeenCalled();
  });

  it('handles empty items array', () => {
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: { ...mockCuenta, pedidos: [] },
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    expect(screen.getByText('La cuenta no tiene ítems.')).toBeDefined();
  });
});
