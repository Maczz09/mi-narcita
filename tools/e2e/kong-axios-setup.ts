import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { waitForPortOpen } from '@nx/node/utils';
import axios, { type AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';

const LOCAL_SERVICE_SECRET = 'nachopps_service_secret_dev';
const CREATE_PATCHED = Symbol.for('nachopps.e2e.axios.createPatched');

type PatchedAxios = typeof axios & {
  [CREATE_PATCHED]?: boolean;
};

export async function waitForE2eTarget(): Promise<void> {
  console.log('\nSetting up...\n');

  const localServe = process.env.E2E_USE_LOCAL_SERVE === 'true';
  if (localServe) {
    const host = process.env.HOST ?? 'localhost';
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    await waitForPortOpen(port, { host });
    return;
  }

  const url = new URL(gatewayBaseUrl());
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  await waitForPortOpen(port, { host: url.hostname });
}

export function setupKongAxios(service: string): void {
  const localServe = process.env.E2E_USE_LOCAL_SERVE === 'true';
  if (localServe) {
    setupLocalAxios();
    return;
  }

  const token = userJwt();
  configureInstance(axios, service, token);
  patchCreate(service, token);
}

function setupLocalAxios(): void {
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '3000';
  axios.defaults.baseURL = `http://${host}:${port}`;

  const token = jwt.sign(
    { sub: 'e2e-tester', email: 'e2e@tester.com', rol: 'ADMIN' },
    process.env.SERVICE_JWT_SECRET || LOCAL_SERVICE_SECRET,
    { expiresIn: '1h' },
  );
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

function configureInstance(instance: AxiosInstance, service: string, token: string): void {
  instance.defaults.baseURL = gatewayBaseUrl();
  instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  process.env.RABBITMQ_URI ??= 'amqp://nachopps:nachopps_secret@localhost:5672';

  instance.interceptors.request.use((config) => {
    if (typeof config.url === 'string' && config.url.startsWith('/api')) {
      const rest = config.url.replace(/^\/api/, '');
      config.url = `/${service}${rest}`;
    }
    return config;
  });
}

function patchCreate(service: string, token: string): void {
  const patchedAxios = axios as PatchedAxios;
  if (patchedAxios[CREATE_PATCHED]) return;

  const originalCreate = axios.create.bind(axios);
  axios.create = (config = {}) => {
    const instance = originalCreate(config);
    configureInstance(instance, service, token);
    return instance;
  };

  patchedAxios[CREATE_PATCHED] = true;
}

function gatewayBaseUrl(): string {
  return (process.env.E2E_GATEWAY_URL ?? process.env.API_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
}

function userJwt(): string {
  return jwt.sign(
    { sub: 'e2e-tester', email: 'e2e@tester.com', rol: 'ADMIN' },
    privateKey(),
    { algorithm: 'RS256', issuer: 'nachopps-identidad', expiresIn: '1h' },
  );
}

function privateKey(): string {
  // Solo el override explícito de e2e, NUNCA el JWT_PRIVATE_KEY genérico: ese
  // nombre lo carga Nx automáticamente desde el `.env` de la raíz, que es el
  // par de PROD (docker-compose.prod.yml) y NO coincide con el par dev fijo
  // de infra/secrets/jwt-dev.env que usa el stack local — firmar con el
  // equivocado produce "Invalid signature" en Kong/servicios.
  const fromEnv = process.env.E2E_JWT_PRIVATE_KEY;
  if (fromEnv) return normalizePem(fromEnv);

  const fromDocker = dockerEnv('nachopps-servicio-identidad', 'JWT_PRIVATE_KEY');
  if (fromDocker) return normalizePem(fromDocker);

  const compose = readFileSync(join(process.cwd(), 'infra/docker-compose.yml'), 'utf8');
  const match = compose.match(/x-jwt-private-key:\s*&jwt_private\s*'([^']+)'/s);
  if (!match) throw new Error('No se pudo encontrar x-jwt-private-key en infra/docker-compose.yml');
  return normalizePem(match[1]);
}

function dockerEnv(container: string, key: string): string | null {
  try {
    const output = execFileSync(
      'docker',
      ['exec', container, 'sh', '-lc', `printf '%s' "$${key}"`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output || null;
  } catch {
    return null;
  }
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n');
}
