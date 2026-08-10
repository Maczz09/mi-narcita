// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MermasHistorialDrawer } from './MermasHistorialDrawer';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';

vi.mock('../../hooks/queries/useMermasQuery');
vi.mock('../ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

describe('MermasHistorialDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el estado vacío cuando no hay mermas', () => {
    vi.mocked(useMermasQuery).mockReturnValue({ mermas: [], loading: false } as any);
    render(<MermasHistorialDrawer onClose={vi.fn()} />);
    expect(screen.getByText('Sin mermas registradas')).toBeInTheDocument();
  });

  it('lista las mermas con motivo, cantidad y quién la reportó', () => {
    vi.mocked(useMermasQuery).mockReturnValue({
      mermas: [
        { id: 'm1', productoId: 'p1', productoNombre: 'Cerveza', cantidad: 3, motivo: 'Botellas rotas', usuarioNombre: 'Ana', fechaLabel: '9/8/26, 14:00' },
      ],
      loading: false,
    } as any);

    render(<MermasHistorialDrawer onClose={vi.fn()} />);

    expect(screen.getByText('Cerveza')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('Botellas rotas')).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });

  it('cierra con el botón de cerrar y el scrim', () => {
    vi.mocked(useMermasQuery).mockReturnValue({ mermas: [], loading: false } as any);
    const onClose = vi.fn();
    render(<MermasHistorialDrawer onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
