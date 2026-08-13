// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MermasHistorialDrawer } from './MermasHistorialDrawer';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';
import { useToast } from '../ui/ToastProvider';

vi.mock('../../hooks/queries/useMermasQuery');
vi.mock('../ui/ToastProvider', () => ({ useToast: vi.fn() }));
vi.mock('../ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

const mermaBase = {
  id: 'm1', productoId: 'p1', productoNombre: 'Cerveza', cantidad: 3, motivo: 'Botellas rotas',
  observacion: null, origen: 'DESCARTE_MANUAL_INVENTARIO', origenLabel: 'Descarte manual',
  costoUnitario: 8.5, costoTotal: 25.5, costoTotalLabel: 'S/ 25.50',
  usuarioNombre: 'Ana', fechaLabel: '9/8/26, 14:00',
};

describe('MermasHistorialDrawer', () => {
  const actualizarMerma = vi.fn();
  const eliminarMerma = vi.fn();
  const toast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue({ toast });
    (useMermasQuery as any).mockReturnValue({
      mermas: [], loading: false, saving: false, actualizarMerma, eliminarMerma,
    });
  });

  it('muestra el estado vacío cuando no hay mermas', () => {
    render(<MermasHistorialDrawer onClose={vi.fn()} />);
    expect(screen.getByText('Sin mermas registradas')).toBeInTheDocument();
  });

  it('lista las mermas con motivo, cantidad, origen y quién la reportó', () => {
    (useMermasQuery as any).mockReturnValue({
      mermas: [mermaBase], loading: false, saving: false, actualizarMerma, eliminarMerma,
    });

    render(<MermasHistorialDrawer onClose={vi.fn()} />);

    // "Cerveza" aparece también en el KPI "Mayor pérdida" cuando es la única merma.
    expect(screen.getAllByText('Cerveza').length).toBeGreaterThan(0);
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('Botellas rotas')).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    // "Descarte manual" también existe como opción del filtro de origen; "S/
    // 25.50" también aparece en el KPI "Total mermado" (única merma).
    expect(screen.getAllByText('Descarte manual').length).toBeGreaterThan(0);
    expect(screen.getAllByText('S/ 25.50').length).toBeGreaterThan(0);
  });

  it('cierra con el botón de cerrar y el scrim', () => {
    const onClose = vi.fn();
    render(<MermasHistorialDrawer onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('muestra los KPIs de pérdida total y mayor pérdida', () => {
    (useMermasQuery as any).mockReturnValue({
      mermas: [
        mermaBase,
        { ...mermaBase, id: 'm2', productoNombre: 'Pisco', costoTotal: 50, costoTotalLabel: 'S/ 50.00' },
      ],
      loading: false, saving: false, actualizarMerma, eliminarMerma,
    });

    render(<MermasHistorialDrawer onClose={vi.fn()} />);

    expect(screen.getByText('Total mermado')).toBeInTheDocument();
    expect(screen.getByText('S/ 75.50')).toBeInTheDocument();
    expect(screen.getByText('Mayor pérdida')).toBeInTheDocument();
    // "Pisco" aparece en el KPI y en su fila de la lista.
    expect(screen.getAllByText('Pisco').length).toBeGreaterThan(0);
  });

  it('CU-04 Update: edita una merma (cantidad/motivo/observación)', async () => {
    actualizarMerma.mockResolvedValue({});
    (useMermasQuery as any).mockReturnValue({
      mermas: [mermaBase], loading: false, saving: false, actualizarMerma, eliminarMerma,
    });

    render(<MermasHistorialDrawer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar merma de Cerveza' }));

    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => expect(actualizarMerma).toHaveBeenCalledWith('m1', { cantidad: 5, motivo: 'Botellas rotas', observacion: null }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Merma actualizada' })));
  });

  it('CU-04 Delete: elimina una merma con justificación y restaura stock', async () => {
    eliminarMerma.mockResolvedValue(undefined);
    (useMermasQuery as any).mockReturnValue({
      mermas: [mermaBase], loading: false, saving: false, actualizarMerma, eliminarMerma,
    });

    render(<MermasHistorialDrawer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar merma de Cerveza' }));

    // Sin justificación, el botón de confirmar sigue deshabilitado.
    expect(screen.getByRole('button', { name: /Eliminar y restaurar stock/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Justificación (obligatoria)'), { target: { value: 'Se registró por error' } });
    fireEvent.click(screen.getByRole('button', { name: /Eliminar y restaurar stock/ }));

    await waitFor(() => expect(eliminarMerma).toHaveBeenCalledWith('m1', 'Se registró por error'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Merma eliminada' })));
  });

  it('filtra por origen', () => {
    render(<MermasHistorialDrawer onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Filtrar por origen'), { target: { value: 'ANULACION_COMANDA_COBRADA' } });
    expect(useMermasQuery).toHaveBeenLastCalledWith({ limit: 100, origen: 'ANULACION_COMANDA_COBRADA' });
  });
});
