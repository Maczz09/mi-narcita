import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// T-05: política de reintento/refetch de resiliencia compartida por los hooks de
// lectura, para que la auto-recuperación de UI no sea exclusiva de cuentas.
// - retrySalvo404: el 404 (recurso inexistente) no es error duro y no reintenta;
//   cualquier otro fallo reintenta hasta 2 veces.
// - refetchSiError: ya en error, re-pregunta cada 5 s hasta que el servicio vuelve.
export const retrySalvo404 = (failureCount: number, err: Error): boolean =>
  (err as { status?: number }).status !== 404 && failureCount < 2;

export const refetchSiError = (query: { state: { status: string } }): number | false =>
  query.state.status === 'error' ? 5000 : false;

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
