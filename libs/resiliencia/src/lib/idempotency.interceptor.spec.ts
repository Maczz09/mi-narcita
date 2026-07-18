import { describe, it, expect, vi } from 'vitest';
import { of, lastValueFrom, throwError } from 'rxjs';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IdempotencyInterceptor } from './idempotency.interceptor';

function hashOf(body: unknown) {
  return createHash('sha256').update(body != null ? JSON.stringify(body) : '').digest('hex');
}

function makeContext(method = 'POST', headers: Record<string, string> = {}, routePath = '/pedidos', body: unknown = undefined) {
  const res = { statusCode: 200, status: vi.fn(function (this: { statusCode: number }, c: number) { this.statusCode = c; }) };
  const req = { method, headers, route: { path: routePath }, url: routePath, body };
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  };
  return { ctx, res };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      ...overrides,
    },
  };
}

describe('IdempotencyInterceptor (plan 1.3)', () => {
  it('pasa de largo si no hay header Idempotency-Key', async () => {
    const db = makeDb();
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', {});
    const out = await lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({ ok: 1 }) } as import('@nestjs/common').CallHandler));
    expect(out).toEqual({ ok: 1 });
    expect(db.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('pasa de largo en métodos no-POST', async () => {
    const db = makeDb();
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('PATCH', { 'idempotency-key': 'k1' });
    const out = await lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({ ok: 1 }) } as import('@nestjs/common').CallHandler));
    expect(out).toEqual({ ok: 1 });
    expect(db.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('primera vez: reclama la clave, ejecuta y persiste la respuesta', async () => {
    const db = makeDb();
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' });
    const out = await lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({ pedidoId: 'p1' }) } as import('@nestjs/common').CallHandler));
    expect(out).toEqual({ pedidoId: 'p1' });
    expect(db.idempotencyKey.create).toHaveBeenCalledWith({
      data: { key: 'http:POST:/pedidos:k1', method: 'POST', path: '/pedidos', requestHash: hashOf(undefined) },
    });
    const upd = db.idempotencyKey.update.mock.calls[0][0] as { where: unknown, data: { body: string, statusCode: number, completedAt: Date } };
    expect(upd.where).toEqual({ key: 'http:POST:/pedidos:k1' });
    expect(JSON.parse(upd.data.body)).toEqual({ pedidoId: 'p1' });
    expect(upd.data.statusCode).toBe(201);
    expect(upd.data.completedAt).toBeInstanceOf(Date);
  });

  it('replay: devuelve la respuesta cacheada sin re-ejecutar el handler', async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({
        key: 'x', statusCode: 201, body: JSON.stringify({ pedidoId: 'p1' }), completedAt: new Date(),
      }),
    });
    const itc = new IdempotencyInterceptor(db);
    const { ctx, res } = makeContext('POST', { 'idempotency-key': 'k1' });
    const handle = vi.fn(() => of({ pedidoId: 'NO-DEBE-EJECUTARSE' }));
    const out = await lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle } as import('@nestjs/common').CallHandler));
    expect(out).toEqual({ pedidoId: 'p1' });
    expect(handle).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(db.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it('duplicado en curso (registro sin completar) → 409', async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({ key: 'x', statusCode: null, body: null, completedAt: null }),
    });
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' });
    await expect(lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({}) } as import('@nestjs/common').CallHandler))).rejects.toBeInstanceOf(ConflictException);
  });

  it('H-1: claim incompleto viejo (2 min) → huérfano: re-reclama y procede', async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({
        key: 'x', statusCode: null, body: null, completedAt: null,
        createdAt: new Date(Date.now() - 120_000),
      }),
    });
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' });
    const out = await lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({ pedidoId: 'p1' }) } as import('@nestjs/common').CallHandler));
    expect(out).toEqual({ pedidoId: 'p1' });
    // Libera el claim huérfano y re-reclama.
    expect(db.idempotencyKey.delete).toHaveBeenCalledWith({ where: { key: 'http:POST:/pedidos:k1' } });
    expect(db.idempotencyKey.create).toHaveBeenCalled();
  });

  it('H-1: claim incompleto reciente (5 s) → sigue devolviendo 409', async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({
        key: 'x', statusCode: null, body: null, completedAt: null,
        createdAt: new Date(Date.now() - 5_000),
      }),
    });
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' });
    await expect(lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({}) } as import('@nestjs/common').CallHandler))).rejects.toBeInstanceOf(ConflictException);
    expect(db.idempotencyKey.delete).not.toHaveBeenCalled();
  });

  it('carrera de creación (P2002) → 409', async () => {
    const db = makeDb({ create: vi.fn().mockRejectedValue({ code: 'P2002' }) });
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' });
    await expect(lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({}) } as import('@nestjs/common').CallHandler))).rejects.toBeInstanceOf(ConflictException);
  });

  it('T-14: misma clave + mismo body → replay (no 422)', async () => {
    const body = { cuentaId: 'c1', monto: 50 };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({
        key: 'x', statusCode: 201, body: JSON.stringify({ ok: 1 }), completedAt: new Date(), requestHash: hashOf(body),
      }),
    });
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' }, '/pedidos', body);
    const out = await lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({ ok: 'NO' }) } as import('@nestjs/common').CallHandler));
    expect(out).toEqual({ ok: 1 });
  });

  it('T-14: misma clave + body distinto → 422', async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({
        key: 'x', statusCode: 201, body: JSON.stringify({ ok: 1 }), completedAt: new Date(), requestHash: hashOf({ monto: 50 }),
      }),
    });
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' }, '/pedidos', { monto: 999 });
    await expect(
      lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => of({}) } as import('@nestjs/common').CallHandler)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('si el handler falla, libera la clave y propaga el error', async () => {
    const db = makeDb();
    const itc = new IdempotencyInterceptor(db);
    const { ctx } = makeContext('POST', { 'idempotency-key': 'k1' });
    const boom = new Error('boom');
    await expect(
      lastValueFrom(itc.intercept(ctx as import('@nestjs/common').ExecutionContext, { handle: () => throwError(() => boom) } as import('@nestjs/common').CallHandler)),
    ).rejects.toBe(boom);
    expect(db.idempotencyKey.delete).toHaveBeenCalledWith({ where: { key: 'http:POST:/pedidos:k1' } });
  });
});
