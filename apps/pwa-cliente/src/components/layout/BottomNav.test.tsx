import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BottomNav } from './BottomNav';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/inicio' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { rol: string } | null }) => unknown) =>
    selector({ user: { rol: 'ADMIN' } }),
}));

// ADMIN puede acceder a todas las rutas → allowedItems.length > 5 → hasOverflow=true
vi.mock('../../auth/permisos', () => ({
  puedeAcceder: () => true,
}));

// Renderizar íconos como spans simples
vi.mock('../ui/icons', () => {
  const icon = (name: string) => ({ s }: { s: number }) =>
    <span data-testid={`icon-${name}`} data-size={s} aria-hidden="true" />;
  return {
    Icons: new Proxy({}, {
      get: (_target, prop: string) => icon(prop),
    }),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BottomNav', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renderiza la nav con aria-label', () => {
    render(<BottomNav />);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('renderiza los items primarios (4 cuando hay overflow)', () => {
    render(<BottomNav />);
    // Con ADMIN (todos los permisos) y 11 nav items hay overflow → primary = 4
    const buttons = screen.getAllByRole('button');
    // Al menos 4 botones primarios + 1 botón "Más"
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('botón "Más" está presente cuando hay overflow', () => {
    render(<BottomNav />);
    expect(screen.getByRole('button', { name: 'Más módulos' })).toBeInTheDocument();
  });

  it('"Más" comienza cerrado (aria-expanded=false)', () => {
    render(<BottomNav />);
    const moreBtn = screen.getByRole('button', { name: 'Más módulos' });
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('abre el panel "Más" al hacer clic', () => {
    render(<BottomNav />);
    const moreBtn = screen.getByRole('button', { name: 'Más módulos' });
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Más módulos' })).toBeInTheDocument();
  });

  it('cierra el panel "Más" al hacer segundo clic', () => {
    render(<BottomNav />);
    const moreBtn = screen.getByRole('button', { name: 'Más módulos' });
    fireEvent.click(moreBtn);
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('cierra el panel "Más" con Escape', () => {
    render(<BottomNav />);
    const moreBtn = screen.getByRole('button', { name: 'Más módulos' });
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('cierra el panel al hacer pointerdown fuera', () => {
    render(<BottomNav />);
    const moreBtn = screen.getByRole('button', { name: 'Más módulos' });
    fireEvent.click(moreBtn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Clic fuera del panel
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('navega a la ruta correcta al hacer clic en un item primario', () => {
    render(<BottomNav />);
    // El primer item con ADMIN es "inicio"
    const inicioBtn = screen.getByRole('button', { name: 'Inicio' });
    fireEvent.click(inicioBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/app/inicio');
  });

  it('navega desde el panel "Más"', () => {
    render(<BottomNav />);
    const moreBtn = screen.getByRole('button', { name: 'Más módulos' });
    fireEvent.click(moreBtn);
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBeGreaterThan(0);
    fireEvent.click(menuItems[0]);
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('marca aria-current="page" en el item activo', () => {
    render(<BottomNav />);
    // pathname es /app/inicio → activeKey = 'inicio'
    const inicioBtn = screen.getByRole('button', { name: 'Inicio' });
    expect(inicioBtn).toHaveAttribute('aria-current', 'page');
  });
});
