// @ts-nocheck
import axios from 'axios';
import { describe, it, expect } from '@jest/globals';

describe('GET /api', () => {
  it('debería listar reservas autenticado', async () => {
    const res = await axios.get<{ status: string; service: string }>(`/api`);

    expect(res.status).toBe(200);
    // Respuesta paginada: { data: [...], nextCursor }
    expect(Array.isArray(res.data.data)).toBe(true);
  });
});
