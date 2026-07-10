import { describe, expect, it, vi } from 'vitest';
import { backoffConJitter } from './rabbitmq-retry.interceptor';

describe('backoffConJitter', () => {
  const initialDelay = 1000;

  it('mantiene delayMs ∈ [base, base + initialDelay) para varios reintentos', () => {
    for (let retryCount = 1; retryCount <= 4; retryCount++) {
      const base = initialDelay * Math.pow(2, retryCount - 1);
      for (let i = 0; i < 50; i++) {
        const delay = backoffConJitter(retryCount, initialDelay);
        expect(delay).toBeGreaterThanOrEqual(base);
        expect(delay).toBeLessThan(base + initialDelay);
      }
    }
  });

  it('crece exponencialmente en la base entre reintentos consecutivos', () => {
    // Sin jitter (random=0) la base de cada reintento dobla la anterior.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(backoffConJitter(1, initialDelay)).toBe(1000);
    expect(backoffConJitter(2, initialDelay)).toBe(2000);
    expect(backoffConJitter(3, initialDelay)).toBe(4000);
    spy.mockRestore();
  });
});
