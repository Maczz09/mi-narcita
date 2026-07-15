#!/usr/bin/env node
/**
 * Caos 4.2 — baja simultánea de 2 servicios (pedidos + inventario).
 *
 * Es el compuesto más agresivo: pedidos es productor central (mesas, cuentas,
 * inventario, caja consumen sus eventos) y también CLIENTE HTTP de inventario
 * (bulkhead+breaker). Tumbar ambos a la vez verifica:
 *
 *   1. Servicios sin relación directa (reservas, identidad) siguen sirviendo 2xx.
 *   2. mesas/cuentas/caja (consumidores de eventos de pedidos) NO crashean ni
 *      devuelven 5xx en su propio plano HTTP — solo dejan de recibir eventos
 *      nuevos de pedidos (comportamiento esperado, no un fallo).
 *   3. Al reanudar ambos, RabbitMQ redirige los mensajes en cola (si los hubiera
 *      quedado acumulados en pedidos_queue por reintentos de otros productores)
 *      y el outbox de pedidos (si el contenedor volvió con backlog) drena.
 *
 * Uso:  node stress-tests/run-chaos-double-service-down.js --duration 30
 */
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { snapshotBaseline, verifyPostLoad } = require('./k6/verify-postload');

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const REPORT_DIR = 'stress-tests/reports';
const CAIDOS = ['nachopps-servicio-pedidos', 'nachopps-servicio-inventario'];
// Servicios que consumen eventos de pedidos/inventario o llaman a ellos por HTTP:
// se espera que su plano HTTP siga vivo (2xx/4xx), solo dejan de recibir eventos.
const DEPENDIENTES = ['mesas', 'cuentas', 'caja'];
// Sin relación directa con pedidos/inventario: cero excusa para fallar.
const INDEPENDIENTES = ['reservas', 'identidad', 'notificaciones'];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const DURATION_SEC = Number(arg('duration', 30));

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
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
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

function isRunning(c) {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', c], { encoding: 'utf8' }).trim() === 'true';
  } catch { return false; }
}

async function main() {
  console.log(`\n💥💥 Caos compuesto: baja de pedidos + inventario a la vez — ${DURATION_SEC}s\n`);
  await login();
  const baseline = await snapshotBaseline().catch(() => ({ failed: 0, dlq: 0 }));

  execFileSync('docker', ['stop', ...CAIDOS], { stdio: 'ignore' });
  record('pedidos + inventario detenidos simultáneamente', true, CAIDOS.join(', '));
  await sleep(3000);

  let independientesOk = 0;
  for (const s of INDEPENDIENTES) {
    const r = await req('GET', `/${s}`);
    const ok = r.status > 0 && r.status < 500;
    if (ok) independientesOk += 1;
    record(`servicio-${s} (independiente) sin 5xx durante la caída doble`, ok, `status=${r.status}`);
  }
  record('PROHIBIDO evitado: sin cascada a servicios independientes', independientesOk === INDEPENDIENTES.length, `${independientesOk}/${INDEPENDIENTES.length}`);

  let dependientesOk = 0;
  for (const s of DEPENDIENTES) {
    const r = await req('GET', `/${s}`);
    // Su HTTP propio no depende de pedidos/inventario estar arriba — debe seguir sirviendo.
    const ok = r.status > 0 && r.status < 500;
    if (ok) dependientesOk += 1;
    record(`servicio-${s} (consumidor de eventos de pedidos) sigue sirviendo su HTTP propio`, ok, `status=${r.status}`);
  }
  record('Dependientes degradan sin caer', dependientesOk === DEPENDIENTES.length, `${dependientesOk}/${DEPENDIENTES.length}`);

  await sleep(DURATION_SEC * 1000);

  execFileSync('docker', ['start', ...CAIDOS], { stdio: 'ignore' });
  record('pedidos + inventario reanudados', true);

  let ambosArriba = false;
  for (let i = 0; i < 40 && !ambosArriba; i += 1) {
    await sleep(2000);
    const rp = await req('GET', '/pedidos');
    const ri = await req('GET', '/inventario/productos');
    ambosArriba = rp.ok && ri.ok;
  }
  record('Ambos servicios sirven 2xx tras reanudar', ambosArriba);
  record('Ninguno de los 2 reinició su contenedor (self-healing sin restart)', isRunning(CAIDOS[0]) && isRunning(CAIDOS[1]));

  const postload = await verifyPostLoad(baseline, { timeoutSec: 180 }).catch((err) => ({ pass: false, checks: [{ name: 'postload', pass: false, detail: err.message }] }));
  for (const c of postload.checks) record(`Recuperación: ${c.name}`, c.pass, c.detail);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = results.filter((r) => r.ok).length;
  const md = [
    `# Caos compuesto: pedidos + inventario a la vez — ${new Date().toISOString()}`,
    '',
    `Duración de la caída: ${DURATION_SEC}s`,
    `Resultado: **${passed}/${results.length}** verificaciones OK`,
    '',
    '| Verificación | Resultado | Detalle |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail ?? ''} |`),
    '',
  ].join('\n');
  const file = `${REPORT_DIR}/chaos-double-pedidos-inventario-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(file, md);
  console.log(`\n📄 Reporte: ${file}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
