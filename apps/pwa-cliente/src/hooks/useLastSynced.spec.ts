// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLastSynced } from './useLastSynced';
import { queryClient } from '../api/queryClient';

describe('useLastSynced', () => {
  it('devuelve 0 cuando no hay datos en caché', () => {
    queryClient.clear();
    const { result } = renderHook(() => useLastSynced());
    expect(result.current).toBe(0);
  });

  it('devuelve el timestamp más reciente entre varias queries', () => {
    queryClient.clear();
    act(() => {
      queryClient.setQueryData(['a'], { v: 1 });
      queryClient.setQueryData(['b'], { v: 2 });
    });
    const { result } = renderHook(() => useLastSynced());
    expect(result.current).toBeGreaterThan(0);
    queryClient.clear();
  });
});
