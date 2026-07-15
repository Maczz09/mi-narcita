import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OperableLog } from '@org/observabilidad';
import { getJwtPublicKey, getServiceJwtSecret } from '@org/shared-auth';
import { wsRoomForRole, wsRoomsForPattern } from '@org/contracts';

export interface NotificacionEvento {
  pattern: string;
  data: unknown;
}

export function resolveWsCorsOrigins(): string[] {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(',').map((o) => o.trim());
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }
  return [
    'http://localhost:3000',
    'http://localhost:4200',
    'http://localhost:4201',
    'http://localhost:5173',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:4201',
    'http://127.0.0.1:5173',
  ];
}

@WebSocketGateway({
  cors: {
    origin: resolveWsCorsOrigins(),
    credentials: true,
  },
  // Kong enrutará `/notificaciones/socket.io` hacia este path base:
  path: '/api/socket.io',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('missing token');

      const user = (await this.verifyToken(token)) as { rol?: string };
      (client.data as Record<string, unknown>).user = user;
      // T-19: unir al room por rol para emisión dirigida en vez de broadcast global.
      if (user?.rol) {
        await client.join(wsRoomForRole(user.rol));
      }
      this.logger.log({
        operation: 'handleConnection',
        aggregateId: client.id,
        resultingState: user?.rol ?? 'SIN_ROL',
        message: 'Cliente KDS conectado.',
      } satisfies OperableLog);
    } catch {
      this.logger.warn({
        operation: 'handleConnection',
        aggregateId: client.id,
        errorCode: 'WS_NO_AUTORIZADO',
        message: 'Conexión WebSocket no autorizada.',
      } satisfies OperableLog);
      client.emit('auth:error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log({
      operation: 'handleDisconnect',
      aggregateId: client.id,
      message: 'Cliente KDS desconectado.',
    } satisfies OperableLog);
  }

  // T-19: emite el evento solo a los roles autorizados a verlo (matriz en @org/contracts),
  // en vez de un broadcast global que filtraba pagos/arqueos a cualquier autenticado.
  emitPedidoUpdate(evento: NotificacionEvento) {
    const rooms = wsRoomsForPattern(evento.pattern);
    if (rooms.length === 0) {
      this.logger.warn({
        operation: evento.pattern,
        errorCode: 'SIN_ROLES_WS',
        message: 'Evento sin roles configurados en la matriz WS; no se emite.',
      } satisfies OperableLog);
      return;
    }
    this.logger.log({
      operation: evento.pattern,
      message: `Emitiendo evento por WebSocket a las rooms: ${rooms.join(', ')}.`,
    } satisfies OperableLog);
    this.server.to(rooms).emit('pedidoUpdate', evento);
  }

  /**
   * Verifica el token del handshake con el MISMO modelo de confianza que el
   * guard HTTP (`jwt-keys.ts`): RS256 → clave pública (tokens de usuario, los que
   * envía la PWA por cookie), HS256 → secreto de servicio (tokens S2S internos).
   *
   * El `JwtService` global está configurado solo para FIRMAR HS256, por eso aquí
   * pasamos la clave y el algoritmo explícitos por llamada. Restringir el `alg`
   * por rama es lo que cierra el ataque de confusión RS256→HS256: nunca se admite
   * un HS256 firmado con la clave pública conocida.
   */
  private verifyToken(token: string): Promise<unknown> {
    const alg = this.readAlg(token);
    if (alg === 'RS256') {
      return this.jwtService.verifyAsync(token, {
        secret: getJwtPublicKey(),
        algorithms: ['RS256'],
      });
    }
    if (alg === 'HS256') {
      return this.jwtService.verifyAsync(token, {
        secret: getServiceJwtSecret(),
        algorithms: ['HS256'],
      });
    }
    throw new Error(`unsupported jwt alg: ${alg}`);
  }

  private readAlg(token: string): string | undefined {
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as Record<string, unknown>;
    return header?.['alg'] as string | undefined;
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.['token'] as unknown;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;

    const cookieHeader = client.handshake.headers.cookie ?? '';
    const cookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('access_token='));

    return cookie
      ? decodeURIComponent(cookie.slice('access_token='.length))
      : undefined;
  }
}
