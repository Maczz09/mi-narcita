import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-pedidos');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-pedidos', module: AppModule, queue: 'pedidos_queue', defaultPort: 3000,
  swagger: { title: apiTitle('Pedidos'), description: 'Comandas, saga de pedidos y KDS' },
});
