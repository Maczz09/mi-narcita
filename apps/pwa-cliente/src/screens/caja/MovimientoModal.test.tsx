// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MovimientoModal } from './MovimientoModal';

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    ArrowDown: () => <svg data-testid="icon-arrow-down" />,
    ArrowUp: () => <svg data-testid="icon-arrow-up" />,
    Close: () => <svg data-testid="icon-close" />,
    Check: () => <svg data-testid="icon-check" />
  }
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn()
}));

describe('MovimientoModal', () => {
  it('handles EGRESO state correctly', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(<MovimientoModal tipoInicial="EGRESO" onClose={onClose} onSave={onSave} />);

    expect(screen.getByText('Movimiento de efectivo')).toBeDefined();
    
    // Type in amount using keypad
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('.'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('0'));

    // Check input
    const input = screen.getByLabelText('Monto') as HTMLInputElement;
    expect(input.value).toBe('15.50');

    // Type in input
    fireEvent.change(input, { target: { value: '20' } });
    expect(input.value).toBe('20');
    
    // Keypad 'C'
    fireEvent.click(screen.getByText('C'));
    expect(input.value).toBe('');

    // Change again
    fireEvent.change(input, { target: { value: '50' } });

    // Change category
    const catBtn = screen.getByText('Servicios');
    fireEvent.click(catBtn);

    // Change note
    const notaInput = screen.getByLabelText('Nota (opcional)');
    fireEvent.change(notaInput, { target: { value: 'Pago de luz' } });

    // Save
    fireEvent.click(screen.getByRole('button', { name: /Registrar egreso/i }));
    
    expect(onSave).toHaveBeenCalledWith({
      tipo: 'EGRESO',
      donde: 'Servicios',
      motivo: 'Pago de luz',
      monto: 50
    });
  });

  it('handles INGRESO state correctly and switches types', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(<MovimientoModal tipoInicial="INGRESO" onClose={onClose} onSave={onSave} />);

    // Type via keypad edge cases
    fireEvent.click(screen.getByText('.'));
    fireEvent.click(screen.getByText('5'));
    
    const input = screen.getByLabelText('Monto') as HTMLInputElement;
    expect(input.value).toBe('0.5');

    fireEvent.click(screen.getByText('.')); // shouldn't add another dot
    expect(input.value).toBe('0.5');
    
    fireEvent.click(screen.getByText('C'));
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('0'));
    
    // Click button to switch to Egreso
    fireEvent.click(screen.getByRole('button', { name: /Egreso \(sale\)/i }));
    
    // Verify switched
    expect(screen.getByRole('button', { name: /Registrar egreso/i })).toBeDefined();
    
    // Click button to switch to Ingreso
    fireEvent.click(screen.getByRole('button', { name: /Ingreso \(entra\)/i }));
    
    expect(screen.getByRole('button', { name: /Registrar ingreso/i })).toBeDefined();

    // Save
    fireEvent.click(screen.getByRole('button', { name: /Registrar ingreso/i }));
    expect(onSave).toHaveBeenCalledWith({
      tipo: 'INGRESO',
      donde: 'Aumento de fondo', // default
      motivo: undefined,
      monto: 10
    });
  });

  it('closes properly', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(<MovimientoModal tipoInicial="EGRESO" onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onClose).toHaveBeenCalled();

    const closeBtns = screen.getAllByRole('button');
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
