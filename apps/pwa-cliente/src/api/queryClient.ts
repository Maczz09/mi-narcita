import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 1, // 1 minuto
      retry: 1,
    },
  },
});

// Caché de lectura offline (plan de resiliencia): persiste las queries GET en
// localStorage para que, sin conexión, la UI muestre el último dato conocido
// en vez de una pantalla vacía. Las mutaciones nunca se persisten ni se
// reintentan offline — ver useOnlineStatus/bloqueo de mutaciones por pantalla.
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 horas

export const queryPersister = createAsyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: 'nachopps-query-cache',
});
