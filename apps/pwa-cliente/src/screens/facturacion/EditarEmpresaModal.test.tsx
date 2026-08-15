// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditarEmpresaModal } from './EditarEmpresaModal';
import type { EmpresaDto } from '../../types/facturacion.types';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

const empresa: EmpresaDto = {
  id: 'e-1',
  slot: 1,
  ruc: '10417758432',
  razonSocial: 'Salitral 1 SAC',
  nombreComercial: null,
  direccion: null,
  ubigeo: null,
  codigoEstablecimiento: '0000',
  solUsuario: 'MODDATOS',
  activo: true,
};

describe('EditarEmpresaModal', () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onGuardar.mockResolvedValue(undefined);
  });

  it('precarga los campos con los datos actuales de la empresa, con el RUC como texto no editable', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByLabelText('Razón social')).toHaveValue('Salitral 1 SAC');
    expect(screen.getByLabelText('Usuario SOL')).toHaveValue('MODDATOS');
    expect(screen.getByText(/RUC 10417758432/)).toBeInTheDocument();
    expect(screen.queryByLabelText('RUC')).not.toBeInTheDocument();
  });

  it('guarda sin tocar Clave SOL ni certificado cuando se dejan en blanco', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith({
        razonSocial: 'Salitral 1 SAC',
        nombreComercial: '',
        direccion: '',
        solUsuario: 'MODDATOS',
      });
    });
  });

  it('omite ubigeo y solUsuario del payload cuando quedan en blanco (no los pisa con vacío)', async () => {
    const empresaSinExtras: EmpresaDto = { ...empresa, ubigeo: null, solUsuario: null };
    render(<EditarEmpresaModal empresa={empresaSinExtras} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(
        expect.not.objectContaining({ ubigeo: expect.anything(), solUsuario: expect.anything() }),
      );
    });
  });

  it('un ubigeo de menos de 6 dígitos deja el botón deshabilitado', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Ubigeo'), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('incluye solClave solo si se escribió algo', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Clave SOL nueva'), { target: { value: 'clave-nueva' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ solClave: 'clave-nueva' }));
    });
  });

  it('un certificado nuevo sin su contraseña deja el botón deshabilitado y no guarda', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    const archivo = new File(['contenido'], 'certificado.p12', { type: 'application/x-pkcs12' });
    fireEvent.change(screen.getByLabelText(/Nuevo certificado/), { target: { files: [archivo] } });

    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('un certificado nuevo con su contraseña se envía junto en el payload', async () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    const archivo = new File(['contenido'], 'certificado.p12', { type: 'application/x-pkcs12' });
    fireEvent.change(screen.getByLabelText(/Nuevo certificado/), { target: { files: [archivo] } });
    fireEvent.change(screen.getByLabelText('Contraseña del certificado nuevo'), { target: { value: 'clave-cert-nueva' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ certificado: archivo, certificadoPass: 'clave-cert-nueva' }),
      );
    });
  });

  it('una razón social vacía deja el botón deshabilitado', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'ab' } });
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('muestra el error que le pasan por props', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error="El certificado o su contraseña no son válidos" onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByText(/certificado o su contraseña no son válidos/)).toBeInTheDocument();
  });

  it('mientras guardando=true, el botón queda deshabilitado', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={true} error={null} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeDisabled();
  });

  it('el botón Cancelar, el de cerrar y el scrim llaman a onClose', () => {
    render(<EditarEmpresaModal empresa={empresa} guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // El scrim y el botón X del header comparten el mismo aria-label "Cerrar".
    const cerrarBtns = screen.getAllByRole('button', { name: 'Cerrar' });
    expect(cerrarBtns).toHaveLength(2);
    fireEvent.click(cerrarBtns[0]);
    fireEvent.click(cerrarBtns[1]);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
