import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OperableLog } from './operable-log';

/**
 * Normaliza el `message` de respuesta: un array de ValidationPipe se conserva
 * como array (T-14); el objeto de `getResponse()` se reduce a su `.message`; un
 * string se pasa tal cual.
 */
function normalizarMessage(message: unknown): string | string[] {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message as string[];
  if (message && typeof message === 'object') {
    const inner = (message as { message?: unknown }).message;
    if (Array.isArray(inner)) return inner as string[];
    if (typeof inner === 'string') return inner;
  }
  return 'Internal server error';
}

/**
 * Filtro global de excepciones unificado (T-11).
 *
 * Antes existían 9 copias idénticas (una por servicio); ahora vive en
 * `libs/observabilidad` y lo aplica por defecto `bootstrapNachoppsService`.
 * Normaliza cualquier excepción a un JSON estable y registra el error.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: unknown =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // T-14: código de error correlacionable. Prisma lo fija ('P2002'/'P2025');
    // en su defecto, un default 'HTTP_<status>'.
    let errorCode: string | undefined;

    if (exception && typeof exception === 'object' && 'code' in exception) {
      const code = (exception as { code?: string }).code;
      if (code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Conflicto: registro duplicado (P2002)';
        errorCode = 'P2002';
      } else if (code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Registro no encontrado (P2025)';
        errorCode = 'P2025';
      }
    }

    errorCode ??= `HTTP_${status}`;
    const responseMessage = normalizarMessage(message);

    // T-14: log operable (sin PII ni body); el stack va como segundo argumento.
    this.logger.error(
      {
        operation: 'httpException',
        errorCode,
        message: `HTTP ${status} - ${request.method} ${request.url}`,
      } satisfies OperableLog,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      errorCode,
      message: responseMessage,
    });
  }
}
