import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@org/shared-rabbitmq';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxAdminModule, OutboxModule } from '@org/resiliencia';
import { PrismaService } from '../prisma/prisma.service';
import { AppController } from './app.controller';
import { ReservasService } from './reservas.service';
import { ObservabilidadModule, HealthModule } from '@org/observabilidad';
import { SharedAuthModule, JwtAuthGuard } from '@org/shared-auth';

@Module({
  imports: [
    ObservabilidadModule,
    HealthModule.forRoot(PrismaService),
    SharedAuthModule,
    PrismaModule,
    OutboxAdminModule.forRoot(PrismaService),
    OutboxModule.forService(PrismaService, { producer: 'servicio-reservas' }),
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot(process.env['RABBITMQ_URI']),
  ],
  controllers: [AppController],
  providers: [
    ReservasService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
