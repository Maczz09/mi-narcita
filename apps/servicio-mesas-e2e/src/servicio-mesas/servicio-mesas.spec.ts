// @ts-nocheck
import axios from 'axios';
import { describe, it, expect } from '@jest/globals';

describe('GET /api', () => {
  it('debería listar mesas autenticado', async () => {
    const res = await axios.get<{ mesas: any[] }>(`/api`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.mesas)).toBe(true);
  });
});
