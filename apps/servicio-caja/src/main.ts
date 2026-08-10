import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-caja');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-caja', module: AppModule, queue: 'caja_queue', defaultPort: 3009,
  swagger: { title: apiTitle('Caja'), description: 'Turnos, pagos mixtos, arqueos y caja chica' },
});
