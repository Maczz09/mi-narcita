import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns current time initially', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(new Date(2026, 0, 1, 10, 0, 0).getTime());
  });

  it('updates time after interval', () => {
    const { result } = renderHook(() => useNow(1000));
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(result.current).toBe(new Date(2026, 0, 1, 10, 0, 1).getTime());
  });
});
