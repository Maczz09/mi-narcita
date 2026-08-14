// screens/carta-publica/useCartaSocket.ts — WebSocket de disponibilidad
// para la carta pública/QR (T-XX). SIN autenticación a propósito: se conecta
// a un path de socket.io propio (`/carta-socket.io`, no el del KDS) que
// Kong deja pasar sin JWT — ver apps/servicio-notificaciones/src/app/carta.gateway.ts
// y el carve-out en infra/kong/kong.yml.template.
//
// Solo dispara `onCambio()` — el screen decide qué hacer (recargar la
// carta), este hook no conoce la forma de los datos de negocio.

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const BASE_URL = (import.meta as unknown as { env: Record<string, string> }).env['VITE_API_BASE_URL'] ?? 'http://localhost:8000';
const CARTA_SOCKET_PATH = '/notificaciones/carta-socket.io';

export function useCartaSocket(sedeId: string | undefined, onCambio: () => void) {
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  useEffect(() => {
    if (!sedeId) return;

    const socket: Socket = io(BASE_URL, {
      path: CARTA_SOCKET_PATH,
      query: { sedeId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('disponibilidad:cambiada', () => onCambioRef.current());

    return () => {
      socket.disconnect();
    };
  }, [sedeId]);
}
