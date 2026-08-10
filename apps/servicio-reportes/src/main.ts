import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-reportes');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-reportes', module: AppModule, queue: 'reportes_queue', defaultPort: 3004,
  swagger: { title: apiTitle('Reportes'), description: 'Snapshots, ventas diarias y dashboard' },
});
