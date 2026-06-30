// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

describe('useOnlineStatus', () => {
  beforeEach(() => {
    jest.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    jest.unstubAllGlobals();
  });

  it('returns true initially if navigator.onLine is true', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('updates state when offline and online events are fired', () => {
    const { result } = renderHook(() => useOnlineStatus());
    
    act(() => {
      globalThis.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      globalThis.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});

