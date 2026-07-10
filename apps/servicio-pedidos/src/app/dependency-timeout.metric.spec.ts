// @ts-nocheck
import axios from 'axios';
import { register } from 'prom-client';
import { MesasHttpClient } from './mesas-http.client';
import { InventarioHttpClient } from './inventario-http.client';

/**
 * R-06: un timeout (ECONNABORTED/ETIMEDOUT) incrementa dependency_timeout_total
 * con el label de la dependencia real (inventario | mesas).
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

describe('dependency_timeout_total (R-06)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inventario: un timeout incrementa el contador con dependency=inventario', async () => {
    const antes = timeoutCount('inventario');
    mockedAxios.post.mockRejectedValueOnce({ code: 'ECONNABORTED' });
    const client = new InventarioHttpClient(tokenService);

    await expect(client.obtenerProductosLote(['p-1'])).rejects.toBeDefined();
    expect(timeoutCount('inventario')).toBe(antes + 1);
  });

  it('mesas: un timeout incrementa el contador con dependency=mesas', async () => {
    const antes = timeoutCount('mesas');
    mockedAxios.get.mockRejectedValueOnce({ code: 'ETIMEDOUT' });
    const client = new MesasHttpClient(tokenService);

    await expect(client.obtenerMesa('mesa-1')).rejects.toBeDefined();
    expect(timeoutCount('mesas')).toBe(antes + 1);
  });
});
