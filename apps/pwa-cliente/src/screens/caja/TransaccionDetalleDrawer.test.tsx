// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransaccionDetalleDrawer } from './TransaccionDetalleDrawer';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useTransaccionDetalleQuery } from '../../hooks/queries/useTransaccionDetalleQuery';

vi.mock('../../hooks/useOnlineStatus');
vi.mock('../../hooks/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));
vi.mock('../../hooks/queries/useTransaccionDetalleQuery');
vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose} />,
}));

const transaccionBase = {
  id: 'tx-1234567',
  cuentaId: 'c-1',
  monto: 45,
  descuento: 5,
  metodo: 'EFECTIVO',
  referencia: null,
  notas: null,
  usuarioId: 'u-1',
  cajeroNombre: 'Rosa',
  createdAt: new Date().toISOString(),
};

const cuentaBase = {
  id: 'c-1',
  pedidos: [{ id: 'p1', items: [{ id: 'i1', nombre: 'Ceviche', cantidad: 1, subtotal: 35 }] }],
};

describe('TransaccionDetalleDrawer', () => {
  const baseHook = {
    transaccion: transaccionBase,
    cuenta: cuentaBase,
    loading: false,
    saving: false,
    error: null,
    success: null,
    actualizar: vi.fn().mockResolvedValue(true),
    clearFeedback: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useOnlineStatus as any).mockReturnValue(true);
    (useTransaccionDetalleQuery as any).mockReturnValue({ ...baseHook });
  });

  it('muestra los ítems, el cajero y el total del cobro', () => {
    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={vi.fn()} />);
    expect(screen.getByText(/Ceviche/)).toBeInTheDocument();
    expect(screen.getByText(/Rosa/)).toBeInTheDocument();
    expect(screen.getByText(/45\.00|S\/\s*45/)).toBeInTheDocument();
  });

  it('el botón Guardar está deshabilitado sin cambios', () => {
    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('corrige el método de pago y guarda', async () => {
    const actualizar = vi.fn().mockResolvedValue(true);
    (useTransaccionDetalleQuery as any).mockReturnValue({ ...baseHook, actualizar });

    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Tarjeta/i }));
    const guardar = screen.getByRole('button', { name: /Guardar cambios/i });
    expect(guardar).not.toBeDisabled();
    fireEvent.click(guardar);

    await waitFor(() => expect(actualizar).toHaveBeenCalledWith({ metodo: 'TARJETA', notas: '' }));
  });

  it('edita las notas y guarda', async () => {
    const actualizar = vi.fn().mockResolvedValue(true);
    (useTransaccionDetalleQuery as any).mockReturnValue({ ...baseHook, actualizar });

    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'Cliente pidió factura' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => expect(actualizar).toHaveBeenCalledWith({ metodo: 'EFECTIVO', notas: 'Cliente pidió factura' }));
  });

  it('deshabilita edición sin conexión', () => {
    (useOnlineStatus as any).mockReturnValue(false);
    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={vi.fn()} />);
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tarjeta/i })).toBeDisabled();
  });

  it('muestra el estado de carga', () => {
    (useTransaccionDetalleQuery as any).mockReturnValue({ ...baseHook, transaccion: null, loading: true });
    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={vi.fn()} />);
    expect(screen.getByText(/Cargando cobro/)).toBeInTheDocument();
  });

  it('cierra con el botón de cerrar y con el scrim', () => {
    const onClose = vi.fn();
    render(<TransaccionDetalleDrawer transaccionId="tx-1234567" cuentaId="c-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle del cobro' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
