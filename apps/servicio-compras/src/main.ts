import { initTracing } from '@org/observabilidad';
initTracing('servicio-compras');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-compras', module: AppModule, defaultPort: 3012,
  swagger: { title: 'Nachopps Restobar — API Compras', description: 'Proveedores, órdenes de compra, recepciones y comprobantes' },
});
