// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReportesQuery } from './useReportesQuery';
import * as reportesApi from '../../api/reportes.api';
import { mapResumen } from '../../mappers/reporte.mapper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../api/reportes.api', () => ({
  getResumen: vi.fn(),
}));

vi.mock('../../mappers/reporte.mapper', () => ({
  mapResumen: vi.fn((dto) => ({ ...dto, mapped: true })),
}));

const createWrapper = () => {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  );
};

describe('useReportesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch resumen', async () => {
    vi.mocked(reportesApi.getResumen).mockResolvedValue({ total: 100 } as any);

    const { result } = renderHook(() => useReportesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(reportesApi.getResumen).toHaveBeenCalled();
    expect(mapResumen).toHaveBeenCalledWith({ total: 100 });
    expect(result.current.resumen).toEqual({ total: 100, mapped: true });
    expect(result.current.error).toBeNull();
  });

  it('should handle error', async () => {
    vi.mocked(reportesApi.getResumen).mockRejectedValue(new Error('Report Error'));

    const { result } = renderHook(() => useReportesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Report Error');
  });

  it('should return fetch function', async () => {
    vi.mocked(reportesApi.getResumen).mockResolvedValue({} as any);

    const { result } = renderHook(() => useReportesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.fetch).toBe('function');
  });
});
