// @ts-nocheck
import axios from 'axios';
import { describe, it, expect } from '@jest/globals';

describe('GET /api', () => {
  it('debería exponer health check autenticado', async () => {
    const res = await axios.get<{ status: string; service: string }>(`/api`);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      message: 'Servicio de Inventario activo',
      service: 'servicio-inventario',
    });
  });
});
