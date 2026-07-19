import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { register, Registry } from 'prom-client';
import { trace, type Span } from '@opentelemetry/api';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { MetricsInterceptor } from './metrics.interceptor';

const TRACE_ID = 'abcdef0123456789abcdef0123456789';

function httpContext(statusCode = 200): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', route: { path: '/api/pedidos' }, url: '/api/pedidos' }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

const nextOk: CallHandler = { handle: () => of('ok') };

function runIntercept(interceptor: MetricsInterceptor, ctx: ExecutionContext): Promise<void> {
  return new Promise((resolve, reject) => {
    interceptor.intercept(ctx, nextOk).subscribe({ complete: resolve, error: reject });
  });
}

describe('MetricsInterceptor · exemplars (granularidad atómica)', () => {
  beforeEach(() => {
    // Cada construcción hace `new Histogram/Counter`, que lanza si el nombre ya
    // está registrado; limpiar el registro global aísla los tests.
    register.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('importar el interceptor deja el registro por defecto en OpenMetrics (requisito para emitir exemplars)', () => {
    expect(register.contentType).toBe(Registry.OPENMETRICS_CONTENT_TYPE);
  });

  it('adjunta el trace_id del span activo como exemplar en el histograma de latencia HTTP', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => ({ traceId: TRACE_ID, spanId: '0123456789abcdef', traceFlags: 1 }),
    } as unknown as Span);

    const interceptor = new MetricsInterceptor();
    await runIntercept(interceptor, httpContext());

    const output = await register.metrics();
    // Formato OpenMetrics: `..._bucket{...} <n> # {trace_id="..."} <valor> <ts>`
    expect(output).toContain(`trace_id="${TRACE_ID}"`);
    expect(output).toMatch(/http_request_duration_seconds_bucket\{[^}]*\} \d+ # \{trace_id="/);
  });

  it('sin span activo observa la latencia sin exemplar (no ensucia con trace_id vacío)', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

    const interceptor = new MetricsInterceptor();
    await runIntercept(interceptor, httpContext());

    const output = await register.metrics();
    expect(output).toMatch(/http_request_duration_seconds_count\{[^}]*\} 1/);
    expect(output).not.toContain('trace_id=');
  });

  it('ignora un trace_id inválido (span no muestreado / todo-ceros)', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => ({ traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 0 }),
    } as unknown as Span);

    const interceptor = new MetricsInterceptor();
    await runIntercept(interceptor, httpContext());

    const output = await register.metrics();
    expect(output).not.toContain('trace_id=');
  });
});
