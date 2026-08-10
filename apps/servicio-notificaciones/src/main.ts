import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-notificaciones');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-notificaciones', module: AppModule, queue: 'notificaciones_queue', defaultPort: 3008,
  swagger: { title: apiTitle('Notificaciones'), description: 'WebSockets, push notifications y auditoría de eventos' },
});
