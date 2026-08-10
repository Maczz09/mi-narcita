import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-mesas');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-mesas', module: AppModule, queue: 'mesas_queue', defaultPort: 3002,
  swagger: { title: apiTitle('Mesas'), description: 'Mapa de mesas, estados y liberación automática' },
});
