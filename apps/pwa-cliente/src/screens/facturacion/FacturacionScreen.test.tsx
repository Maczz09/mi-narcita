// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FacturacionScreen } from './FacturacionScreen';
import { useFacturacionQuery } from '../../hooks/queries/useFacturacionQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import { abrirComprobanteParaImprimir } from '../../utils/comprobantePrint';

vi.mock('../../hooks/queries/useFacturacionQuery', () => ({
  useFacturacionQuery: vi.fn(),
}));

vi.mock('../../utils/comprobantePrint', () => ({
  abrirComprobanteParaImprimir: vi.fn(),
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn(),
}));

const empresa = { id: 'e1', slot: 1, ruc: '10417758432', razonSocial: 'QUISPE MORALES YUSLUNY YANET', activo: true };

const disponible = {
  id: 'cp1', cuentaId: 'c1', sedeId: 's1', mesaId: 'm1', total: '15.00',
  items: [], meseroNombre: 'Pepe', estado: 'DISPONIBLE', fecha: '2026-08-12T10:00:00.000Z',
};

const emitido = {
  id: 'cp2', cuentaId: 'c2', sedeId: 's1', mesaId: 'm1', total: '30.00',
  items: [], meseroNombre: 'Ana', estado: 'EMITIDO', fecha: '2026-08-12T09:00:00.000Z',
  comprobante: {
    id: 'cb1', tipo: 'BOLETA', serie: 'B001', correlativo: 5, clienteRuc: null, clienteDni: null,
    clienteRazonSocial: null, clienteNombre: null, subtotal: '25.42', igv: '4.58', total: '30.00',
    estado: 'ACEPTADO', motivoRechazo: null, createdAt: '2026-08-12T09:01:00.000Z',
    empresa: { ruc: '10417758432', razonSocial: 'QUISPE MORALES YUSLUNY YANET', nombreComercial: null, direccion: null },
  },
};

const emitidoFactura = {
  id: 'cp3', cuentaId: 'c3', sedeId: 's1', mesaId: 'm1', total: '100.00',
  items: [], meseroNombre: 'Ana', estado: 'EMITIDO', fecha: '2026-07-01T09:00:00.000Z',
  comprobante: {
    id: 'cb2', tipo: 'FACTURA', serie: 'F001', correlativo: 2, clienteRuc: '20123456789', clienteDni: null,
    clienteRazonSocial: 'CLIENTE SAC', clienteNombre: null, subtotal: '84.75', igv: '15.25', total: '100.00',
    estado: 'RECHAZADO', motivoRechazo: 'RUC no habido', createdAt: '2026-07-01T09:01:00.000Z',
    empresa: { ruc: '10417758432', razonSocial: 'QUISPE MORALES YUSLUNY YANET', nombreComercial: null, direccion: null },
  },
};

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    disponibles: [disponible],
    emitidos: [emitido, emitidoFactura],
    empresas: [empresa],
    loading: false,
    emitiendo: false,
    error: null,
    success: null,
    fetch: vi.fn(),
    emitirComprobante: vi.fn().mockResolvedValue(undefined),
    clearFeedback: vi.fn(),
    ...overrides,
  };
}

describe('FacturacionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFacturacionQuery).mockReturnValue(baseMock() as any);
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
  });

  it('renderiza el encabezado y los KPIs', () => {
    render(<FacturacionScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Facturación' })).toBeInTheDocument();
    expect(screen.getByText('Disponibles')).toBeInTheDocument();
  });

  it('lista los comprobantes de pago disponibles', () => {
    render(<FacturacionScreen />);
    expect(screen.getByText('Pepe')).toBeInTheDocument();
    expect(screen.getByText('S/ 15.00')).toBeInTheDocument();
  });

  it('lista los emitidos con su estado SUNAT', () => {
    render(<FacturacionScreen />);
    expect(screen.getByText('B B001-5')).toBeInTheDocument();
    expect(screen.getByText('Aceptado por SUNAT')).toBeInTheDocument();
    expect(screen.getByText('F F001-2')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
  });

  describe('imprimir comprobantes emitidos', () => {
    it('solo el comprobante ACEPTADO tiene botón de imprimir', () => {
      render(<FacturacionScreen />);
      expect(screen.getAllByRole('button', { name: 'Imprimir comprobante' })).toHaveLength(1);
    });

    it('imprimir abre la pestaña dedicada con el comprobante y sus ítems', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Imprimir comprobante' }));
      expect(abrirComprobanteParaImprimir).toHaveBeenCalledWith({
        comprobante: emitido.comprobante,
        items: [],
      });
    });
  });

  describe('filtros de emitidos', () => {
    it('el chip Boletas oculta las facturas', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Boletas' }));
      expect(screen.getByText('B B001-5')).toBeInTheDocument();
      expect(screen.queryByText('F F001-2')).not.toBeInTheDocument();
    });

    it('el chip Aceptados oculta los rechazados', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Aceptados' }));
      expect(screen.getByText('B B001-5')).toBeInTheDocument();
      expect(screen.queryByText('F F001-2')).not.toBeInTheDocument();
    });

    it('el filtro de fecha "Desde" excluye emitidos anteriores', () => {
      render(<FacturacionScreen />);
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } });
      expect(screen.getByText('B B001-5')).toBeInTheDocument();
      expect(screen.queryByText('F F001-2')).not.toBeInTheDocument();
    });

    it('"Limpiar filtros" solo aparece con algún filtro activo y los resetea', () => {
      render(<FacturacionScreen />);
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Boletas' }));
      expect(screen.queryByText('F F001-2')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
      expect(screen.getByText('F F001-2')).toBeInTheDocument();
    });
  });

  it('muestra el estado vacío cuando no hay disponibles', () => {
    vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ disponibles: [] }) as any);
    render(<FacturacionScreen />);
    expect(screen.getByText('Sin comprobantes pendientes')).toBeInTheDocument();
  });

  it('avisa cuando no hay empresa configurada y deshabilita emitir', () => {
    vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ empresas: [] }) as any);
    render(<FacturacionScreen />);
    expect(screen.getByText(/No hay ninguna empresa con certificado SUNAT configurado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir' })).toBeDisabled();
  });

  describe('emitir un comprobante', () => {
    it('abre el modal, elige boleta por defecto y emite con los datos de la empresa única', async () => {
      const emitirComprobante = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirComprobante }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      expect(screen.getByText(/Emisor: QUISPE MORALES YUSLUNY YANET/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Emitir boleta' }));

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('c1', {
          tipoComprobante: 'BOLETA',
          empresaRuc: '10417758432',
          clienteRuc: undefined,
          clienteRazonSocial: undefined,
          clienteDni: undefined,
          clienteNombre: undefined,
        });
      });
    });

    it('factura sin RUC del cliente deja el botón deshabilitado', () => {
      render(<FacturacionScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Factura' }));
      expect(screen.getByRole('button', { name: 'Emitir factura' })).toBeDisabled();
    });

    it('factura con RUC válido emite con los datos del cliente', async () => {
      const emitirComprobante = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useFacturacionQuery).mockReturnValue(baseMock({ emitirComprobante }) as any);
      render(<FacturacionScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Emitir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Factura' }));
      fireEvent.change(screen.getByLabelText('RUC del cliente'), { target: { value: '20123456789' } });
      fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'CLIENTE SAC' } });
      fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }));

      await waitFor(() => {
        expect(emitirComprobante).toHaveBeenCalledWith('c1', {
          tipoComprobante: 'FACTURA',
          empresaRuc: '10417758432',
          clienteRuc: '20123456789',
          clienteRazonSocial: 'CLIENTE SAC',
          clienteDni: undefined,
          clienteNombre: undefined,
        });
      });
    });
  });
});
