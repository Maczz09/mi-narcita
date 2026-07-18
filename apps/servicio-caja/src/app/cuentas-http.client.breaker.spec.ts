// @ts-nocheck
/* eslint-disable */

import axios from 'axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { CIRCUIT_BREAKER_REGISTRY } from '@org/resiliencia';
import { CuentasHttpClient } from './cuentas-http.client';

/**
 * R-03: el cierre remoto de cuenta (ruta de dinero) va tras un circuit breaker.
 * Tras una racha de fallos el breaker abre y responde inmediato (EOPENBREAKER)
 * sin tocar la red; app.service captura ese error y degrada el pago a
 * PAGO_SIN_CIERRE_CONFIRMADO (comportamiento existente del catch de cerrarCuenta).
 */

const tokenService = { generateServiceToken: jest.fn().mockReturnValue('service-token') } as any;

function limpiarBreakers() {
  for (const [name, breaker] of CIRCUIT_BREAKER_REGISTRY) {
    breaker.shutdown();
    CIRCUIT_BREAKER_REGISTRY.delete(name);
  }
}

describe('CuentasHttpClient.cerrarCuenta — circuit breaker (R-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    limpiarBreakers();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    limpiarBreakers();
  });

  it('abre el circuito tras N fallos y luego rechaza sin tocar la red', async () => {
    const client = new CuentasHttpClient(tokenService);
    const postSpy = jest.spyOn(axios, 'post')
      .mockRejectedValue(Object.assign(new Error('conexión rechazada'), { code: 'ECONNREFUSED' }));

    // Volumen mínimo de opossum (10) para evaluar el umbral de error.
    for (let i = 0; i < 12; i++) {
      await expect(client.cerrarCuenta('cuenta-1', 0)).rejects.toBeDefined();
    }

    const breaker = CIRCUIT_BREAKER_REGISTRY.get('CuentasHttpClient.cerrarCuentaConBreaker');
    expect(breaker?.opened).toBe(true);

    const llamadasAntes = postSpy.mock.calls.length;
    await expect(client.cerrarCuenta('cuenta-1', 0)).rejects.toBeDefined();
    // Circuito abierto: la última petición no llegó a axios.
    expect(postSpy.mock.calls.length).toBe(llamadasAntes);
  });

  it('un ECONNRESET en la lectura se mapea a 503 (H-3)', async () => {
    const client = new CuentasHttpClient(tokenService);
    jest.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    );

    await expect(client.fetchCuenta('cuenta-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('un 4xx no abre el circuito', async () => {
    const client = new CuentasHttpClient(tokenService);
    jest.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('bad request'), { response: { status: 400 } }),
    );

    for (let i = 0; i < 12; i++) {
      await expect(client.cerrarCuenta('cuenta-1', 0)).rejects.toBeDefined();
    }

    const breaker = CIRCUIT_BREAKER_REGISTRY.get('CuentasHttpClient.cerrarCuentaConBreaker');
    expect(breaker?.opened).toBe(false);
  });
});
