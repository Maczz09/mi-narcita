/**
 * Runner de la suite k6 (Fase 3.5): ejecuta nivel × servicio, vuelca los
 * resultados JSON a stress-tests/reports/ y corre la verificación post-carga
 * (outbox drenada, DLQ sin crecimiento) tras cada escenario.
 *
 * Uso:
 *   node stress-tests/run-k6-suite.js --level L1
 *   node stress-tests/run-k6-suite.js --level L2 --rate 1200 --services pedidos,reportes
 *
 * Flags:
 *   --level    L1 | L2 | L3            (default L1)
 *   --services lista separada por comas (default: los 9)
 *   --rate     req/s de meseta para L2/L3 (default 1500 — CALIBRAR primero)
 *   --base     URL de Kong             (default http://localhost:8000)
 *   --prom     URL de Prometheus       (default http://localhost:9090)
 *   --skip-verify  no correr la verificación post-carga
 *
 * Requisitos: stack levantado (docker compose --profile all up) y k6 instalado
 * (winget install k6 / choco install k6). Ver stress-tests/k6/README.md para la
 * precondición del rate-limiting de Kong.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { snapshotBaseline, verifyPostLoad } = require('./k6/verify-postload');

const SERVICES = [
  'identidad', 'mesas', 'pedidos', 'cuentas', 'reservas',
  'inventario', 'notificaciones', 'caja', 'reportes',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}

const LEVEL = (arg('level', 'L1')).toUpperCase();
const RATE = Number(arg('rate', 1500));
const BASE = arg('base', 'http://localhost:8000');
const PROM = arg('prom', 'http://localhost:9090');
const SKIP_VERIFY = process.argv.includes('--skip-verify');
const services = (arg('services', SERVICES.join(','))).split(',').map((s) => s.trim()).filter(Boolean);

const REPORTS_DIR = path.join(__dirname, 'reports');
const K6_DIR = path.join(__dirname, 'k6');

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(2);
}

async function preflight() {
  // 1. k6 instalado
  const k6 = spawnSync('k6', ['version'], { encoding: 'utf8', shell: true });
  if (k6.status !== 0) {
    fail('k6 no está instalado. Instálalo con: winget install k6  (o choco install k6)');
  }
  console.log(`✔ ${k6.stdout.trim().split('\n')[0]}`);

  // 2. Stack arriba: login real (con reintentos — justo tras un recreate el
  //    gateway/identidad pueden tardar unos segundos en enrutar).
  let token;
  let lastErr = 'sin detalle';
  for (let i = 0; i < 12 && !token; i++) {
    try {
      const res = await fetch(`${BASE}/identidad/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.K6_USER || 'admin@nachopps.pe',
          password: process.env.K6_PASS || 'nachopps123',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        token = (await res.json()).access_token;
        break;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err.message;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (!token) {
    fail(`Login contra Kong falló tras 2 min (${lastErr}). ¿Stack levantado y seed cargado? docker compose --profile all up -d (en infra/)`);
  }

  // 3. Rate-limiting de Kong suficiente para el nivel (A-1 de la auditoría):
  //    con el default (3000/min compartido) cualquier nivel muere en 429.
  const probe = await fetch(`${BASE}/notificaciones`, { headers: { Authorization: `Bearer ${token}` } });
  const limitMin = Number(probe.headers.get('x-ratelimit-limit-minute'));
  const needed = LEVEL === 'L1' ? 60_000 : RATE * 60;
  if (Number.isFinite(limitMin) && limitMin > 0 && limitMin < needed) {
    fail(
      `El rate-limiting de Kong es ${limitMin}/min y el nivel ${LEVEL} necesita ≥${needed}/min.\n` +
      `   Relevanta Kong con límites de prueba (PowerShell, en infra/):\n` +
      `   $env:KONG_RATE_LIMIT_MINUTE='600000'; $env:KONG_RATE_LIMIT_HOUR='36000000'; docker compose --profile all up -d --force-recreate kong`,
    );
  }
  console.log(`✔ Kong responde; rate-limit ${Number.isFinite(limitMin) ? `${limitMin}/min` : 'sin header (¿deshabilitado?)'} — OK para ${LEVEL}`);

  // 4. Prometheus (solo si vamos a verificar)
  if (!SKIP_VERIFY) {
    try {
      const res = await fetch(`${PROM}/api/v1/query?query=up`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      fail(`Prometheus no responde en ${PROM}: ${err.message} (usa --skip-verify para omitir la verificación post-carga)`);
    }
    console.log('✔ Prometheus responde');
  }
}

// Hallazgo de carga (2026-07-13): un hipo del stack (VM de Docker reiniciada,
// contenedores autolevantando) durante la suite hacía fallar el login de TODOS
// los escenarios siguientes. Gate de salud entre servicios: espera login OK.
async function waitForStack(timeoutSec = 180) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/identidad/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.K6_USER || 'admin@nachopps.pe',
          password: process.env.K6_PASS || 'nachopps123',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
    } catch { /* stack aún no responde */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function main() {
  const desconocidos = services.filter((s) => !SERVICES.includes(s));
  if (desconocidos.length) fail(`Servicios desconocidos: ${desconocidos.join(', ')}`);
  if (!['L1', 'L2', 'L3'].includes(LEVEL)) fail(`Nivel desconocido: ${LEVEL}`);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  await preflight();

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const suite = { level: LEVEL, rate: LEVEL === 'L1' ? null : RATE, startedAt: ts, results: [] };

  for (const service of services) {
    console.log(`\n════════ ${LEVEL} × ${service} ════════`);
    const summaryFile = path.join(REPORTS_DIR, `k6-${LEVEL}-${service}-${ts}.json`);

    const stackOk = await waitForStack();
    if (!stackOk) {
      console.error(`❌ El stack no respondió al login en 180s — se omite ${service}`);
      suite.results.push({ service, exitCode: null, thresholdsOk: false, ranOk: false, summaryFile: null, postload: null, pass: false, skipped: 'stack caído' });
      continue;
    }

    const baseline = SKIP_VERIFY ? null : await snapshotBaseline().catch(() => null);

    const k6run = spawnSync(
      'k6',
      [
        'run',
        '--env', `LEVEL=${LEVEL}`,
        '--env', `BASE_URL=${BASE}`,
        '--env', `K6_RATE=${RATE}`,
        '--summary-export', summaryFile,
        path.join(K6_DIR, 'scenarios', `${service}.js`),
      ],
      { stdio: 'inherit', shell: true, env: process.env },
    );
    // k6: exit 0 = OK, 99 = thresholds incumplidos, otro = error de ejecución.
    const thresholdsOk = k6run.status === 0;
    const ranOk = k6run.status === 0 || k6run.status === 99;

    // Hallazgo de carga (2026-07-13): sin pausa, las conexiones/handles del
    // escenario anterior (aún drenando tras gracefulRampDown) se solapaban con
    // el arranque del siguiente en este host y contribuyeron a agotar memoria
    // de la VM de Docker Desktop (los 9 Postgres murieron a la vez, sin límite
    // individual). 15s de enfriamiento entre servicios, no entre niveles.
    if (services.indexOf(service) < services.length - 1) {
      console.log('… enfriamiento (15s) antes del siguiente servicio');
      await new Promise((r) => setTimeout(r, 15000));
    }

    let postload = null;
    if (!SKIP_VERIFY && ranOk && baseline) {
      console.log('… verificación post-carga (outbox/DLQ)');
      postload = await verifyPostLoad(baseline).catch((err) => ({
        pass: false,
        checks: [{ name: 'verificación post-carga', pass: false, detail: err.message }],
      }));
      for (const c of postload.checks) console.log(`  ${c.pass ? '✅' : '❌'} ${c.name} — ${c.detail}`);
    }

    suite.results.push({
      service,
      exitCode: k6run.status,
      thresholdsOk,
      ranOk,
      summaryFile: path.relative(process.cwd(), summaryFile),
      postload,
      pass: thresholdsOk && (postload ? postload.pass : true),
    });
  }

  const suiteFile = path.join(REPORTS_DIR, `k6-suite-${LEVEL}-${ts}.json`);
  fs.writeFileSync(suiteFile, JSON.stringify(suite, null, 2));

  console.log(`\n════════ RESUMEN ${LEVEL} ════════`);
  for (const r of suite.results) {
    const post = r.postload ? (r.postload.pass ? 'postload ✅' : 'postload ❌') : 'postload —';
    console.log(`${r.pass ? '✅' : '❌'} ${r.service.padEnd(15)} thresholds ${r.thresholdsOk ? '✅' : '❌'} · ${post}`);
  }
  console.log(`\nInforme de suite: ${suiteFile}`);
  process.exit(suite.results.every((r) => r.pass) ? 0 : 1);
}

main().catch((err) => fail(err.stack || err.message));
