// @ts-nocheck
import axios from 'axios';
import { describe, it, expect } from '@jest/globals';

describe('GET /api', () => {
  it('debería listar transacciones de caja', async () => {
    const res = await axios.get<{ status: string; service: string }>(`/api`);

    expect(res.status).toBe(200);
    // Respuesta paginada: { data: [...], nextCursor }
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it('debería exponer health check serio (S33)', async () => {
    const res = await axios.get(`/api/health`);

    expect(res.status).toBe(200);
    expect(['UP', 'DEGRADED', 'DOWN']).toContain(res.data.status);
    expect(res.data.service).toBe('caja');
    expect(res.data.version).toBeDefined();
    expect(res.data.dependencies.database).toBe('UP');
  });

  it('debería exponer /health/live y /health/ready', async () => {
    const live = await axios.get(`/api/health/live`);
    expect(live.status).toBe(200);
    expect(live.data.status).toBe('UP');

    const ready = await axios.get(`/api/health/ready`);
    expect(ready.status).toBe(200);
    expect(ready.data.dependencies.database).toBe('UP');
  });
});
