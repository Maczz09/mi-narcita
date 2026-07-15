import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { IdempotencyPurgeModule } from '@org/resiliencia';
import { RoutingKeys } from '@org/contracts';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';

@Module({
  imports: [
    PrismaModule,
    SharedAuthModule,
    ScheduleModule.forRoot(),
    IdempotencyPurgeModule.forService(PrismaService),
    RabbitMQModule.forRoot({
      uri: process.env['RABBITMQ_URI'],
      queue: 'reportes_queue',
      bindings: [RoutingKeys.CuentaCerrada]
    }),
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
