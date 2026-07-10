import { Injectable } from '@nestjs/common';
import { getOrCreateCounter } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead } from '@org/resiliencia';
import axios from 'axios';

export interface CuentaRemota {
  id: string;
  mesaId: string;
  total: number;
  estado: string;
}

/**
 * T-40: cliente HTTP de caja→cuentas extraído del god-service. Encapsula el
 * token de servicio y las llamadas axios; el breaker conserva los umbrales que
 * ya tenía fetchCuenta dentro de AppService.
 *
 * R-12: cada llamada pasa por un bulkhead outbound (pool aislado). Orden:
 * bulkhead por fuera del breaker — los métodos públicos hacen bulkhead.run(...)
 * de los métodos privados con breaker.
 */
@Injectable()
export class CuentasHttpClient {
  private readonly CUENTAS_URL =
    process.env['CUENTAS_SERVICE_URL'] ?? 'http://servicio-cuentas:3000/api';
  private readonly HTTP_TIMEOUT_MS = 5000;
  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  // Bulkhead outbound: pool de sockets/concurrencia aislado para cuentas.
  private readonly bulkhead = createBulkhead('cuentas', {
    maxConcurrent: Number(process.env['CUENTAS_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['CUENTAS_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    // Caja solo llama a cuentas → audiencia fija (T-17).
    return this.serviceTokenService.generateServiceToken('servicio-caja', 'servicio-cuentas');
  }

  private contarTimeout(error: unknown): void {
    const code = (error as { code?: string }).code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      this.timeoutCounter.inc({ dependency: 'cuentas' });
    }
  }

  async fetchCuenta(cuentaId: string): Promise<CuentaRemota> {
    return this.bulkhead.run(() => this.fetchCuentaConBreaker(cuentaId));
  }

  async cerrarCuenta(cuentaId: string, descuento: number) {
    return this.bulkhead.run(() => this.cerrarCuentaConBreaker(cuentaId, descuento));
  }

  @CircuitBreakerOptions({ timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 30_000 })
  private async fetchCuentaConBreaker(cuentaId: string): Promise<CuentaRemota> {
    try {
      const res = await axios.get<CuentaRemota>(`${this.CUENTAS_URL}/${cuentaId}`, {
        timeout: this.HTTP_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${this.getServiceToken()}` },
        httpAgent: this.bulkhead.httpAgent,
        httpsAgent: this.bulkhead.httpsAgent,
      });
      return res.data;
    } catch (error) {
      this.contarTimeout(error);
      throw error;
    }
  }

  // Ruta de dinero: breaker con timeout "pago" (4 s). Los 4xx no abren el
  // circuito; si abre, el catch de app.service degrada a PAGO_SIN_CIERRE_CONFIRMADO.
  @CircuitBreakerOptions({
    timeout: 4000,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async cerrarCuentaConBreaker(cuentaId: string, descuento: number) {
    try {
      const res = await axios.post(
        `${this.CUENTAS_URL}/${cuentaId}/cerrar`,
        { descuento },
        {
          timeout: this.HTTP_TIMEOUT_MS,
          headers: { Authorization: `Bearer ${this.getServiceToken()}` },
          httpAgent: this.bulkhead.httpAgent,
          httpsAgent: this.bulkhead.httpsAgent,
        },
      );
      return res.data as never;
    } catch (error) {
      this.contarTimeout(error);
      throw error;
    }
  }
}
