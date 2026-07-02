import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ServiceTokenService } from '@org/shared-auth';
import { CircuitBreakerOptions } from '@org/resiliencia';
import axios from 'axios';

export interface MesaRemota {
  id: string;
  numero: number;
}

/**
 * T-33: cliente HTTP de pedidos→mesas con circuit breaker (mismos umbrales que
 * caja→cuentas). El mapeo fino de errores (404→NotFound, timeout/caída→503) se
 * conserva como fallback del breaker; los 4xx no cuentan para abrirlo.
 */
@Injectable()
export class MesasHttpClient {
  private readonly logger = new Logger(MesasHttpClient.name);
  private readonly HTTP_TIMEOUT_MS = 5000;
  private readonly MESAS_URL =
    process.env['MESAS_SERVICE_URL'] ?? 'http://servicio-mesas:3000/api';

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  private getServiceToken(): string {
    return this.serviceTokenService.generateServiceToken('servicio-pedidos', 'servicio-mesas');
  }

  @CircuitBreakerOptions({
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    errorFilter: (error: { response?: { status: number } }) =>
      Boolean(error?.response?.status && error.response.status < 500),
  })
  private async fetchMesaRemota(mesaId: string, token: string): Promise<MesaRemota> {
    const { data } = await axios.get<MesaRemota>(`${this.MESAS_URL}/${mesaId}`, {
      timeout: this.HTTP_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async obtenerMesa(mesaId: string): Promise<MesaRemota> {
    let token: string;
    try {
      token = this.getServiceToken();
    } catch {
      throw new ServiceUnavailableException('No se pudo generar token para consultar mesas. Reintente.');
    }

    try {
      return await this.fetchMesaRemota(mesaId, token);
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number }; code?: string; message?: string };
      if (axiosError.response?.status === 404) {
        throw new NotFoundException(`La mesa con ID ${mesaId} no existe o no está sincronizada.`);
      }
      if (axiosError.code === 'EOPENBREAKER') {
        throw new ServiceUnavailableException('El servicio de mesas no está disponible (circuito abierto).');
      }
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        throw new ServiceUnavailableException('El servicio de mesas no responde. Reintente.');
      }
      if (axiosError.code === 'ECONNREFUSED') {
        throw new ServiceUnavailableException('El servicio de mesas no está disponible.');
      }
      this.logger.error(`Error en cold-start de mesa ${mesaId}: ${axiosError.message}`);
      throw new InternalServerErrorException('No se pudo cargar la mesa desde mesas. Reintente.');
    }
  }
}
