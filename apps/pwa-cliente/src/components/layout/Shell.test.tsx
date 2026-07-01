import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Shell } from './Shell';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Shell imports Sidebar, Header and BottomNav — mock them all to avoid cascading deps
vi.mock('./Sidebar', () => ({
  Sidebar: () => <nav data-testid="sidebar">Sidebar</nav>,
}));

vi.mock('./Header', () => ({
  Header: () => <header data-testid="header">Header</header>,
}));

vi.mock('./BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav">BottomNav</div>,
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Shell', () => {
  it('renderiza el contenedor principal .app', () => {
    render(<Shell>Contenido</Shell>);
    expect(document.querySelector('.app')).toBeInTheDocument();
  });

  it('renderiza el skip link de accesibilidad', () => {
    render(<Shell>Contenido</Shell>);
    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#contenido');
  });

  it('renderiza Sidebar', () => {
    render(<Shell>Contenido</Shell>);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renderiza Header', () => {
    render(<Shell>Contenido</Shell>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('renderiza BottomNav', () => {
    render(<Shell>Contenido</Shell>);
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
  });

  it('renderiza los children en el main', () => {
    render(<Shell><p>Contenido de prueba</p></Shell>);
    expect(screen.getByText('Contenido de prueba')).toBeInTheDocument();
  });

  it('el main tiene id="contenido" para el skip link', () => {
    render(<Shell>Contenido</Shell>);
    expect(document.getElementById('contenido')).toBeInTheDocument();
  });

  it('el main tiene tabIndex=-1 para recibir foco via skip link', () => {
    render(<Shell>Contenido</Shell>);
    const main = document.getElementById('contenido');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('sin hasSidePanel, el main tiene clase "content"', () => {
    render(<Shell>Contenido</Shell>);
    const main = document.getElementById('contenido');
    expect(main).toHaveClass('content');
    expect(main).not.toHaveClass('has-form');
  });

  it('con hasSidePanel=true, el main añade clase "has-form"', () => {
    render(<Shell hasSidePanel>Contenido</Shell>);
    const main = document.getElementById('contenido');
    expect(main).toHaveClass('content');
    expect(main).toHaveClass('has-form');
  });

  it('NO muestra el banner offline cuando está online', () => {
    render(<Shell>Contenido</Shell>);
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });

  it('muestra el banner offline cuando está offline', async () => {
    const { useOnlineStatus } = await import('../../hooks/useOnlineStatus');
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    render(<Shell>Contenido</Shell>);
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();

    // Restore
    vi.mocked(useOnlineStatus).mockReturnValue(true);
  });

  it('el banner offline tiene role="status" y aria-live="polite"', async () => {
    const { useOnlineStatus } = await import('../../hooks/useOnlineStatus');
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    render(<Shell>Contenido</Shell>);
    const banner = screen.getByText(/Sin conexión/).closest('[role="status"]');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('aria-atomic', 'true');

    vi.mocked(useOnlineStatus).mockReturnValue(true);
  });
});
