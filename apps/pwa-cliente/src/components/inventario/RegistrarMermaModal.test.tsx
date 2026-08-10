// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RegistrarMermaModal } from './RegistrarMermaModal';
import type { ProductoVM } from '../../types/inventario.types';

vi.mock('../ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

const producto: ProductoVM = {
  id: 'prod-1',
  categoriaId: 'cat-1',
  categoriaNombre: 'Bebidas',
  nombre: 'Cerveza',
  descripcion: null,
  precio: 8,
  precioLabel: 'S/ 8.00',
  disponible: true,
  stockActual: 10,
  stockLabel: '10',
  stockClass: 'badge-ok',
};

describe('RegistrarMermaModal', () => {
  it('el botón queda deshabilitado sin motivo', () => {
    render(<RegistrarMermaModal producto={producto} saving={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Registrar merma/i })).toBeDisabled();
  });

  it('habilita y envía cantidad + motivo válidos', () => {
    const onSave = vi.fn();
    render(<RegistrarMermaModal producto={producto} saving={false} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Cantidad perdida'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Botellas rotas al descargar' } });

    const btn = screen.getByRole('button', { name: /Registrar merma/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    expect(onSave).toHaveBeenCalledWith(3, 'Botellas rotas al descargar');
  });

  it('no deja mermar más de lo que hay en stock', () => {
    render(<RegistrarMermaModal producto={producto} saving={false} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Cantidad perdida'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se rompieron todas' } });

    expect(screen.getByText(/No puedes mermar más de lo que hay en stock/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrar merma/i })).toBeDisabled();
  });

  it('cierra con el scrim y el botón de cerrar', () => {
    const onClose = vi.fn();
    render(<RegistrarMermaModal producto={producto} saving={false} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
