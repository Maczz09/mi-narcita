// @ts-nocheck
import axios from 'axios';
import { register } from 'prom-client';
import { CuentasHttpClient } from './cuentas-http.client';

/**
 * R-06: un timeout (ECONNABORTED/ETIMEDOUT) en el cliente de cuentas incrementa
 * dependency_timeout_total con dependency=cuentas.
 */

jest.mock('axios');
jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    CircuitBreakerOptions: () => (_t: any, _k: string, d: PropertyDescriptor) => d,
  };
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

const tokenService = { generateServiceToken: jest.fn().mockReturnValue('tok') } as any;

function timeoutCount(dependency: string): number {
  const metric = register.getSingleMetric('dependency_timeout_total') as any;
  const hashMap = metric?.hashMap ?? {};
  return Object.values(hashMap).find((v: any) => v.labels.dependency === dependency)?.value ?? 0;
}

describe('dependency_timeout_total — cuentas (R-06)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchCuenta: un timeout incrementa el contador con dependency=cuentas', async () => {
    const antes = timeoutCount('cuentas');
    // GET se reintenta (R-16): ambos intentos deben fallar para contar el timeout.
    mockedAxios.get.mockRejectedValue({ code: 'ECONNABORTED' });
    const client = new CuentasHttpClient(tokenService);

    await expect(client.fetchCuenta('cuenta-1')).rejects.toBeDefined();
    expect(timeoutCount('cuentas')).toBe(antes + 1);
  });

  it('cerrarCuenta: un timeout incrementa el contador con dependency=cuentas', async () => {
    const antes = timeoutCount('cuentas');
    mockedAxios.post.mockRejectedValueOnce({ code: 'ETIMEDOUT' });
    const client = new CuentasHttpClient(tokenService);

    await expect(client.cerrarCuenta('cuenta-1', 0)).rejects.toBeDefined();
    expect(timeoutCount('cuentas')).toBe(antes + 1);
  });
});
