// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks declared before any dynamic imports ───────────────────────────────

vi.mock('socket.io-client', () => {
  const mSocket = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    io: { on: vi.fn() },
    connected: false,
    auth: {}
  };
  return {
    io: vi.fn(() => mSocket)
  };
});

vi.mock('../api/client', () => ({
  getAuthToken: vi.fn(),
  refreshAccessToken: vi.fn()
}));

vi.mock('../api/queryClient', () => ({
  queryClient: {
    invalidateQueries: vi.fn()
  }
}));

vi.mock('../hooks/queries/useNotificacionesQuery', () => ({
  pushSocketNotification: vi.fn()
}));

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('socketService', () => {
  let mSocket: any;
  let socketService: typeof import('./socket.service').socketService;
  let getAuthToken: ReturnType<typeof vi.fn>;
  let refreshAccessToken: ReturnType<typeof vi.fn>;
  let queryClient: { invalidateQueries: ReturnType<typeof vi.fn> };
  let pushSocketNotification: ReturnType<typeof vi.fn>;
  let io: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Fresh mock socket for every test
    mSocket = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      io: { on: vi.fn() },
      connected: false,
      auth: {}
    };

    // Re-import mocked modules so we get their current vi.fn() references
    const socketIoMod = await import('socket.io-client');
    io = vi.mocked(socketIoMod.io) as any;
    io.mockReturnValue(mSocket);

    const clientMod = await import('../api/client');
    getAuthToken = vi.mocked(clientMod.getAuthToken) as any;
    refreshAccessToken = vi.mocked(clientMod.refreshAccessToken) as any;

    const qcMod = await import('../api/queryClient');
    queryClient = qcMod.queryClient as any;

    const notifMod = await import('../hooks/queries/useNotificacionesQuery');
    pushSocketNotification = vi.mocked(notifMod.pushSocketNotification) as any;

    // Re-import the service so the module-level `socket` variable is reset.
    // vi.resetModules() + dynamic re-import gives us a fresh singleton each time.
    vi.resetModules();

    // Re-apply mocks after resetModules (they are cleared from the registry)
    vi.mock('socket.io-client', () => ({ io: vi.fn(() => mSocket) }));
    vi.mock('../api/client', () => ({ getAuthToken: vi.fn(), refreshAccessToken: vi.fn() }));
    vi.mock('../api/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }));
    vi.mock('../hooks/queries/useNotificacionesQuery', () => ({ pushSocketNotification: vi.fn() }));

    // Fresh service import (socket = null again)
    const svcMod = await import('./socket.service');
    socketService = svcMod.socketService;

    // Grab the fresh mocked fns from the newly-loaded modules
    const freshIoMod = await import('socket.io-client');
    io = vi.mocked(freshIoMod.io) as any;
    io.mockReturnValue(mSocket);

    const freshClientMod = await import('../api/client');
    getAuthToken = vi.mocked(freshClientMod.getAuthToken) as any;
    refreshAccessToken = vi.mocked(freshClientMod.refreshAccessToken) as any;

    const freshQcMod = await import('../api/queryClient');
    queryClient = freshQcMod.queryClient as any;

    const freshNotifMod = await import('../hooks/queries/useNotificacionesQuery');
    pushSocketNotification = vi.mocked(freshNotifMod.pushSocketNotification) as any;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should not connect again if already connected', async () => {
    vi.mocked(getAuthToken).mockReturnValue('fake-token');
    await socketService.connect();

    // Mark the socket as connected
    const socketInstance = vi.mocked(io).mock.results[0].value;
    socketInstance.connected = true;
    socketInstance.connect.mockClear();

    await socketService.connect();
    expect(socketInstance.connect).not.toHaveBeenCalled();

    socketInstance.connected = false; // cleanup
  });

  it('should initialize socket and connect with existing token', async () => {
    vi.mocked(getAuthToken).mockReturnValue('fake-token');

    await socketService.connect();

    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      auth: { token: 'fake-token' },
      autoConnect: false,
    }));

    const socketInstance = vi.mocked(io).mock.results[0].value;
    expect(socketInstance.connect).toHaveBeenCalled();
  });

  it('should initialize socket and connect with refreshed token if no existing token', async () => {
    vi.mocked(getAuthToken).mockReturnValue(null);
    vi.mocked(refreshAccessToken).mockResolvedValue('refreshed-token');

    await socketService.connect();

    expect(refreshAccessToken).toHaveBeenCalled();
    // The token is passed as an option to io(), not assigned to socket.auth directly on creation
    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      auth: { token: 'refreshed-token' },
    }));
    const socketInstance = vi.mocked(io).mock.results[0].value;
    expect(socketInstance.connect).toHaveBeenCalled();
  });

  it('should disconnect if connected', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    
    socketService.disconnect();
    expect(socketInstance.disconnect).toHaveBeenCalled();
  });

  it('should return connection status', async () => {
    expect(socketService.isConnected()).toBe(false);
    
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    
    socketInstance.connected = true;
    expect(socketService.isConnected()).toBe(true);
  });

  it('should handle pedidoUpdate event with specific pattern', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;

    // Find the handler for 'pedidoUpdate'
    const onCall = socketInstance.on.mock.calls.find((c: any) => c[0] === 'pedidoUpdate');
    expect(onCall).toBeDefined();

    const handler = onCall[1];
    
    const evento = { pattern: 'pedido.created', data: { id: 1 } };
    handler(evento);

    expect(pushSocketNotification).toHaveBeenCalledWith(evento);
    
    // Fast-forward debounce timer
    vi.advanceTimersByTime(300);

    // pattern 'pedido.' affects pedidos, mesas, cuentas
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['pedidos'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['mesas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['cuentas'] }));
  });

  it('should handle pedidoUpdate event with no pattern', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;

    const onCall = socketInstance.on.mock.calls.find((c: any) => c[0] === 'pedidoUpdate');
    const handler = onCall[1];
    
    handler({}); // no pattern
    
    vi.advanceTimersByTime(300);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['pedidos'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['mesas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['cuentas'] }));
  });

  it('should handle pattern starting with cuenta.', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    const handler = socketInstance.on.mock.calls.find((c: any) => c[0] === 'pedidoUpdate')[1];
    
    handler({ pattern: 'cuenta.pagada' });
    vi.advanceTimersByTime(300);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['mesas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['pedidos'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['cuentas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['caja'] }));
  });

  it('should handle pattern starting with mesa.', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    const handler = socketInstance.on.mock.calls.find((c: any) => c[0] === 'pedidoUpdate')[1];
    
    handler({ pattern: 'mesa.liberada' });
    vi.advanceTimersByTime(300);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['mesas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['pedidos'] }));
  });

  it('should clear timer on subsequent calls', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    const handler = socketInstance.on.mock.calls.find((c: any) => c[0] === 'pedidoUpdate')[1];
    
    handler({ pattern: 'mesa.1' });
    handler({ pattern: 'pedido.1' });
    
    vi.advanceTimersByTime(300);

    // We should see invalidations for both
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['mesas'] }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['pedidos'] }));
  });

  it('should handle auth:error and successfully refresh token', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    
    const onAuthError = socketInstance.on.mock.calls.find((c: any) => c[0] === 'auth:error')[1];

    vi.mocked(refreshAccessToken).mockResolvedValue('new-refreshed-token');
    
    onAuthError();
    // Wait for the promise to resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshAccessToken).toHaveBeenCalled();
    expect(socketInstance.auth).toEqual({ token: 'new-refreshed-token' });
    expect(socketInstance.connect).toHaveBeenCalled();
  });

  it('should handle auth:error and prevent multiple retries simultaneously', async () => {
    // Use a real token so connect() does NOT call refreshAccessToken itself
    vi.mocked(getAuthToken).mockReturnValue('initial-token');
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    
    const onAuthError = socketInstance.on.mock.calls.find((c: any) => c[0] === 'auth:error')[1];

    // Reset so we only count calls made by the auth:error handler
    vi.mocked(refreshAccessToken).mockClear();

    let resolveRefresh: any;
    vi.mocked(refreshAccessToken).mockReturnValue(new Promise(resolve => {
      resolveRefresh = resolve;
    }));
    
    onAuthError(); // First call — starts the retry
    onAuthError(); // Second call should return early due to authRetrying flag

    resolveRefresh('new-token');
    await Promise.resolve();
    await Promise.resolve();

    // The refresh should have been called only once due to the authRetrying flag
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });
  
  it('should invalidate all stores on socket reconnect (catch-up)', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;

    const onReconnect = socketInstance.io.on.mock.calls.find((c: any) => c[0] === 'reconnect')[1];
    onReconnect();

    for (const key of ['pedidos', 'mesas', 'cuentas', 'caja']) {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(expect.objectContaining({ queryKey: [key] }));
    }
  });

  it('should handle auth:error when token refresh fails (returns null)', async () => {
    await socketService.connect();
    const socketInstance = vi.mocked(io).mock.results[0].value;
    
    const onAuthError = socketInstance.on.mock.calls.find((c: any) => c[0] === 'auth:error')[1];

    vi.mocked(refreshAccessToken).mockResolvedValue(null);
    socketInstance.connect.mockClear();

    onAuthError();
    await Promise.resolve();
    await Promise.resolve();

    expect(socketInstance.connect).not.toHaveBeenCalled();
  });
});
