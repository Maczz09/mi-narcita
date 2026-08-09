// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BoletaInterna } from './BoletaInterna';
import type { TicketDto, TransaccionDto } from '../../types/cuenta.types';

const ticket: TicketDto = {
  id: 'ticket-0123456789',
  cuentaId: 'cuenta1',
  mesaId: 'mesa1',
  items: [
    { productoId: 'p1', nombre: 'Ceviche Clásico', cantidad: 1, precioUnitario: 35 },
    { productoId: 'p2', nombre: 'Inca Kola', cantidad: 2, precioUnitario: 8 },
  ],
  subtotal: 51,
  descuento: 5,
  total: 46,
  fecha: '2026-08-08T20:15:00.000Z',
};

const transaccion: TransaccionDto = {
  id: 'tx1',
  cuentaId: 'cuenta1',
  monto: 46,
  metodo: 'EFECTIVO',
  cajeroNombre: 'Ana Torres',
  createdAt: '2026-08-08T20:15:00.000Z',
};

describe('BoletaInterna', () => {
  it('muestra el encabezado del local y el disclaimer de "no es SUNAT"', () => {
    render(<BoletaInterna ticket={ticket} transaccion={transaccion} mesaNumero="5" propina={0} onImprimir={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('NACHOPPS')).toBeInTheDocument();
    expect(screen.getByText(/no es un comprobante de pago electrónico SUNAT/i)).toBeInTheDocument();
    expect(screen.getByText('Mesa 5')).toBeInTheDocument();
  });

  it('lista cada ítem con cantidad y subtotal', () => {
    render(<BoletaInterna ticket={ticket} transaccion={transaccion} propina={0} onImprimir={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('1x Ceviche Clásico')).toBeInTheDocument();
    expect(screen.getByText('2x Inca Kola')).toBeInTheDocument();
    expect(screen.getByText('S/ 16.00')).toBeInTheDocument(); // 2 * 8
  });

  it('desglosa subtotal, descuento, IGV y total (incluye propina)', () => {
    render(<BoletaInterna ticket={ticket} transaccion={transaccion} propina={3} onImprimir={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('S/ 51.00')).toBeInTheDocument(); // subtotal
    expect(screen.getByText('-S/ 5.00')).toBeInTheDocument(); // descuento
    expect(screen.getByText('S/ 3.00')).toBeInTheDocument(); // propina
    // total = ticket.total (46) + propina (3) = 49
    expect(screen.getByText('S/ 49.00')).toBeInTheDocument();
  });

  it('no muestra la fila de descuento cuando es cero', () => {
    render(<BoletaInterna ticket={{ ...ticket, descuento: 0 }} transaccion={transaccion} propina={0} onImprimir={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.queryByText(/^-S\//)).not.toBeInTheDocument();
  });

  it('muestra el nombre del cajero cuando viene en la transacción', () => {
    render(<BoletaInterna ticket={ticket} transaccion={transaccion} propina={0} onImprimir={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
  });

  it('llama a onImprimir y onCerrar', () => {
    const onImprimir = vi.fn();
    const onCerrar = vi.fn();
    render(<BoletaInterna ticket={ticket} transaccion={transaccion} propina={0} onImprimir={onImprimir} onCerrar={onCerrar} />);

    fireEvent.click(screen.getByRole('button', { name: /Imprimir boleta/i }));
    expect(onImprimir).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onCerrar).toHaveBeenCalled();
  });
});
