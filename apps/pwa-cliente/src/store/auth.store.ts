// store/auth.store.ts — Zustand store de autenticación

import { create } from 'zustand';
import type { LoginRequest, UserDto } from '../types/auth.types';
import * as authApi from '../api/auth.api';
import { clearAuthToken, setUsuarioSedeId, setSedeSeleccionada } from '../api/client';
import { socketService } from '../services/socket.service';

interface AuthState {
  user: UserDto | null;
  authenticated: boolean;
  loading: boolean;
}

interface AuthActions {
  login: (req: LoginRequest) => Promise<void>;
  logout: () => void;
  expireSession: () => void;
  restore: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  authenticated: false,
  loading: false,

  login: async (req: LoginRequest) => {
    const user = await authApi.login(req);
    setUsuarioSedeId(user.sedeId ?? null);
    set({ user, authenticated: true });
    void socketService.connect();
  },

  logout: () => {
    void authApi.logout().catch(() => {
      // La sesión puede estar expirada o el backend rechazar logout; el estado local igual debe limpiarse.
    });
    clearAuthToken();
    setUsuarioSedeId(null);
    setSedeSeleccionada(null);
    socketService.disconnect();
    set({ user: null, authenticated: false });
  },

  expireSession: () => {
    clearAuthToken();
    setUsuarioSedeId(null);
    setSedeSeleccionada(null);
    socketService.disconnect();
    set({ user: null, authenticated: false });
  },

  restore: async () => {
    set({ loading: true });
    try {
      const user = await authApi.me();
      setUsuarioSedeId(user.sedeId ?? null);
      set({ user, authenticated: true, loading: false });
      void socketService.connect();
    } catch {
      clearAuthToken();
      setUsuarioSedeId(null);
      socketService.disconnect();
      set({ user: null, authenticated: false, loading: false });
    }
  },
}));
