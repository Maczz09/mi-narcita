// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UbicacionesModal } from './UbicacionesModal';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useUbicacionesQuery } from '../../hooks/queries/useUbicacionesQuery';

vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../hooks/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));
vi.mock('../../hooks/queries/useUbicacionesQuery');
vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

describe('UbicacionesModal', () => {
  const baseHook = {
    ubicaciones: [{ id: 'u1', nombre: 'Salón Principal' }, { id: 'u2', nombre: 'Terraza' }],
    loading: false, saving: false, error: null, success: null,
    crearUbicacion: vi.fn().mockResolvedValue(true),
    actualizarUbicacion: vi.fn().mockResolvedValue(true),
    eliminarUbicacion: vi.fn().mockResolvedValue(true),
    clearFeedback: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useOnlineStatus as any).mockReturnValue(true);
    (useUbicacionesQuery as any).mockReturnValue({ ...baseHook });
  });

  it('lista las ubicaciones existentes', () => {
    render(<UbicacionesModal onClose={vi.fn()} />);
    expect(screen.getByText('Salón Principal')).toBeInTheDocument();
    expect(screen.getByText('Terraza')).toBeInTheDocument();
  });

  it('crea una ubicación nueva', async () => {
    const crearUbicacion = vi.fn().mockResolvedValue(true);
    (useUbicacionesQuery as any).mockReturnValue({ ...baseHook, crearUbicacion });

    render(<UbicacionesModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nombre de la nueva ubicación'), { target: { value: 'Azotea' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar/i }));

    await waitFor(() => expect(crearUbicacion).toHaveBeenCalledWith({ nombre: 'Azotea' }));
  });

  it('renombra una ubicación existente (edición inline)', async () => {
    const actualizarUbicacion = vi.fn().mockResolvedValue(true);
    (useUbicacionesQuery as any).mockReturnValue({ ...baseHook, actualizarUbicacion });

    render(<UbicacionesModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Terraza' }));
    const input = screen.getByDisplayValue('Terraza');
    fireEvent.change(input, { target: { value: 'Terraza VIP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(actualizarUbicacion).toHaveBeenCalledWith('u2', { nombre: 'Terraza VIP' }));
  });

  it('cancela la edición sin guardar', () => {
    render(<UbicacionesModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Terraza' }));
    expect(screen.getByDisplayValue('Terraza')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByDisplayValue('Terraza')).not.toBeInTheDocument();
  });

  it('elimina una ubicación tras confirmar', async () => {
    const eliminarUbicacion = vi.fn().mockResolvedValue(true);
    (useUbicacionesQuery as any).mockReturnValue({ ...baseHook, eliminarUbicacion });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<UbicacionesModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Terraza' }));

    await waitFor(() => expect(eliminarUbicacion).toHaveBeenCalledWith('u2'));
  });

  it('no elimina si se cancela la confirmación', () => {
    const eliminarUbicacion = vi.fn();
    (useUbicacionesQuery as any).mockReturnValue({ ...baseHook, eliminarUbicacion });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<UbicacionesModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Terraza' }));

    expect(eliminarUbicacion).not.toHaveBeenCalled();
  });

  it('muestra el error del backend (ej. 409 por mesas asociadas)', () => {
    (useUbicacionesQuery as any).mockReturnValue({
      ...baseHook, error: 'No se puede eliminar: tiene 3 mesa(s) asociada(s). Reasígnalas a otra ubicación primero.',
    });
    render(<UbicacionesModal onClose={vi.fn()} />);
    expect(screen.getByText(/No se puede eliminar/)).toBeInTheDocument();
  });

  it('deshabilita las mutaciones sin conexión', () => {
    (useOnlineStatus as any).mockReturnValue(false);
    render(<UbicacionesModal onClose={vi.fn()} />);
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Terraza' })).toBeDisabled();
  });

  it('cierra con el botón de cerrar y con el scrim', () => {
    const onClose = vi.fn();
    render(<UbicacionesModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar gestión de ubicaciones' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('muestra estado vacío cuando no hay ubicaciones', () => {
    (useUbicacionesQuery as any).mockReturnValue({ ...baseHook, ubicaciones: [] });
    render(<UbicacionesModal onClose={vi.fn()} />);
    expect(screen.getByText(/Sin ubicaciones todavía/)).toBeInTheDocument();
  });
});
