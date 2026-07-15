#!/usr/bin/env node
/**
 * Caos 4.2 — baja de una base de datos individual (Fase 4).
 *
 * "Dar de baja" = docker compose stop del contenedor db-<servicio>; no hay
 * killSwitch que implementar, cada servicio ya es su propio contenedor.
 *
 * Verifica:
 *   1. El servicio dueño de la BD sigue vivo (no crashea) mientras la BD está
 *      caída — las queries deben fallar rápido (B-1: connectionTimeoutMillis
 *      5s), no colgarse.
 *   2. Servicios NO relacionados con esa BD (sin dependencia directa) no
 *      devuelven 5xx — prueba que no hay cascada.
 *   3. Si el servicio afectado es productor de eventos, los eventos generados
 *      durante la caída (o justo antes) quedan en el outbox (no se pierden) y
 *      drenan al volver la BD (verify-postload).
 *   4. Al reanudar la BD, el servicio reconecta solo (pool pg re-crea
 *      conexiones) y vuelve a servir 2xx sin reiniciar el contenedor.
 *
 * Uso:  node stress-tests/run-chaos-db-down.js --db mesas
 *       node stress-tests/run-chaos-db-down.js --db inventario --duration 30
 */
const fs = require('node:fs');
const { execFileSync, execSync } = require('node:child_process');
const { snapshotBaseline, verifyPostLoad } = require('./k6/verify-postload');

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const REPORT_DIR = 'stress-tests/reports';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SERVICIO = arg('db', 'mesas');
const DURATION_SEC = Number(arg('duration', 20));

// Mapa servicio → { db, dependientes directos (llaman a este servicio por HTTP
// o consumen sus eventos), independiente (no debería verse afectado) }
const TOPOLOGIA = {
  identidad: { db: 'db-identidad', dependeDe: [], independiente: ['reservas', 'inventario'] },
  mesas: { db: 'db-mesas', dependeDe: ['pedidos (bulkhead HTTP)'], independiente: ['reservas', 'reportes'] },
  pedidos: { db: 'db-pedidos', dependeDe: ['cuentas (evento pedido.creado)', 'inventario (evento pedido.creado)', 'caja (evento pedido.entregado)'], independiente: ['reservas', 'identidad'] },
  cuentas: { db: 'db-cuentas', dependeDe: ['caja (bulkhead HTTP)', 'mesas (evento cuenta.abierta/cerrada)'], independiente: ['reservas', 'inventario'] },
  reservas: { db: 'db-reservas', dependeDe: ['notificaciones (evento reserva.creada)'], independiente: ['pedidos', 'inventario', 'caja'] },
  inventario: { db: 'db-inventario', dependeDe: ['pedidos (bulkhead HTTP)'], independiente: ['reservas', 'identidad'] },
  notificaciones: { db: 'db-notificaciones', dependeDe: [], independiente: ['pedidos', 'cuentas', 'reservas'] },
  caja: { db: 'db-caja', dependeDe: ['reportes (evento cuenta.cerrada, indirecto vía cuentas)'], independiente: ['reservas', 'mesas'] },
  reportes: { db: 'db-reportes', dependeDe: [], independiente: ['pedidos', 'cuentas', 'mesas'] },
};

if (!TOPOLOGIA[SERVICIO]) {
  console.error(`Servicio desconocido: ${SERVICIO}. Usa uno de: ${Object.keys(TOPOLOGIA).join(', ')}`);
  process.exit(2);
}
const { db: DB_CONTAINER_NAME, independiente } = TOPOLOGIA[SERVICIO];
const DB_CONTAINER = `nachopps-${DB_CONTAINER_NAME}`;
const SERVICIO_CONTAINER = `nachopps-servicio-${SERVICIO}`;

const results = [];
let token = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(method, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token !== false && token) headers.Authorization = `Bearer ${token}`;
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - start, error: err.message };
  }
}

async function login() {
  const res = await fetch(`${BASE}/identidad/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nachopps.pe', password: 'nachopps123' }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Login falló: ${res.status}`);
  token = data.access_token;
}

function isRunning(container) {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', container], { encoding: 'utf8' }).trim() === 'true';
  } catch {
    return false;
  }
}
function restartCount(container) {
  return Number.parseInt(execFileSync('docker', ['inspect', '-f', '{{.RestartCount}}', container], { encoding: 'utf8' }).trim(), 10);
}

async function main() {
  console.log(`\n💥 Caos: baja de ${DB_CONTAINER} (dueño: servicio-${SERVICIO}) — ${DURATION_SEC}s\n`);
  await login();
  const baseline = await snapshotBaseline().catch(() => ({ failed: 0, dlq: 0 }));
  const restartsBefore = restartCount(SERVICIO_CONTAINER);

  execFileSync('docker', ['stop', DB_CONTAINER], { stdio: 'ignore' });
  record('BD detenida (docker stop)', true, DB_CONTAINER);

  // 1. El servicio dueño no muere, y las queries fallan RÁPIDO (no >8s: prueba
  //    B-1, connectionTimeoutMillis=5s en vez de espera infinita).
  await sleep(2000);
  const probe = await req('GET', `/${SERVICIO}`);
  record(
    `servicio-${SERVICIO} responde rápido con su BD caída (no cuelga)`,
    probe.ms < 8000,
    `status=${probe.status} en ${probe.ms}ms`,
  );
  record(`Contenedor servicio-${SERVICIO} sigue vivo (no crashea)`, isRunning(SERVICIO_CONTAINER) && restartCount(SERVICIO_CONTAINER) === restartsBefore);

  // 2. Servicios independientes no ven 5xx (sin cascada).
  let sinCascada = 0;
  for (const otro of independiente) {
    const nombre = otro.split(' ')[0];
    const r = await req('GET', `/${nombre}`);
    const ok = r.status > 0 && r.status < 500;
    if (ok) sinCascada += 1;
    record(`servicio-${nombre} (independiente) sin 5xx`, ok, `status=${r.status}`);
  }
  record('Sin cascada a servicios independientes', sinCascada === independiente.length, `${sinCascada}/${independiente.length}`);

  await sleep(DURATION_SEC * 1000);

  // 3. Reanudar
  execFileSync('docker', ['start', DB_CONTAINER], { stdio: 'ignore' });
  record('BD reanudada (docker start)', true);

  let healthy = false;
  for (let i = 0; i < 30 && !healthy; i += 1) {
    await sleep(2000);
    healthy = isRunning(DB_CONTAINER) && (() => {
      try {
        execSync(`docker exec ${DB_CONTAINER} pg_isready -U nachopps`, { stdio: 'ignore' });
        return true;
      } catch { return false; }
    })();
  }
  record('BD healthy tras reanudar', healthy);

  // 4. Servicio reconecta solo (sin reinicio de contenedor) y vuelve a servir 2xx.
  let recuperado = false;
  for (let i = 0; i < 30 && !recuperado; i += 1) {
    await sleep(2000);
    const r = await req('GET', `/${SERVICIO}`);
    recuperado = r.ok;
  }
  record(`servicio-${SERVICIO} reconecta solo tras reanudar la BD (sin reiniciar contenedor)`, recuperado && restartCount(SERVICIO_CONTAINER) === restartsBefore);

  // 5. Recuperación de outbox/DLQ (si aplica) dentro de N minutos.
  const postload = await verifyPostLoad(baseline, { timeoutSec: 120 }).catch((err) => ({ pass: false, checks: [{ name: 'postload', pass: false, detail: err.message }] }));
  for (const c of postload.checks) record(`Recuperación: ${c.name}`, c.pass, c.detail);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = results.filter((r) => r.ok).length;
  const md = [
    `# Caos: baja de BD — servicio-${SERVICIO} (${DB_CONTAINER}) — ${new Date().toISOString()}`,
    '',
    `Duración de la caída: ${DURATION_SEC}s`,
    `Resultado: **${passed}/${results.length}** verificaciones OK`,
    '',
    '| Verificación | Resultado | Detalle |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail ?? ''} |`),
    '',
  ].join('\n');
  const file = `${REPORT_DIR}/chaos-db-${SERVICIO}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(file, md);
  console.log(`\n📄 Reporte: ${file}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
