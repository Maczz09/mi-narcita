import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function makeHost(method = 'GET', url = '/recurso') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method, url };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  it('mapea una HttpException a su status y mensaje', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = makeHost('POST', '/pedidos');

    filter.catch(new BadRequestException('payload inválido'), host as unknown as ArgumentsHost);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/pedidos',
        message: 'payload inválido',
      }),
    );
  });

  it('una excepción no-HTTP se normaliza a 500 con mensaje genérico', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = makeHost();

    filter.catch(new Error('boom interno'), host as unknown as ArgumentsHost);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });

  it('extrae .message cuando getResponse devuelve un objeto', () => {
    const filter = new GlobalExceptionFilter();
    const { host, json } = makeHost();

    filter.catch(
      new HttpException({ message: 'detalle estructurado', error: 'X' }, HttpStatus.CONFLICT),
      host as unknown as ArgumentsHost,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.CONFLICT, message: 'detalle estructurado' }),
    );
  });

  it('T-14: un P2002 de Prisma → 409 con errorCode P2002', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = makeHost('POST', '/pedidos');

    filter.catch(Object.assign(new Error('unique'), { code: 'P2002' }), host as unknown as ArgumentsHost);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.CONFLICT, errorCode: 'P2002' }),
    );
  });

  it('T-14: message array de ValidationPipe se devuelve como array', () => {
    const filter = new GlobalExceptionFilter();
    const { host, json } = makeHost('POST', '/pedidos');

    filter.catch(
      new BadRequestException(['campo requerido', 'debe ser número']),
      host as unknown as ArgumentsHost,
    );

    const payload = json.mock.calls[0][0] as { message: unknown };
    expect(Array.isArray(payload.message)).toBe(true);
    expect(payload.message).toEqual(['campo requerido', 'debe ser número']);
  });

  it('T-14: error genérico → 500 con errorCode HTTP_500', () => {
    const filter = new GlobalExceptionFilter();
    const { host, json } = makeHost();

    filter.catch(new Error('boom'), host as unknown as ArgumentsHost);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, errorCode: 'HTTP_500' }),
    );
  });

  it('incluye timestamp ISO y el path de la petición', () => {
    const filter = new GlobalExceptionFilter();
    const { host, json } = makeHost('DELETE', '/mesas/1');

    filter.catch(new BadRequestException('x'), host as unknown as ArgumentsHost);

    const payload = json.mock.calls[0][0] as { path: string, timestamp: string };
    expect(payload.path).toBe('/mesas/1');
    expect(() => new Date(payload.timestamp).toISOString()).not.toThrow();
  });
});
