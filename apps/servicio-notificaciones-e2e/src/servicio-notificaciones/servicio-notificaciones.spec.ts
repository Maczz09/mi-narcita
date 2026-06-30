// @ts-nocheck
import axios from 'axios';
import { describe, it, expect } from '@jest/globals';

describe('GET /api', () => {
  it('debería listar notificaciones autenticado', async () => {
    const res = await axios.get<{ status: string; service: string }>(`/api`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });
});
