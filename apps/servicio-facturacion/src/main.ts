import { initTracing } from '@org/observabilidad';
initTracing('servicio-facturacion');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-facturacion', module: AppModule, queue: 'facturacion_queue', defaultPort: 3011,
  swagger: { title: 'Nachopps Restobar — API Facturación Electrónica', description: 'Emisión de boletas y facturas SUNAT (XMLDSig)' },
});
