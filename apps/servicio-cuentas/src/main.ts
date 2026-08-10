import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-cuentas');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-cuentas', module: AppModule, queue: 'cuentas_queue', defaultPort: 3005,
  swagger: { title: apiTitle('Cuentas'), description: 'Gestión de cuentas por mesa, división y cierre' },
});
