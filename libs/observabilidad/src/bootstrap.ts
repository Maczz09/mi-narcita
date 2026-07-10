/**
 * Bootstrap compartido de los microservicios NachoPps (plan T-10).
 *
 * Las 9 copias de `main.ts` diferían solo en: nombre de servicio, cola/DLQ,
 * metadatos de Swagger y puerto por defecto. Este helper centraliza el resto
 * (fail-fast de RABBITMQ_URI, Winston, prefijo `api`, cookieParser, helmet,
 * CORS, ValidationPipe, filtro global, transporte RMQ con DLX y Swagger fuera
 * de producción), replicando exactamente lo que cada `main.ts` hacía.
 *
 * IMPORTANTE — orden de carga: `initTracing()` debe ejecutarse ANTES de importar
 * Nest para que la auto-instrumentación de OpenTelemetry parchee http/amqp/pg.
 * Por eso este módulo vive FUERA del barrel `@org/observabilidad` (que es ligero)
 * y se importa en un segundo paso desde `@org/observabilidad/bootstrap`, después
 * de la llamada a `initTracing` en `main.ts`.
 */
import { Logger, Type, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { buildHelmetOptions } from '@org/shared-auth';
import { GlobalExceptionFilter } from './lib/global-exception.filter';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export interface BootstrapSwaggerConfig {
  title: string;
  description: string;
  version?: string;
}

export interface BootstrapOptions {
  /** Nombre del servicio (debe coincidir con el de `initTracing`). */
  serviceName: string;
  /** AppModule raíz del servicio. */
  module: Type<unknown>;
  /** Cola RMQ consumidora; si se omite, no se levanta microservicio (p. ej. identidad/reservas). */
  queue?: string;
  /** Metadatos de Swagger; si se omite, no se expone Swagger. */
  swagger?: BootstrapSwaggerConfig;
  /** Puerto por defecto si no hay `PORT` en el entorno. */
  defaultPort: number;
}

export async function bootstrapNachoppsService(options: BootstrapOptions): Promise<void> {
  const { serviceName, module, queue, swagger, defaultPort } = options;

  if (!process.env.RABBITMQ_URI) {
    throw new Error('RABBITMQ_URI environment variable is required');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }

  const app = await NestFactory.create(module, { bufferLogs: true });
  // Logger JSON estructurado con trace_id/correlationId (plan 5.1).
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
  app.use(helmet(buildHelmetOptions()));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  if (queue) {
    app.connectMicroservice({
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URI],
        queue,
        queueOptions: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': 'NACHOPPS_DLX',
            'x-dead-letter-routing-key': `dlq.${queue}`,
          },
        },
        exchange: 'nachopps_exchange',
        exchangeType: 'topic',
        noAck: false,
        // Backpressure: cap de mensajes en vuelo por consumidor (R-09). No toca
        // la declaración de colas → sin riesgo de redeclare.
        prefetchCount: Number(process.env.RMQ_PREFETCH ?? 20),
      },
    });
  }

  if (swagger && process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(swagger.title)
      .setDescription(swagger.description)
      .setVersion(swagger.version ?? '1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    Logger.log(`📄 Swagger: http://localhost:${process.env.PORT || defaultPort}/api/docs`);
  }

  const port = process.env.PORT || defaultPort;
  if (queue) {
    await app.startAllMicroservices();
  }
  await app.listen(port);
  const nombre = serviceName.replace('servicio-', '');
  Logger.log(`🚀 Servicio ${nombre} corriendo en: http://localhost:${port}/${globalPrefix}`);
  if (queue) {
    Logger.log(`📡 Microservicio RabbitMQ escuchando en la cola: ${queue}`);
  }
}
