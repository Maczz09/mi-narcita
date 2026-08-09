import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL!,
    // Solo se usa para `migrate diff`/drift-check (plan 1.2); en dev normal
    // queda undefined y Prisma crea una shadow DB temporal por su cuenta.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
