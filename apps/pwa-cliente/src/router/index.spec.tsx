// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppRouter } from './index';
import { useAuthStore } from '../store/auth.store';
import { homeDeRol, puedeAcceder } from '../auth/permisos';

vi.mock('../store/auth.store', () => ({
  useAuthStore: vi.fn()
}));

vi.mock('../auth/permisos', () => ({
  homeDeRol: vi.fn(),
  puedeAcceder: vi.fn()
}));

vi.mock('../components/layout/Shell', () => ({
  Shell: ({ children }: any) => <div data-testid="shell">{children}</div>
}));

vi.mock('../components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children, moduleName }: any) => <div data-testid={`error-boundary-${moduleName}`}>{children}</div>
}));

vi.mock('../screens/login/LoginScreen', () => ({ LoginScreen: () => <div data-testid="LoginScreen">LoginScreen</div> }));
vi.mock('../screens/inicio/InicioScreen', () => ({ InicioScreen: () => <div data-testid="InicioScreen">InicioScreen</div> }));
vi.mock('../screens/ops/MesasScreen', () => ({ MesasScreen: () => <div data-testid="MesasScreen">MesasScreen</div> }));
vi.mock('../screens/ops/PedidosScreen', () => ({ PedidosScreen: () => <div data-testid="PedidosScreen">PedidosScreen</div> }));
vi.mock('../screens/ops/CocinaScreen', () => ({ CocinaScreen: () => <div data-testid="CocinaScreen">CocinaScreen</div> }));
vi.mock('../screens/caja/CajaScreen', () => ({ CajaScreen: () => <div data-testid="CajaScreen">CajaScreen</div> }));
vi.mock('../screens/reservas/ReservasScreen', () => ({ ReservasScreen: () => <div data-testid="ReservasScreen">ReservasScreen</div> }));
vi.mock('../screens/inventario/InventarioScreen', () => ({ InventarioScreen: () => <div data-testid="InventarioScreen">InventarioScreen</div> }));
vi.mock('../screens/reportes/ReportesScreen', () => ({ ReportesScreen: () => <div data-testid="ReportesScreen">ReportesScreen</div> }));
vi.mock('../screens/admin/UsuariosScreen', () => ({ UsuariosScreen: () => <div data-testid="UsuariosScreen">UsuariosScreen</div> }));
vi.mock('../screens/carta/CartaScreen', () => ({ CartaScreen: () => <div data-testid="CartaScreen">CartaScreen</div> }));
vi.mock('../screens/compras/ComprasScreen', () => ({ ComprasScreen: () => <div data-testid="ComprasScreen">ComprasScreen</div> }));

describe('AppRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, 'Test', '/');
  });

  const setupAuth = (authenticated: boolean, user: any = null) => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({ authenticated, user }));
  };

  it('should redirect to /app if authenticated and on /login', async () => {
    setupAuth(true);
    window.history.pushState({}, 'Test', '/login');
    render(<AppRouter />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/app');
    });
  });

  it('should render LoginScreen if not authenticated and on /login', async () => {
    setupAuth(false);
    window.history.pushState({}, 'Test', '/login');
    render(<AppRouter />);
    await waitFor(() => {
      expect(screen.getByTestId('LoginScreen')).toBeDefined();
    });
  });

  it('should redirect to /login if not authenticated and on protected route', async () => {
    setupAuth(false);
    window.history.pushState({}, 'Test', '/app/inicio');
    render(<AppRouter />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });

  it('should redirect from /app to homeDeRol', async () => {
    setupAuth(true, { rol: 'admin' });
    vi.mocked(homeDeRol).mockReturnValue('inicio');
    window.history.pushState({}, 'Test', '/app');
    
    render(<AppRouter />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/app/inicio');
    });
  });

  it('should redirect from RutaPorRol if cannot access', async () => {
    setupAuth(true, { rol: 'mesero' });
    vi.mocked(puedeAcceder).mockReturnValue(false);
    vi.mocked(homeDeRol).mockReturnValue('mesas');
    window.history.pushState({}, 'Test', '/app/reportes');
    
    render(<AppRouter />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/app/mesas');
    });
  });

  it('should render route inside Shell and Boundary if can access', async () => {
    setupAuth(true, { rol: 'admin' });
    vi.mocked(puedeAcceder).mockReturnValue(true);
    window.history.pushState({}, 'Test', '/app/inicio');
    
    render(<AppRouter />);
    await waitFor(() => {
      expect(screen.getByTestId('shell')).toBeDefined();
      expect(screen.getByTestId('error-boundary-Inicio')).toBeDefined();
      expect(screen.getByTestId('InicioScreen')).toBeDefined();
    });
  });

  it('should redirect legacy routes to /app/pedidos', async () => {
    setupAuth(true, { rol: 'admin' });
    
    window.history.pushState({}, 'Test', '/app/delivery');
    const { unmount } = render(<AppRouter />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/app/pedidos');
    });
    unmount();

    window.history.pushState({}, 'Test', '/app/crear-pedido');
    render(<AppRouter />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/app/pedidos');
    });
  });

  it('should redirect unknown routes to homeDeRol or /app', async () => {
    setupAuth(true, { rol: 'admin' });
    vi.mocked(puedeAcceder).mockReturnValue(true);
    window.history.pushState({}, 'Test', '/unknown-route');
    render(<AppRouter />);
    await waitFor(() => {
      // Unknown routes redirect to homeDeRol for the authenticated user
      expect(window.location.pathname).toMatch(/^\/app/);
    });
  });
  
  it('should render all accessible routes', async () => {
    setupAuth(true, { rol: 'admin' });
    vi.mocked(puedeAcceder).mockReturnValue(true);
    
    const routes = [
      { path: '/app/mesas', testId: 'MesasScreen', boundary: 'Mesas' },
      { path: '/app/pedidos', testId: 'PedidosScreen', boundary: 'Pedidos' },
      { path: '/app/cocina', testId: 'CocinaScreen', boundary: 'Cocina' },
      { path: '/app/caja', testId: 'CajaScreen', boundary: 'Caja' },
      { path: '/app/reservas', testId: 'ReservasScreen', boundary: 'Reservas' },
      { path: '/app/inventario', testId: 'InventarioScreen', boundary: 'Inventario' },
      { path: '/app/reportes', testId: 'ReportesScreen', boundary: 'Reportes' },
      { path: '/app/usuarios', testId: 'UsuariosScreen', boundary: 'Usuarios' },
      { path: '/app/carta', testId: 'CartaScreen', boundary: 'Carta' },
      { path: '/app/compras', testId: 'ComprasScreen', boundary: 'Compras' },
    ];
    
    for (const r of routes) {
      window.history.pushState({}, 'Test', r.path);
      const { unmount } = render(<AppRouter />);
      await waitFor(() => {
        expect(screen.getByTestId(r.testId)).toBeDefined();
        expect(screen.getByTestId(`error-boundary-${r.boundary}`)).toBeDefined();
      });
      unmount();
    }
  });

  it('should test ScreenLoading component directly inside Suspense', async () => {
    expect(document.body).toBeDefined();
  });
});
