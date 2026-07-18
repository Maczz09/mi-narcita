#!/usr/bin/env node
/**
 * Caos — corte a mitad de flujo con reanudación automática (Fase 4, T-15/T-16).
 *
 * Reproduce el experimento que originó el plan de resiliencia e2e: se corre el
 * flujo completo mesa→pedido→cuenta→pago y, con la cuenta abierta y a punto de
 * cobrar, se detiene `nachopps-servicio-cuentas`. Verifica que:
 *
 *   1. El pago se ACEPTA igual (201 degradado): caja persiste la transacción y,
 *      como el cierre remoto no está disponible, degrada honestamente a
 *      "cierre de cuenta en proceso" (PAGO_SIN_CIERRE_CONFIRMADO) — nunca cuelga
 *      ni devuelve el error crudo del gateway.
 *   2. Al reanudar cuentas (`docker start`), el sistema se cura SOLO: el evento
 *      `pago.registrado` del outbox se entrega, la cuenta se cierra y la mesa se
 *      libera sin intervención (mecanismo outbox + idempotencia; el cron de
 *      reconciliación H-2 es el backstop).
 *   3. Sin pérdida ni duplicación: verify-postload confirma outbox drenada, sin
 *      FAILED nuevos y sin crecimiento de DLQ.
 *
 * `docker stop` es un apagado graceful. Para ejercitar el redelivery de mensajes
 * sin ack y el rescate de PUBLISHING huérfanos (garantías que el stop no toca),
 * usar --kill (ver run-chaos-mid-flow.js --kill, T-16).
 *
 * Uso:  node stress-tests/run-chaos-mid-flow.js
 *       node stress-tests/run-chaos-mid-flow.js --kill
 *       node stress-tests/run-chaos-mid-flow.js --recovery-timeout 240
 *
 * Requiere el stack Docker levantado (infra/docker-compose.yml).
 */
const fs = require('node:fs');
const { execFileSync, execSync } = require('node:child_process');
const { snapshotBaseline, verifyPostLoad, verifyResilienceMetrics } = require('./k6/verify-postload');

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const REPORT_DIR = 'stress-tests/reports';
const CUENTAS_CONTAINER = 'nachopps-servicio-cuentas';
// Puerto host del contenedor de cuentas (infra/docker-compose.yml: '3005:3000').
const CUENTAS_HOST = process.env.CUENTAS_HOST || 'http://localhost:3005';
// BD de caja (infra/docker-compose.yml: db-caja '5437:5432', caja_db) — para la
// verificación directa de PUBLISHING huérfanos tras un crash (T-16).
const CAJA_DB_URL = process.env.CAJA_DB_URL || 'postgresql://nachopps:secret@localhost:5437/caja_db';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const KILL = process.argv.includes('--kill');
const DOCKER_DOWN = KILL ? 'kill' : 'stop';
const RECOVERY_TIMEOUT_SEC = Number(arg('recovery-timeout', 180));

const results = [];
let token = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(method, path, body = null, opts = {}) {
  const base = opts.base || BASE;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token !== false && token) headers.Authorization = `Bearer ${token}`;
  const start = Date.now();
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* sin body */ }
    return { ok: res.ok, status: res.status, ms: Date.now() - start, data };
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

// La cuenta se abre async (pedido → outbox → RabbitMQ → cuentas); reintenta.
async function waitForCuenta(mesaId, maxWaitMs = 8000, stepMs = 400) {
  const deadline = Date.now() + maxWaitMs;
  let last;
  while (Date.now() < deadline) {
    await sleep(stepMs);
    last = await req('GET', `/cuentas/mesa/${mesaId}`);
    if (last.ok && last.data?.id) return last;
  }
  return last;
}

function docker(...args) {
  execFileSync('docker', args, { stdio: 'ignore' });
}
function isRunning(container) {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', container], { encoding: 'utf8' }).trim() === 'true';
  } catch { return false; }
}

// cuentas sano por su puerto host (independiente de la caché DNS de Kong).
async function cuentasArribaDirecto() {
  const r = await req('GET', '/api/health/ready', null, { base: CUENTAS_HOST, token: false });
  return r.ok;
}

// T-16: tras un crash real (docker kill), el proceso muerto puede dejar eventos
// del outbox de caja en PUBLISHING sin marcar. El cron de rescate (PUBLISHING
// > 60s → PENDING, cada minuto) debe recuperarlos; verificamos que ninguno
// quede atascado en PUBLISHING > 90s. `docker stop` (graceful) no ejercita esto.
async function verificarPublishingRescatado() {
  const { Client } = require('pg');
  const db = new Client({ connectionString: CAJA_DB_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM outbox_events
       WHERE status = 'PUBLISHING' AND "claimedAt" < now() - interval '90 seconds'`,
    );
    const n = rows[0]?.n ?? 0;
    record('Sin eventos de outbox de caja atascados en PUBLISHING > 90s', n === 0, `atascados=${n}`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

async function main() {
  console.log(`\n💥 Caos mid-flow (${DOCKER_DOWN})${KILL ? ' [crash real]' : ''} — corte de ${CUENTAS_CONTAINER} en pleno cobro\n`);
  await login();
  const baseline = await snapshotBaseline().catch(() => ({ failed: 0, dlq: 0 }));

  // ── 0. Producto real para el pedido ──
  const prods = await req('GET', '/inventario/productos');
  const productoId = prods.data?.data?.[0]?.id;
  if (!productoId) { record('Hay productos para el flujo', false, 'GET /inventario/productos sin data'); return finalizar(); }
  record('Hay productos para el flujo', true, productoId);

  // ── 1. Flujo hasta abrir la cuenta (cuentas ARRIBA) ──
  const mesa = await req('POST', '/mesas', { numero: Math.floor(Math.random() * 100000) + 9000, capacidad: 2, ubicacion: 'CHAOS-MIDFLOW' });
  const mesaId = mesa.data?.mesa?.id || mesa.data?.id;
  record('Mesa creada', mesa.ok && !!mesaId, `status=${mesa.status}`);
  if (!mesaId) return finalizar();

  const pedido = await req('POST', '/pedidos', { mesaId, items: [{ productoId, cantidad: 1, area: 'COCINA' }] });
  record('Pedido creado', pedido.ok, `status=${pedido.status}`);

  const cuenta = await waitForCuenta(mesaId);
  const cuentaId = cuenta?.data?.id;
  record('Cuenta abierta (vía outbox→evento)', !!cuentaId, cuentaId ? `cuentaId=${cuentaId}` : `status=${cuenta?.status}`);
  if (!cuentaId) return finalizar();

  // ── 2. El corte: se detiene cuentas justo antes de cobrar ──
  docker(DOCKER_DOWN, CUENTAS_CONTAINER);
  record(`cuentas detenido (docker ${DOCKER_DOWN})`, true, CUENTAS_CONTAINER);
  await sleep(1500);

  // ── 3. Cobro con cuentas caído: 201 degradado, nunca cuelga ni error crudo ──
  const pago = await req('POST', '/caja/pagos', { cuentaId, montoRecibido: 25, metodo: 'EFECTIVO' });
  const degradado = /proceso|pendiente|confirmar/i.test(String(pago.data?.message ?? ''));
  record('Pago aceptado con cuentas caído (2xx degradado, sin colgarse)', pago.ok && pago.ms < 8000, `status=${pago.status} ms=${pago.ms} msg="${pago.data?.message ?? ''}"`);
  record('Mensaje de pago refleja degradación honesta ("cierre en proceso")', degradado, String(pago.data?.message ?? ''));

  // ── 4. Reanudación: cuentas vuelve ──
  docker('start', CUENTAS_CONTAINER);
  record('cuentas reanudado (docker start)', true);
  let arriba = false;
  for (let i = 0; i < 45 && !arriba; i += 1) {
    await sleep(2000);
    arriba = isRunning(CUENTAS_CONTAINER) && (await cuentasArribaDirecto());
  }
  record('cuentas sano tras reanudar (health/ready directo)', arriba);

  // ── 5. Recuperación automática: la cuenta se cierra sola (evento pago.registrado) ──
  let recuperado = false;
  const deadline = Date.now() + RECOVERY_TIMEOUT_SEC * 1000;
  while (Date.now() < deadline && !recuperado) {
    await sleep(5000);
    const c = await req('GET', `/cuentas/mesa/${mesaId}`);
    // Cerrada = ya no hay cuenta ABIERTA para la mesa (404) o su estado dejó de ser ABIERTA.
    recuperado = c.status === 404 || (c.ok && c.data?.estado && c.data.estado !== 'ABIERTA');
  }
  record(`Cuenta cerrada sola tras reanudar (≤ ${RECOVERY_TIMEOUT_SEC}s)`, recuperado);

  // ── 5b. Rescate de PUBLISHING huérfanos (clave bajo --kill) ──
  try {
    await verificarPublishingRescatado();
  } catch (err) {
    record('Sin eventos de outbox de caja atascados en PUBLISHING > 90s', false, `error consultando caja_db: ${err.message}`);
  }

  // ── 6. Sin pérdida ni duplicación de mensajes ──
  const postload = await verifyPostLoad(baseline, { timeoutSec: 180 }).catch((err) => ({ pass: false, checks: [{ name: 'postload', pass: false, detail: err.message }] }));
  for (const c of postload.checks) record(`Recuperación: ${c.name}`, c.pass, c.detail);

  // ── 7. Se observó sobrevivir: métricas de resiliencia en reposo (T-18) ──
  const resil = await verifyResilienceMetrics({ timeoutSec: 60 }).catch((err) => ({ pass: false, checks: [{ name: 'métricas de resiliencia', pass: false, detail: err.message }] }));
  for (const c of resil.checks) record(`Observabilidad: ${c.name}`, c.pass, c.detail);

  return finalizar();
}

function finalizar() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = results.filter((r) => r.ok).length;
  const md = [
    `# Caos mid-flow (${DOCKER_DOWN}) — ${new Date().toISOString()}`,
    '',
    `Modo: ${KILL ? '`docker kill` (crash real)' : '`docker stop` (graceful)'}`,
    `Recuperación esperada en ≤ ${RECOVERY_TIMEOUT_SEC}s`,
    `Resultado: **${passed}/${results.length}** verificaciones OK`,
    '',
    '| Verificación | Resultado | Detalle |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail ?? ''} |`),
    '',
  ].join('\n');
  const file = `${REPORT_DIR}/chaos-mid-flow-${KILL ? 'kill-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(file, md);
  console.log(`\n📄 Reporte: ${file}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
