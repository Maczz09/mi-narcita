/**
 * Exporta el contrato OpenAPI de cada servicio a docs/servicios/<svc>/openapi.json
 * como artefacto versionado (gobierno de servicios: el contrato no vive solo en
 * el código ni solo en el Swagger runtime).
 *
 * No necesita infra: NestFactory.create() instancia el árbol de módulos pero los
 * hooks onModuleInit (Prisma.$connect, canal RabbitMQ) solo corren en app.init()/
 * listen(), que nunca se llaman. Las env se rellenan con valores dummy.
 *
 * Uso: npm run contratos:openapi
 */
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Env dummy ANTES de importar los módulos (fail-fast de shared-auth/Prisma).
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.JWT_PUBLIC_KEY ||= publicKey;
process.env.JWT_PRIVATE_KEY ||= privateKey;
process.env.SERVICE_JWT_SECRET ||= 'export-openapi-dummy';
process.env.RABBITMQ_URI ||= 'amqp://localhost:5672';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/db?schema=public';
process.env.NODE_ENV ||= 'development';

// Mismos title/description que cada apps/<svc>/src/main.ts pasa al bootstrap.
const SERVICES: Array<{ name: string; title: string; description: string }> = [
  { name: 'servicio-caja', title: 'Nachopps Restobar — API Caja', description: 'Turnos, pagos mixtos, arqueos y caja chica' },
  { name: 'servicio-cuentas', title: 'Nachopps Restobar — API Cuentas', description: 'Gestión de cuentas por mesa, división y cierre' },
  { name: 'servicio-identidad', title: 'Nachopps Restobar — API Identidad', description: 'Autenticación JWT, gestión de usuarios, roles y refresh tokens' },
  { name: 'servicio-inventario', title: 'Nachopps Restobar — API Inventario', description: 'Productos, categorías, stock y validación por lote' },
  { name: 'servicio-mesas', title: 'Nachopps Restobar — API Mesas', description: 'Mapa de mesas, estados y liberación automática' },
  { name: 'servicio-notificaciones', title: 'Nachopps Restobar — API Notificaciones', description: 'WebSockets, push notifications y auditoría de eventos' },
  { name: 'servicio-pedidos', title: 'Nachopps Restobar — API Pedidos', description: 'Comandas, saga de pedidos y KDS' },
  { name: 'servicio-reportes', title: 'Nachopps Restobar — API Reportes', description: 'Snapshots, ventas diarias y dashboard' },
  { name: 'servicio-reservas', title: 'Nachopps Restobar — API Reservas', description: 'Agenda, confirmación y disponibilidad de reservas' },
];

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');

  let failures = 0;
  for (const svc of SERVICES) {
    try {
      const { AppModule } = await import(join(__dirname, '..', 'apps', svc.name, 'src', 'app', 'app.module'));
      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api'); // igual que el bootstrap compartido

      const config = new DocumentBuilder()
        .setTitle(svc.title)
        .setDescription(svc.description)
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const outPath = join(__dirname, '..', 'docs', 'servicios', svc.name, 'openapi.json');
      writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');
      console.log(`✔ ${svc.name}: ${Object.keys(document.paths).length} paths -> ${outPath}`);

      await app.close();
    } catch (err) {
      failures++;
      console.error(`✖ ${svc.name}: ${(err as Error).message}`);
    }
    // prom-client usa un registry global: limpiarlo evita colisiones de métricas
    // entre las 9 apps instanciadas en el mismo proceso.
    try {
      const { register } = await import('prom-client');
      register.clear();
    } catch { /* prom-client no disponible: irrelevante para el export */ }
  }

  // amqp-connection-manager puede dejar timers de reconexión colgando: salir explícito.
  process.exit(failures > 0 ? 1 : 0);
}

void main();
