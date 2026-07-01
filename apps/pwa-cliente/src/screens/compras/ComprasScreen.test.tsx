// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComprasScreen } from './ComprasScreen';

const mockToast = vi.fn();
vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: () => ({ toast: mockToast })
}));

vi.mock('../../utils/format', () => ({
  fmt: (v: number) => `S/ ${v.toFixed(2)}`
}));

vi.mock('../../data/compras.mock', () => ({
  buildOC: vi.fn(() => [
    {
      id: 'OC-123',
      prov: 'Proveedor A',
      estado: 'BORRADOR',
      fecha: 'Hoy',
      entrega: '—',
      items: [{ n: 'Insumo 1', q: 10, uni: 'kg', costo: 5 }]
    },
    {
      id: 'OC-456',
      prov: 'Proveedor B',
      estado: 'ENVIADA',
      fecha: 'Ayer',
      entrega: 'Mañana',
      items: [{ n: 'Insumo 2', q: 5, uni: 'L', costo: 10 }]
    },
    {
      id: 'OC-789',
      prov: 'Proveedor C',
      estado: 'PARCIAL',
      fecha: 'Ayer',
      entrega: 'Hoy',
      items: [{ n: 'Insumo 3', q: 5, uni: 'und', costo: 2 }]
    },
    {
      id: 'OC-000',
      prov: 'Proveedor D',
      estado: 'RECIBIDA',
      fecha: 'Hace 2 días',
      entrega: 'Ayer',
      items: [{ n: 'Insumo 4', q: 2, uni: 'und', costo: 50 }]
    }
  ]),
  INSUMOS: [
    { id: 'I1', n: 'Insumo 1', prov: 'Proveedor A', stock: 5, min: 10, uni: 'kg', costo: 5 },
    { id: 'I2', n: 'Insumo 2', prov: 'Proveedor B', stock: 20, min: 5, uni: 'L', costo: 10 }
  ],
  PROVEEDORES_COMPRAS: [
    { id: 'P1', n: 'Proveedor A', cat: 'Abarrotes', ruc: '123456789', contacto: 'Juan', tel: '999', dias: 'L a V', credito: '30 días' },
    { id: 'P2', n: 'Proveedor Sin Insumos', cat: 'Otros', ruc: '987', contacto: 'Pedro', tel: '777', dias: 'N/A', credito: 'Contado' }
  ]
}));

describe('ComprasScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
      configurable: true
    });
  });

  it('renders title and sub', () => {
    render(<ComprasScreen />);
    expect(screen.getByText('Compras y Proveedores')).toBeInTheDocument();
  });

  it('handles tabs: ordenes, insumos, proveedores', () => {
    render(<ComprasScreen />);
    expect(screen.getByText('OC-123')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Insumos'));
    expect(screen.getByText('Insumo 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Proveedores'));
    expect(screen.getByText('Proveedor A')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Órdenes de compra'));
    expect(screen.getByText('OC-123')).toBeInTheDocument();
  });

  it('can send a BORRADOR OC', () => {
    render(<ComprasScreen />);
    const row = screen.getByText('OC-123').closest('tr');
    const sendBtn = within(row!).getByText('Enviar');
    fireEvent.click(sendBtn);
    expect(within(row!).queryByText('Enviar')).not.toBeInTheDocument();
  });

  it('can receive an ENVIADA or PARCIAL OC and close the drawer', () => {
    render(<ComprasScreen />);
    const row = screen.getByText('OC-456').closest('tr');
    const receiveBtn = within(row!).getByText('Recepcionar');
    fireEvent.click(receiveBtn);

    expect(screen.getByText('Recepción · OC-456')).toBeInTheDocument();

    // Uncheck and check item
    const tickBtn = screen.getByText('Insumo 2').closest('button');
    fireEvent.click(tickBtn!);
    fireEvent.click(tickBtn!);

    // Confirm
    fireEvent.click(screen.getByText('Confirmar recepción'));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mercadería recibida' }));
  });
  
  it('can close the Recepcion drawer without confirming', () => {
    const { container } = render(<ComprasScreen />);
    const row = screen.getByText('OC-456').closest('tr');
    fireEvent.click(within(row!).getByText('Recepcionar'));
    
    const closeBtn = container.querySelector('.drawer .icon-btn');
    fireEvent.click(closeBtn!);
    expect(screen.queryByText('Recepción · OC-456')).not.toBeInTheDocument();
  });

  it('can create a new OC', () => {
    const { container } = render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));

    const combobox = screen.getByLabelText('Proveedor');
    fireEvent.change(combobox, { target: { value: 'Proveedor A' } });

    const plusBtns = container.querySelectorAll('.drawer .stepper button');
    fireEvent.click(plusBtns[1]);

    fireEvent.click(screen.getByText('Crear borrador'));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'OC creada' }));
  });

  it('can close the new OC drawer', () => {
    const { container } = render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));
    const closeBtn = container.querySelector('.drawer .icon-btn');
    fireEvent.click(closeBtn!);
    expect(screen.queryByText('Nueva orden de compra')).not.toBeInTheDocument();
  });

  it('handles provider without insumos when creating OC', () => {
    render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));
    const combobox = screen.getByLabelText('Proveedor');
    fireEvent.change(combobox, { target: { value: 'Proveedor Sin Insumos' } });
    expect(screen.getByText('Sin insumos asociados a este proveedor.')).toBeInTheDocument();
  });

  it('handles minus button when quantity is 0', () => {
    const { container } = render(<ComprasScreen />);
    fireEvent.click(screen.getByText('Nueva orden'));
    const combobox = screen.getByLabelText('Proveedor');
    fireEvent.change(combobox, { target: { value: 'Proveedor A' } });
    
    const minusBtns = container.querySelectorAll('.drawer .stepper button');
    fireEvent.click(minusBtns[0]); // 0 - 1 = 0
    expect(screen.getByText('Total · 0 líneas')).toBeInTheDocument();
  });
});

