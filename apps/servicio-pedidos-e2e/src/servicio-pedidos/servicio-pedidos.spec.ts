// @ts-nocheck
import axios from 'axios';
import { describe, it, expect } from '@jest/globals';

describe('POST /api', () => {
  it('debería devolver 400 Bad Request si el payload es inválido (ValidationPipe)', async () => {
    const payloadInvalido = {
      mesaId: 123, // debería ser string
      // falta 'items' u otros campos
    };

    try {
      await axios.post('/api', payloadInvalido);
      throw new Error('Debería haber lanzado un error 400');
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) throw error;
      expect(error.response?.status).toBe(400);
      const data1 = error.response?.data as { message?: string[] };
      expect(data1?.message).toBeInstanceOf(Array); // class-validator devuelve un array de mensajes
    }
  });

  it('debería devolver 400 Bad Request si el payload está vacío', async () => {
    try {
      await axios.post('/api', {});
      throw new Error('Debería haber lanzado un error 400');
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) throw error;
      expect(error.response?.status).toBe(400);
      // GlobalExceptionFilter normaliza el cuerpo a { statusCode, timestamp, path, message }
      const data2 = error.response?.data as { statusCode?: number; path?: string };
      expect(data2?.statusCode).toBe(400);
      expect(data2?.path).toBe('/api');
    }
  });
});
