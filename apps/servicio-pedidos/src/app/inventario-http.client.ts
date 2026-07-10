import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getOrCreateCounter } from '@org/observabilidad';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions, createBulkhead } from '@org/resiliencia';
import axios from 'axios';

export interface ProductoRemotoLote {
  id: string;
  nombre: string;
  precio: number;
  stockActual: number | null;
  categoria?: { nombre: string } | null;
  disponible: boolean;
}

/**
 * T-33: cliente HTTP de pedidos→inventario con circuit breaker (mismos umbrales
 * que caja→cuentas). El mapeo fino de errores se conserva como fallback del
 * breaker; los 4xx no cuentan para abrirlo.
 */
@Injectable()
export class InventarioHttpClient {
  private readonly logger = new Logger(InventarioHttpClient.name);
  private readonly HTTP_TIMEOUT_MS = 5000;
  private readonly INVENTARIO_URL =
    process.env['INVENTARIO_SERVICE_URL'] ?? 'http://servicio-inventario:3000/api';

  private readonly timeoutCounter = getOrCreateCounter(
    'dependency_timeout_total', 'Timeouts en llamadas a dependencias con breaker', ['dependency'],
  );
  // Bulkhead outbound: pool de sockets/concurrencia aislado para inventario.
  private readonly bulkhead = createBulkhead('inventario', {
    maxConcurrent: Number(process.env['INVENTARIO_POOL_MAX'] ?? 10),
    maxQueue: Number(process.env['INVENTARIO_POOL_MAX'] ?? 10),
  });

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    return this.serviceTokenService.generateServiceToken('servicio-pedidos', 'servicio-inventario');
  }

  @CircuitBreakerOptions({
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async fetchProductosLote(ids: string[], token: string): Promise<ProductoRemotoLote[]> {
    const { data } = await axios.post<ProductoRemotoLote[]>(
      `${this.INVENTARIO_URL}/productos/lote`,
      { ids },
      {
        timeout: this.HTTP_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${token}` },
        httpAgent: this.bulkhead.httpAgent,
        httpsAgent: this.bulkhead.httpsAgent,
      },
    );
    return Array.isArray(data) ? data : ((data as { productos?: ProductoRemotoLote[] }).productos ?? []);
  }

  async obtenerProductosLote(ids: string[]): Promise<ProductoRemotoLote[]> {
    let token: string;
    try {
      token = this.getServiceToken();
    } catch {
      throw new ServiceUnavailableException('No se pudo generar token para inventario. Reintente.');
    }

    try {
      // Bulkhead por fuera del breaker: aísla el recurso antes de fallar rápido.
      return await this.bulkhead.run(() => this.fetchProductosLote(ids, token));
    } catch (error: unknown) {
      // Shed load del bulkhead (503): propaga tal cual, no lo degrades a 500.
      if (error instanceof ServiceUnavailableException) throw error;
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      if (axiosError.code === 'EOPENBREAKER') {
        throw new ServiceUnavailableException('El servicio de inventario no está disponible (circuito abierto).');
      }

      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        this.timeoutCounter.inc({ dependency: 'inventario' });
        this.logger.warn({
          operation: 'obtenerProductosLote',
          dependency: 'inventario-api',
          durationMs: this.HTTP_TIMEOUT_MS,
          errorCode: 'DEPENDENCY_TIMEOUT',
          resultingState: 'STOCK_VALIDATION_PENDING',
          message: 'Timeout fetching from inventory. Flow marked as pending validation.'
        });
        throw new ServiceUnavailableException('El servicio de inventario no responde. Reintente.');
      }
      if (axiosError.code === 'ECONNREFUSED') {
        throw new ServiceUnavailableException('El servicio de inventario no está disponible.');
      }
      this.logger.error(`Error en cold-start de productos: ${axiosError.message}`);
      throw new InternalServerErrorException('No se pudieron cargar productos desde inventario. Reintente.');
    }
  }
}
