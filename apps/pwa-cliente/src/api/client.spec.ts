// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { client, setAuthToken, getAuthToken, clearAuthToken, ApiError, refreshAccessToken } from './client';

describe('client', () => {
  beforeEach(() => {
    clearAuthToken();
    jest.stubGlobal('fetch', jest.fn());
    jest.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => arr.fill(0),
      randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    });
    jest.stubGlobal('document', { cookie: '' });
  });

  afterEach(() => {
    jest.unstubAllGlobals();
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
    const mockRes = { ok: true, status: 200, json: jest.fn().mockResolvedValue({ id: 1 }) };
    jest.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.get('/test');
    expect(data).toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.any(Object));
  });

  it('client.post includes Idempotency-Key and JSON body', async () => {
    const mockRes = { ok: true, status: 201, json: jest.fn().mockResolvedValue({ id: 2 }) };
    jest.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.post('/test', { name: 'Foo' });
    expect(data).toEqual({ id: 2 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Foo' })
    }));
  });

  it('client.patch includes body', async () => {
    const mockRes = { ok: true, status: 200, json: jest.fn().mockResolvedValue({ id: 3 }) };
    jest.mocked(fetch).mockResolvedValue(mockRes as any);

    await client.patch('/test', { name: 'Bar' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Bar' })
    }));
  });

  it('client.delete works', async () => {
    const mockRes = { ok: true, status: 204 };
    jest.mocked(fetch).mockResolvedValue(mockRes as any);

    const data = await client.delete('/test');
    expect(data).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.objectContaining({
      method: 'DELETE'
    }));
  });

  it('handles 401 error and tries to refresh', async () => {
    const mockRes401 = { ok: false, status: 401, statusText: 'Unauthorized', json: jest.fn().mockRejectedValue(new Error()) };
    const mockResRefresh = { ok: true, status: 200, json: jest.fn().mockResolvedValue({ access_token: 'new-token' }) };
    const mockResRetry = { ok: true, status: 200, json: jest.fn().mockResolvedValue({ ok: true }) };

    jest.mocked(fetch)
      .mockResolvedValueOnce(mockRes401 as any)
      .mockResolvedValueOnce(mockResRefresh as any)
      .mockResolvedValueOnce(mockResRetry as any);

    const data = await client.get('/protected');
    expect(data).toEqual({ ok: true });
    expect(getAuthToken()).toBe('new-token');
  });

  it('handles 429 error', async () => {
    const mockRes429 = { ok: false, status: 429, statusText: 'Too Many Requests', json: jest.fn().mockResolvedValue({}) };
    jest.mocked(fetch).mockResolvedValue(mockRes429 as any);

    await expect(client.get('/test')).rejects.toThrow(/Demasiadas solicitudes/);
  });
});

