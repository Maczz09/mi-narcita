// @ts-nocheck
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway, resolveWsCorsOrigins } from './notifications.gateway';
import { Socket } from 'socket.io';

// ── Claves de prueba (mismo modelo que producción) ──────────────────────────
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const SERVICE_SECRET = 'test-service-secret';

beforeAll(() => {
  process.env.JWT_PUBLIC_KEY = publicKey;
  process.env.SERVICE_JWT_SECRET = SERVICE_SECRET;
});

beforeEach(() => {
  process.env.JWT_PUBLIC_KEY = publicKey;
  process.env.SERVICE_JWT_SECRET = SERVICE_SECRET;
});

function userToken(payload: Record<string, unknown> = { sub: 'user-1', rol: 'COCINA' }) {
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '5m' });
}

function serviceToken() {
  return jwt.sign({ sub: 'servicio-x', rol: 'SISTEMA' }, SERVICE_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

function createClient({
  authToken,
  cookie,
}: {
  authToken?: string;
  cookie?: string;
} = {}) {
  return {
    id: 'socket-1',
    data: {},
    handshake: {
      auth: authToken ? { token: authToken } : {},
      headers: cookie ? { cookie } : {},
    },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
  } as unknown as Socket;
}

describe('resolveWsCorsOrigins', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falla rapido en produccion sin CORS_ORIGIN', () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';

    expect(() => resolveWsCorsOrigins()).toThrow(/CORS_ORIGIN/);
  });

  it('usa CORS_ORIGIN en produccion', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com, https://admin.example.com';

    expect(resolveWsCorsOrigins()).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('mantiene fallback local fuera de produccion', () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'test';

    const origins = resolveWsCorsOrigins();
    expect(origins).toContain('http://localhost:4200');
    expect(origins.length).toBeGreaterThan(1);
  });

  it('usa CORS_ORIGIN si se proporciona fuera de produccion', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = 'http://dev.example.com';

    expect(resolveWsCorsOrigins()).toEqual(['http://dev.example.com']);
  });
});

describe('NotificationsGateway', () => {
  // JwtService REAL: el gateway pasa clave/algoritmo por llamada.
  const gateway = new NotificationsGateway(new JwtService({}));

  it('desconecta conexiones sin token', async () => {
    const client = createClient();

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'unauthorized' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('acepta un token de USUARIO RS256 válido por cookie access_token', async () => {
    const client = createClient({
      cookie: `theme=dark; access_token=${encodeURIComponent(userToken())}`,
    });

    await gateway.handleConnection(client);

    expect((client.data as Record<string, unknown>).user).toMatchObject({ sub: 'user-1', rol: 'COCINA' });
    expect(client.emit).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('T-19: une al cliente al room de su rol', async () => {
    const client = createClient({ authToken: userToken({ sub: 'u2', rol: 'CAJERO' }) });

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('rol:CAJERO');
  });

  it('acepta un token de SERVICIO HS256 válido por handshake.auth', async () => {
    const client = createClient({ authToken: serviceToken() });

    await gateway.handleConnection(client);

    expect((client.data as Record<string, unknown>).user).toMatchObject({ sub: 'servicio-x', rol: 'SISTEMA' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rechaza un RS256 firmado con otra clave', async () => {
    const { privateKey: otherKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const forged = jwt.sign({ sub: 'evil' }, otherKey, { algorithm: 'RS256' });
    const client = createClient({ authToken: forged });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'unauthorized' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('rechaza el ataque de confusión: HS256 firmado con la clave pública', async () => {
    const forged = jwt.sign({ sub: 'evil', rol: 'ADMIN' }, publicKey, { algorithm: 'HS256' });
    const client = createClient({ authToken: forged });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'unauthorized' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('rechaza tokens malformados', async () => {
    const client = createClient({ authToken: 'no-es-un-jwt' });

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('auth:error', { message: 'unauthorized' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('handleDisconnect logs the disconnection', () => {
    const client = createClient();
    // Should not throw
    expect(() => gateway.handleDisconnect(client)).not.toThrow();
  });

  it('usuario sin campo rol no es añadido a room', async () => {
    const client = createClient({ authToken: userToken({ sub: 'u3' }) }); // no rol

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  describe('T-19: emisión dirigida por rol', () => {
    function gatewayWithServerSpy() {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      const gw = new NotificationsGateway(new JwtService({}));
      (gw as unknown as { server: unknown }).server = { to, emit };
      return { gw, to, emit };
    }

    it('pago.registrado va a ADMIN/CAJERO/GERENCIA, no a MESERO/COCINA', () => {
      const { gw, to } = gatewayWithServerSpy();
      gw.emitPedidoUpdate({ pattern: 'pago.registrado', data: {} });
      const rooms = to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(expect.arrayContaining(['rol:ADMIN', 'rol:CAJERO', 'rol:GERENCIA']));
      expect(rooms).not.toContain('rol:MESERO');
      expect(rooms).not.toContain('rol:COCINA');
    });

    it('pedido.creado incluye COCINA (KDS)', () => {
      const { gw, to } = gatewayWithServerSpy();
      gw.emitPedidoUpdate({ pattern: 'pedido.creado', data: {} });
      expect(to.mock.calls[0][0]).toContain('rol:COCINA');
    });

    it('un patrón fuera de la matriz no se emite', () => {
      const { gw, to } = gatewayWithServerSpy();
      gw.emitPedidoUpdate({ pattern: 'desconocido.evento', data: {} });
      expect(to).not.toHaveBeenCalled();
    });
  });
});
