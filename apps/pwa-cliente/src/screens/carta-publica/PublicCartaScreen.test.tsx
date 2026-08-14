// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicCartaScreen } from './PublicCartaScreen';
import { obtenerSedePublica, obtenerCartaPublica } from '../../api/cartaPublica.api';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ sedeId: 'sede-1' }),
}));

vi.mock('../../api/cartaPublica.api', () => ({
  obtenerSedePublica: vi.fn(),
  obtenerCartaPublica: vi.fn(),
}));

const SEDE = { id: 'sede-1', nombre: 'Salitral 1', direccion: 'Av. X 123', telefono: '987654321' };
const CATEGORIAS = [
  { id: 'cat-1', nombre: 'Ceviches', descripcion: 'El clásico de la casa.', area: 'COCINA' },
  { id: 'cat-2', nombre: 'Bebidas', descripcion: null, area: 'BARRA' },
];
const PRODUCTOS = [
  { id: 'p1', categoriaId: 'cat-1', nombre: 'Ceviche de Filete (Personal)', descripcion: null, precio: 30, disponible: true, stockActual: null },
  { id: 'p2', categoriaId: 'cat-1', nombre: 'Ceviche de Filete (Familiar)', descripcion: null, precio: 40, disponible: true, stockActual: null },
  { id: 'p3', categoriaId: 'cat-2', nombre: 'Chicha Morada', descripcion: null, precio: 8, disponible: true, stockActual: null },
];

describe('PublicCartaScreen', () => {
  beforeEach(() => {
    vi.mocked(obtenerSedePublica).mockResolvedValue(SEDE as any);
    vi.mocked(obtenerCartaPublica).mockResolvedValue({ categorias: CATEGORIAS, productos: PRODUCTOS } as any);
  });

  it('muestra la sede, categorías y el plato agrupado por tamaño', async () => {
    render(<PublicCartaScreen />);

    // La categoría activa por defecto es la primera (Ceviches) — se fija en
    // un efecto posterior al que trae los datos, así que se espera por el
    // plato (no por el nombre de la sede, que aparece un render antes).
    await waitFor(() => expect(screen.getByText('Ceviche de Filete')).toBeDefined());

    expect(screen.getByText('Salitral 1')).toBeDefined();
    expect(screen.getByText('Av. X 123')).toBeDefined();
    expect(screen.getByText('987654321')).toBeDefined();
    // "Ceviches" aparece dos veces (tab + título de categoría activa).
    expect(screen.getAllByText('Ceviches').length).toBeGreaterThan(0);
    expect(screen.getByText('Bebidas')).toBeDefined();
    expect(screen.getByText('S/ 30.00')).toBeDefined();
    expect(screen.getByText('S/ 40.00')).toBeDefined();
  });

  it('cambia de categoría al hacer clic en un tab', async () => {
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Ceviche de Filete')).toBeDefined());

    fireEvent.click(screen.getByText('Bebidas'));

    await waitFor(() => expect(screen.getByText('Chicha Morada')).toBeDefined());
    expect(screen.queryByText('Ceviche de Filete')).toBeNull();
  });

  it('muestra un estado de error si falla la carga', async () => {
    vi.mocked(obtenerCartaPublica).mockRejectedValue(new Error('network'));
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText(/No se pudo cargar la carta/)).toBeDefined());
  });

  it('muestra un mensaje si la sede no existe o está desactivada', async () => {
    vi.mocked(obtenerSedePublica).mockResolvedValue(null);
    render(<PublicCartaScreen />);
    await waitFor(() => expect(screen.getByText('Esta carta ya no está disponible.')).toBeDefined());
  });
});
