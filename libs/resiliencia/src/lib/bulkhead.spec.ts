import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { register } from 'prom-client';
import { createBulkhead } from './bulkhead';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function rejectedCount(dependency: string): number {
  const metric = register.getSingleMetric('bulkhead_rejected_total') as
    | { hashMap?: Record<string, { value: number; labels: { dependency: string } }> }
    | undefined;
  return Object.values(metric?.hashMap ?? {}).find((v) => v.labels.dependency === dependency)?.value ?? 0;
}

describe('createBulkhead (R-11)', () => {
  it('con maxConcurrent:1/maxQueue:1 rechaza la 3.ª (503) y resuelve las 2 primeras en orden', async () => {
    const bh = createBulkhead('bh-test-1', { maxConcurrent: 1, maxQueue: 1 });
    const antes = rejectedCount('bh-test-1');
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const orden: string[] = [];

    const p1 = bh.run(() => d1.promise).then((v) => orden.push(v));
    const p2 = bh.run(() => d2.promise).then((v) => orden.push(v));
    // 3.ª: 1 en ejecución + 1 en cola = capacidad llena → shed load.
    const p3 = bh.run(() => Promise.resolve('c'));

    await expect(p3).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(rejectedCount('bh-test-1')).toBe(antes + 1);

    d1.resolve('a');
    d2.resolve('b');
    await Promise.all([p1, p2]);
    expect(orden).toEqual(['a', 'b']); // FIFO: nunca fuera de orden
  });

  it('expone agentes http/https con maxSockets = maxConcurrent', () => {
    const bh = createBulkhead('bh-test-2', { maxConcurrent: 7, maxQueue: 3 });
    expect(bh.httpAgent.maxSockets).toBe(7);
    expect(bh.httpsAgent.maxSockets).toBe(7);
  });

  it('libera capacidad al resolver: tras vaciarse admite nuevas llamadas', async () => {
    const bh = createBulkhead('bh-test-3', { maxConcurrent: 1, maxQueue: 0 });
    await expect(bh.run(() => Promise.resolve('x'))).resolves.toBe('x');
    // La primera ya resolvió → capacidad libre.
    await expect(bh.run(() => Promise.resolve('y'))).resolves.toBe('y');
  });
});
