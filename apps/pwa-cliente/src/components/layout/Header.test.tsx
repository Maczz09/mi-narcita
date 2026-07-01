// @ts-nocheck
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Header } from './Header';
import { BrowserRouter } from 'react-router-dom';

const mockLogout = vi.fn();
const mockMarkAllRead = vi.fn();

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({
    user: { nombre: 'Test User', rol: 'ADMIN' },
    logout: mockLogout
  })
}));

vi.mock('../../hooks/queries/useNotificacionesQuery', () => ({
  useNotificacionesQuery: () => ({
    notificaciones: [
      { id: '1', unread: true, titulo: 'Notif 1', contenido: 'Body 1', timestampLabel: '10m', canal: 'SYS' }
    ],
    markAllRead: mockMarkAllRead
  })
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true
}));

const renderHeader = () => {
  return render(
    <BrowserRouter>
      <Header />
    </BrowserRouter>
  );
};

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('toggles theme correctly', () => {
    renderHeader();
    const btn = screen.getByTitle('Tema claro/oscuro');
    fireEvent.click(btn);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('nachopps-theme')).toBe('dark');
    fireEvent.click(btn);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('opens settings popover and changes density', () => {
    renderHeader();
    const btn = screen.getByTitle('Vista y accesibilidad');
    fireEvent.click(btn);
    
    // Cambiar a densa
    const btnCompacta = screen.getByText('Compacta');
    fireEvent.click(btnCompacta);
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('opens notifications popover and marks as read', () => {
    renderHeader();
    const btn = screen.getByTitle('Notificaciones');
    fireEvent.click(btn);
    
    expect(screen.getByText('Notif 1')).toBeInTheDocument();
    
    // Close and open again to trigger markAllRead
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mockMarkAllRead).toHaveBeenCalled();
  });

  it('handles logout', () => {
    renderHeader();
    const btn = screen.getByTitle('Cerrar sesión');
    fireEvent.click(btn);
    expect(mockLogout).toHaveBeenCalled();
  });
});
