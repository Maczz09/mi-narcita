// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { MesasHttpClient } from './mesas-http.client';
import { ServiceTokenService } from '@org/shared-auth';
import { NotFoundException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    CircuitBreakerOptions: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  };
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MesasHttpClient', () => {
  let client: MesasHttpClient;
  let serviceTokenService: jest.Mocked<ServiceTokenService>;

  beforeEach(async () => {
    serviceTokenService = {
      generateServiceToken: jest.fn(),
    } as unknown as jest.Mocked<ServiceTokenService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MesasHttpClient,
        { provide: ServiceTokenService, useValue: serviceTokenService },
      ],
    }).compile();

    client = module.get<MesasHttpClient>(MesasHttpClient);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(client).toBeDefined();
  });

  describe('obtenerMesa', () => {
    it('should throw ServiceUnavailableException if token generation fails', async () => {
      serviceTokenService.generateServiceToken.mockImplementation(() => {
        throw new Error('Token error');
      });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('No se pudo generar token para consultar mesas. Reintente.')
      );
    });

    it('should fetch mesa successfully', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      const expectedMesa = { id: 'mesa-1', numero: 5 };
      mockedAxios.get.mockResolvedValueOnce({ data: expectedMesa });

      const result = await client.obtenerMesa('mesa-1');
      expect(result).toEqual(expectedMesa);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/mesas/mesa-1'),
        { timeout: 5000, headers: { Authorization: 'Bearer mock-token' } }
      );
    });

    it('should throw NotFoundException on 404', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new NotFoundException('La mesa con ID mesa-1 no existe o no está sincronizada.')
      );
    });

    it('should throw ServiceUnavailableException on open breaker', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValueOnce({ code: 'EOPENBREAKER' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no está disponible (circuito abierto).')
      );
    });

    it('should throw ServiceUnavailableException on timeout', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValueOnce({ code: 'ECONNABORTED' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no responde. Reintente.')
      );
    });

    it('should throw ServiceUnavailableException on connection refused', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValueOnce({ code: 'ECONNREFUSED' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new ServiceUnavailableException('El servicio de mesas no está disponible.')
      );
    });

    it('should throw InternalServerErrorException on other errors', async () => {
      serviceTokenService.generateServiceToken.mockReturnValue('mock-token');
      mockedAxios.get.mockRejectedValueOnce({ message: 'Random error' });

      await expect(client.obtenerMesa('mesa-1')).rejects.toThrow(
        new InternalServerErrorException('No se pudo cargar la mesa desde mesas. Reintente.')
      );
    });
  });
});
