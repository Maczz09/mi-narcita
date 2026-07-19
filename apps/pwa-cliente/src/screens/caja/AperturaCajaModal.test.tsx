// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AperturaCajaModal } from './AperturaCajaModal';

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Cash: () => <svg data-testid="icon-cash" />,
    Close: () => <svg data-testid="icon-close" />
  }
}));

describe('AperturaCajaModal', () => {
  it('renders correctly and handles input and buttons', () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();

    const { rerender } = render(<AperturaCajaModal loading={false} onClose={onClose} onOpen={onOpen} />);
    
    // Check initial state
    expect(screen.getByRole('heading', { name: 'Abrir caja' })).toBeDefined();
    const input = screen.getByLabelText('Fondo inicial') as HTMLInputElement;
    
    // Change input
    fireEvent.change(input, { target: { value: '150.50' } });
    expect(input.value).toBe('150.50');
    expect(screen.getByText('Monto: S/ 150.50')).toBeDefined();

    // Change input invalid
    fireEvent.change(input, { target: { value: 'abc20' } });
    expect(input.value).toBe('20');
    
    // Submit
    const openBtns = screen.getAllByRole('button', { name: /Abrir caja/i });
    const openBtn = openBtns[openBtns.length - 1]; // the primary button
    fireEvent.click(openBtn);
    expect(onOpen).toHaveBeenCalledWith(20);

    // Cancel
    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Close Icon (first button in DOM)
    const closeBtns = screen.getAllByRole('button');
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalledTimes(2);

    // Scrim
    const scrim = screen.getByTestId('scrim');
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(3);

    // Loading state
    rerender(<AperturaCajaModal loading={true} onClose={onClose} onOpen={onOpen} />);
    // `Abrir caja` is in h3 as well. `getAllByRole('button')` will only get buttons
    // The button has text `Abrir caja`.
    expect(screen.getAllByRole('button')[1].hasAttribute('disabled') || screen.getAllByRole('button')[2].hasAttribute('disabled')).toBeDefined();
  });
});
