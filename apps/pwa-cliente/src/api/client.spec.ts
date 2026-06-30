import { apiClient, setAuthToken, clearAuthToken } from './client';

describe('client', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'mock' }),
      })
    ) as jest.Mock;
    clearAuthToken();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets and clears auth token', () => {
    setAuthToken('test-token');
    expect(apiClient).toBeDefined();
    clearAuthToken();
  });

  it('performs basic GET request', async () => {
    const res = await apiClient.get('/test');
    expect(res.data).toBe('mock');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('performs POST request', async () => {
    const res = await apiClient.post('/test', { body: true });
    expect(res.data).toBe('mock');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('handles 401 unauthorized by dispatching event', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      })
    ) as jest.Mock;

    const dispatchEventSpy = jest.spyOn(globalThis, 'dispatchEvent');

    await expect(apiClient.get('/test')).rejects.toThrow();
    expect(dispatchEventSpy).toHaveBeenCalled();
  });
});
