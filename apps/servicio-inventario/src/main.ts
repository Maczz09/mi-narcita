import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-inventario');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-inventario', module: AppModule, queue: 'inventario_queue', defaultPort: 3007,
  swagger: { title: apiTitle('Inventario'), description: 'Productos, categorías, stock y validación por lote' },
});
