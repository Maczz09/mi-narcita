// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurarEmpresaModal } from './ConfigurarEmpresaModal';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

function llenarFormularioValido() {
  fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '10417758432' } });
  fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'Salitral 1 SAC' } });
  fireEvent.change(screen.getByLabelText('Usuario SOL'), { target: { value: 'MODDATOS' } });
  fireEvent.change(screen.getByLabelText('Clave SOL'), { target: { value: 'clave-sol' } });
  fireEvent.change(screen.getByLabelText('Contraseña del certificado'), { target: { value: 'clave-cert' } });
  const archivo = new File(['contenido'], 'certificado.p12', { type: 'application/x-pkcs12' });
  fireEvent.change(screen.getByLabelText(/Archivo del certificado/), { target: { files: [archivo] } });
  return archivo;
}

describe('ConfigurarEmpresaModal', () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onGuardar.mockResolvedValue(undefined);
  });

  it('el botón de guardar arranca deshabilitado (formulario vacío)', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).toBeDisabled();
  });

  it('con todos los campos requeridos completos, habilita guardar y no exige los opcionales', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).not.toBeDisabled();
  });

  it('un RUC de menos de 11 dígitos deja el botón deshabilitado', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).toBeDisabled();
  });

  it('el campo RUC descarta caracteres no numéricos', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('RUC'), { target: { value: '10abc417758432xyz' } });
    expect(screen.getByLabelText('RUC')).toHaveValue('10417758432');
  });

  it('envía el multipart completo (incluido el archivo) al guardar', async () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    const archivo = llenarFormularioValido();

    fireEvent.click(screen.getByRole('button', { name: /Guardar y activar/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith({
        ruc: '10417758432',
        razonSocial: 'Salitral 1 SAC',
        nombreComercial: undefined,
        direccion: undefined,
        ubigeo: undefined,
        solUsuario: 'MODDATOS',
        solClave: 'clave-sol',
        certificadoPass: 'clave-cert',
        certificado: archivo,
      });
    });
  });

  it('recorta espacios de razón social / usuario SOL antes de enviar', async () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: '  Salitral 1 SAC  ' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar y activar/i }));

    await waitFor(() => {
      expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ razonSocial: 'Salitral 1 SAC' }));
    });
  });

  it('muestra el error que le pasan por props (p. ej. "RUC ya existe" del backend)', () => {
    render(<ConfigurarEmpresaModal guardando={false} error="Ya existe una empresa configurada con el RUC 10417758432" onGuardar={onGuardar} onClose={onClose} />);
    expect(screen.getByText(/Ya existe una empresa configurada/)).toBeInTheDocument();
  });

  it('mientras guardando=true, el botón muestra el spinner y queda deshabilitado', () => {
    render(<ConfigurarEmpresaModal guardando={true} error={null} onGuardar={onGuardar} onClose={onClose} />);
    llenarFormularioValido();
    expect(screen.getByRole('button', { name: /Guardar y activar/i })).toBeDisabled();
  });

  it('el botón Cancelar llama a onClose', () => {
    render(<ConfigurarEmpresaModal guardando={false} error={null} onGuardar={onGuardar} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
