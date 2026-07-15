import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { EventsController } from './events.controller';
import { AppService } from './app.service';
import { CuentasHttpClient } from './cuentas-http.client';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule, IdempotencyPurgeModule, IdempotencyInterceptor, IDEMPOTENCY_DB } from '@org/resiliencia';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleModule } from '@nestjs/schedule';
import { RoutingKeys } from '@org/contracts';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-caja' }),
    IdempotencyPurgeModule.forService(PrismaService),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'caja_queue',
      bindings: ['pedido.entregado', RoutingKeys.CuentaAbierta, RoutingKeys.CuentaCerrada]
    }),
  ],
  controllers: [AppController, EventsController],
  providers: [
    AppService,
    CuentasHttpClient,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    IdempotencyInterceptor,
    { provide: IDEMPOTENCY_DB, useExisting: PrismaService },
  ],
})
export class AppModule {}
