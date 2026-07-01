// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNotificacionesQuery, pushSocketNotification, NOTIFICACIONES_QUERY_KEY } from './useNotificacionesQuery';
import * as notificacionesApi from '../../api/notificaciones.api';
import { queryClient } from '../../api/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/notificaciones.api', () => ({
  getAll: vi.fn(),
}));

vi.mock('../../mappers/notificacion.mapper', () => ({
  mapNotificaciones: vi.fn((dtos) => dtos.map((d: any) => ({ ...d, mapped: true }))),
  mapSocketNotification: vi.fn((dto) => ({ ...dto, fromSocket: true })),
}));

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

vi.mock('../../api/queryClient', () => ({
  queryClient: {
    setQueryData: vi.fn((key, updater) => {
      // Execute the updater to verify its behavior during tests
      if (typeof updater === 'function') {
        const currentData = testQueryClient.getQueryData(key) ?? [];
        const newData = updater(currentData);
        testQueryClient.setQueryData(key, newData);
      }
    }),
  },
}));

const createWrapper = () => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useNotificacionesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testQueryClient.clear();
  });

  it('should fetch notificaciones', async () => {
    vi.mocked(notificacionesApi.getAll).mockResolvedValue([{ id: 'n1' }] as any);

    const { result } = renderHook(() => useNotificacionesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(notificacionesApi.getAll).toHaveBeenCalled();
    expect(result.current.notificaciones).toEqual([{ id: 'n1', mapped: true }]);
    expect(result.current.error).toBeNull();
  });

  it('should expose error', async () => {
    vi.mocked(notificacionesApi.getAll).mockRejectedValue(new Error('Fetch Error'));

    const { result } = renderHook(() => useNotificacionesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Fetch Error');
  });

  it('should markAllRead', async () => {
    vi.mocked(notificacionesApi.getAll).mockResolvedValue([{ id: 'n1', unread: true }] as any);

    const { result } = renderHook(() => useNotificacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Mock setQueryData for this specific test
    let updaterFn: any;
    vi.mocked(queryClient.setQueryData).mockImplementation((key, fn: any) => {
      updaterFn = fn;
    });

    result.current.markAllRead();

    expect(queryClient.setQueryData).toHaveBeenCalledWith(NOTIFICACIONES_QUERY_KEY, expect.any(Function));
    
    // test updater
    const newItems = updaterFn([{ id: 'n1', unread: true }]);
    expect(newItems).toEqual([{ id: 'n1', unread: false }]);
    
    // test with null
    const newItemsNull = updaterFn(undefined);
    expect(newItemsNull).toEqual([]);
  });

  it('should pushSocketNotification', () => {
    let updaterFn: any;
    vi.mocked(queryClient.setQueryData).mockImplementation((key, fn: any) => {
      updaterFn = fn;
    });

    pushSocketNotification({ pattern: 'test' });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(NOTIFICACIONES_QUERY_KEY, expect.any(Function));
    
    const newItems = updaterFn([{ id: 'old' }]);
    expect(newItems).toEqual([{ pattern: 'test', fromSocket: true }, { id: 'old' }]);

    const newItemsNull = updaterFn(undefined);
    expect(newItemsNull).toEqual([{ pattern: 'test', fromSocket: true }]);
    
    // Test slice 20
    const manyItems = Array.from({ length: 25 }, (_, i) => ({ id: `id-${i}` }));
    const slicedItems = updaterFn(manyItems);
    expect(slicedItems.length).toBe(20);
  });
  
  it('should pass fetch function down', async () => {
    vi.mocked(notificacionesApi.getAll).mockResolvedValue([] as any);
    const { result } = renderHook(() => useNotificacionesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.fetch).toBe('function');
  });
});
