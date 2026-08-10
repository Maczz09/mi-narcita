// @vitest-environment jsdom
import { vi } from 'vitest';
// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth.store';
import * as authApi from '../api/auth.api';
import { socketService } from '../services/socket.service';
import * as clientApi from '../api/client';

vi.mock('../api/auth.api');
vi.mock('../services/socket.service', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() }
}));
vi.mock('../api/client', () => ({
  clearAuthToken: vi.fn(),
  setUsuarioSedeId: vi.fn(),
  setSedeSeleccionada: vi.fn(),
}));

describe('auth.store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, authenticated: false, loading: false });
    vi.clearAllMocks();
  });

  it('login works', async () => {
    const mockUser = { id: '1', nombre: 'Test', roles: [] };
    vi.mocked(authApi.login).mockResolvedValue(mockUser as any);

    await useAuthStore.getState().login({ email: 'test@test.com', password: '123' });

    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().authenticated).toBe(true);
    expect(socketService.connect).toHaveBeenCalled();
  });

  it('logout works', async () => {
    vi.mocked(authApi.logout).mockResolvedValue({} as any);
    useAuthStore.setState({ user: { id: '1' } as any, authenticated: true });

    useAuthStore.getState().logout();
    
    // Using immediate check since it resets synchronously
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(clientApi.clearAuthToken).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
  });

  it('expireSession works', () => {
    useAuthStore.setState({ user: { id: '1' } as any, authenticated: true });

    useAuthStore.getState().expireSession();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(clientApi.clearAuthToken).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
  });

  it('restore success', async () => {
    const mockUser = { id: '1', nombre: 'Test', roles: [] };
    vi.mocked(authApi.me).mockResolvedValue(mockUser as any);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().authenticated).toBe(true);
    expect(useAuthStore.getState().loading).toBe(false);
    expect(socketService.connect).toHaveBeenCalled();
  });

  it('restore failure', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new Error('Unauthorized'));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(useAuthStore.getState().loading).toBe(false);
    expect(clientApi.clearAuthToken).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
  });
});

