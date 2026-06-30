import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

describe('useOnlineStatus', () => {
  it('should return true by default', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('should update on offline and online events', () => {
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
