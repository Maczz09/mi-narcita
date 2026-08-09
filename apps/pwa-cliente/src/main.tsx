/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// main.tsx — Bootstrap de la aplicación NachoPps
// 1. Restaurar tema guardado
// 2. Intentar restaurar sesión (GET /me)
// 3. Montar React
// 4. El router decide si mostrar login o app

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAuthStore } from './store/auth.store';
import { AppRouter } from './router/index';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient, queryPersister, PERSIST_MAX_AGE_MS } from './api/queryClient';
import { ToastProvider } from './components/ui/ToastProvider';
import { applyThemeColor, isTheme, type Theme } from './utils/theme';
import './styles.css';

// ─── Restaurar preferencias de vista persistidas ────────────────
// Tema: preferencia guardada, o la del sistema operativo en el primer arranque.
// Un valor desconocido/legacy en localStorage (versión anterior, storage
// corrupto) cae al criterio del sistema en vez de dejar la página sin tema.
const savedTheme = localStorage.getItem('nachopps-theme');
const systemPrefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
let initialTheme: Theme;
if (isTheme(savedTheme)) {
  initialTheme = savedTheme;
} else {
  initialTheme = systemPrefersDark ? 'dark' : 'light';
}
document.documentElement.dataset['theme'] = initialTheme;
applyThemeColor(initialTheme);

const VIEW_PREFS: { key: string; attr: string; allowed: string[] }[] = [
  { key: 'nachopps-density', attr: 'data-density', allowed: ['comfy', 'compact'] },
  { key: 'nachopps-fontscale', attr: 'data-fontscale', allowed: ['md', 'lg', 'xl'] },
  { key: 'nachopps-contrast', attr: 'data-contrast', allowed: ['normal', 'high'] },
];
for (const pref of VIEW_PREFS) {
  const value = localStorage.getItem(pref.key);
  if (value && pref.allowed.includes(value)) {
    document.documentElement.setAttribute(pref.attr, value);
  }
}

// ─── Escuchar auth:expired para forzar logout ───────────────────
globalThis.addEventListener('auth:expired', () => {
  useAuthStore.getState().expireSession();
});

// ─── Restaurar sesión e iniciar app ─────────────────────────────
async function bootstrap() {
  // Intentar restaurar sesión con cookie existente
  await useAuthStore.getState().restore();

  // Registrar Service Worker para soporte Offline PWA
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    globalThis.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Registro de SW omitido:', err);
      });
    });
  }

  // Montar React
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('No existe el contenedor #root');
  const root = createRoot(rootEl);

  root.render(
    <StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: PERSIST_MAX_AGE_MS,
          // Solo se restauran queries de lectura ya resueltas con éxito; los
          // errores y las mutaciones no se persisten.
          dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === 'success' },
        }}
      >
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      </PersistQueryClientProvider>
    </StrictMode>,
  );
}

bootstrap();
