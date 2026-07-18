import { useQuery } from '@tanstack/react-query';
import * as notificacionesApi from '../../api/notificaciones.api';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import {
  mapNotificaciones,
  mapSocketNotification,
} from '../../mappers/notificacion.mapper';
import type {
  NotificacionVM,
  SocketNotificationPayload,
} from '../../types/notificacion.types';

export const NOTIFICACIONES_QUERY_KEY = ['notificaciones'];

export function pushSocketNotification(evento: SocketNotificationPayload) {
  const notificacion = mapSocketNotification(evento);
  queryClient.setQueryData<NotificacionVM[]>(NOTIFICACIONES_QUERY_KEY, (current = []) =>
    [notificacion, ...current].slice(0, 20),
  );
}

export function useNotificacionesQuery() {
  const notificacionesQuery = useQuery({
    queryKey: NOTIFICACIONES_QUERY_KEY,
    queryFn: async () => {
      const dtos = await notificacionesApi.getAll();
      return mapNotificaciones(dtos);
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 30,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  return {
    notificaciones: notificacionesQuery.data ?? [],
    loading: notificacionesQuery.isLoading,
    error: notificacionesQuery.error
      ? notificacionesQuery.error.message
      : null,
    fetch: notificacionesQuery.refetch,
    markAllRead: () => {
      queryClient.setQueryData<NotificacionVM[]>(NOTIFICACIONES_QUERY_KEY, (current = []) =>
        current.map((item) => ({ ...item, unread: false })),
      );
    },
  };
}
