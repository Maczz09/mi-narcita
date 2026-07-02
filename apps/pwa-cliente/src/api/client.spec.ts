// @vitest-environment jsdom
import { vi } from 'vitest';
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { client, setAuthToken, getAuthToken, clearAuthToken, ApiError, refreshAccessToken } from './client';

describe('client', () => {
  beforeEach(() => {
    clearAuthToken();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => arr.fill(0),
      randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    });
    vi.stubGlobal('document', { cookie: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setAuthToken / getAuthToken / clearAuthToken', () => {
    setAuthToken('my-token');
    expect(getAuthToken()).toBe('my-token');
    clearAuthToken();
    expect(getAuthToken()).toBe(null);
  });

  it('ApiError sets correct properties', () => {
    const error = new ApiError(404, 'Not Found', { message: 'Item not found' });
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error.message).toBe('Item not found');
    expect(error.body).toEqual({ message: 'Item not found' });
  });

  it('client.get success', async () => {
    const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.get('/test');
    expect(data).toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.any(Object));
  });

  it('client.post includes Idempotency-Key and JSON body', async () => {
    const mockRes = { ok: true, status: 201, json: vi.fn().mockResolvedValue({ id: 2 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.post('/test', { name: 'Foo' });
    expect(data).toEqual({ id: 2 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Foo' })
    }));
  });

  it('client.patch includes body', async () => {
    const mockRes = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 3 }) };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    await client.patch('/test', { name: 'Bar' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Bar' })
    }));
  });

  it('client.delete works', async () => {
    const mockRes = { ok: true, status: 204 };
    vi.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.delete('/test');
    expect(data).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'DELETE'
    }));
  });

  it('handles 401 error and tries to refresh', async () => {
    const mockRes401 = { ok: false, status: 401, statusText: 'Unauthorized', json: vi.fn().mockRejectedValue(new Error()) };
    const mockResRefresh = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ access_token: 'new-token' }) };
    const mockResRetry = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true }) };

    vi.mocked(fetch)
      .mockResolvedValueOnce(mockRes401 as any)
      .mockResolvedValueOnce(mockResRefresh as any)
      .mockResolvedValueOnce(mockResRetry as any);

    const data = await client.get('/protected');
    expect(data).toEqual({ ok: true });
    expect(getAuthToken()).toBe('new-token');
  });

  it('handles 429 error', async () => {
    const mockRes429 = { ok: false, status: 429, statusText: 'Too Many Requests', json: vi.fn().mockResolvedValue({}) };
    vi.mocked(fetch).mockResolvedValue(mockRes429 as any);

    await expect(client.get('/test')).rejects.toThrow(/Demasiadas solicitudes/);
  });

  describe('retry con backoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reintenta un GET tras un error de red y termina en éxito', async () => {
      const mockOk = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
      vi.mocked(fetch)
        .mockRejectedValueOnce(new TypeError('network error'))
        .mockResolvedValueOnce(mockOk as any);

      const promise = client.get('/test');
      await vi.advanceTimersByTimeAsync(2000);
      const data = await promise;

      expect(data).toEqual({ id: 1 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('reintenta un GET tras un 5xx y termina en éxito', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      const mockOk = { ok: true, status: 200, json: vi.fn().mockResolvedValue({ id: 1 }) };
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockRes500 as any)
        .mockResolvedValueOnce(mockOk as any);

      const promise = client.get('/test');
      await vi.advanceTimersByTimeAsync(2000);
      const data = await promise;

      expect(data).toEqual({ id: 1 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('agota los reintentos de un GET y termina en error', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      vi.mocked(fetch).mockResolvedValue(mockRes500 as any);

      const promise = client.get('/test');
      // Evitar rechazo no manejado mientras avanzan los timers de los reintentos.
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10000);
      await expect(promise).rejects.toThrow('Internal Server Error');

      // 1 intento inicial + 2 reintentos = 3 llamadas a fetch.
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('no reintenta un PATCH (sin Idempotency-Key) tras un 5xx', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      vi.mocked(fetch).mockResolvedValue(mockRes500 as any);

      await expect(client.patch('/test', { a: 1 })).rejects.toThrow('Internal Server Error');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('no reintenta un 4xx aunque el request sea un GET', async () => {
      const mockRes404 = { ok: false, status: 404, statusText: 'Not Found', json: vi.fn().mockResolvedValue({}) };
      vi.mocked(fetch).mockResolvedValue(mockRes404 as any);

      await expect(client.get('/test')).rejects.toThrow('Not Found');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('agota los reintentos de un GET tras errores de red persistentes y termina en error', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('network error persistente'));

      const promise = client.get('/test');
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10000);
      await expect(promise).rejects.toThrow('network error persistente');

      // 1 intento inicial + 2 reintentos = 3 llamadas a fetch.
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('reintenta un POST (lleva Idempotency-Key) tras un 5xx', async () => {
      const mockRes500 = { ok: false, status: 500, statusText: 'Internal Server Error', json: vi.fn().mockResolvedValue({}) };
      const mockOk = { ok: true, status: 201, json: vi.fn().mockResolvedValue({ id: 2 }) };
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockRes500 as any)
        .mockResolvedValueOnce(mockOk as any);

      const promise = client.post('/test', { name: 'Foo' });
      await vi.advanceTimersByTimeAsync(2000);
      const data = await promise;

      expect(data).toEqual({ id: 2 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});

