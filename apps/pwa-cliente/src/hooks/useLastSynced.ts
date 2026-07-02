// hooks/useLastSynced.ts — Momento del dato más reciente en la caché de React Query.
// Usado para mostrarle al usuario "datos de hace X" cuando está offline y la UI
// se sirve desde la caché persistida en vez de la red.
import { useSyncExternalStore } from 'react';
import { queryClient } from '../api/queryClient';

function getSnapshot(): number {
  let max = 0;
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.dataUpdatedAt > max) max = query.state.dataUpdatedAt;
  }
  return max;
}

function subscribe(onStoreChange: () => void): () => void {
  return queryClient.getQueryCache().subscribe(onStoreChange);
}

/** Timestamp (ms epoch) del dato más reciente en caché, o 0 si no hay ninguno. */
export function useLastSynced(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
