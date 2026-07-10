import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryAsync, defaultIsRetryable } from './retry';

describe('retryAsync (R-14)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reintenta ante 5xx y luego resuelve', async () => {
    let intentos = 0;
    const fn = vi.fn(async () => {
      intentos++;
      if (intentos === 1) throw { response: { status: 503 } };
      return 'ok';
    });

    const p = retryAsync(fn, { retries: 1, baseMs: 10 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta ante 4xx', async () => {
    const fn = vi.fn(async () => {
      throw { response: { status: 404 } };
    });

    const p = retryAsync(fn, { retries: 3, baseMs: 10 });
    const assertion = expect(p).rejects.toMatchObject({ response: { status: 404 } });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respeta el máximo de reintentos y propaga el último error', async () => {
    const fn = vi.fn(async () => {
      throw { code: 'ECONNRESET' }; // red → reintentable
    });

    const p = retryAsync(fn, { retries: 2, baseMs: 10 });
    const assertion = expect(p).rejects.toMatchObject({ code: 'ECONNRESET' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3); // 1 inicial + 2 reintentos
  });

  it('defaultIsRetryable: 5xx y red sí, 4xx no', () => {
    expect(defaultIsRetryable({ response: { status: 500 } })).toBe(true);
    expect(defaultIsRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    expect(defaultIsRetryable({ response: { status: 400 } })).toBe(false);
    expect(defaultIsRetryable({ response: { status: 404 } })).toBe(false);
  });
});
