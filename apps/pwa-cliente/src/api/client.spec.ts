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
});

