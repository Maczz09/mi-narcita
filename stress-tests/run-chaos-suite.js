#!/usr/bin/env node
/**
 * Orquestador de la matriz de caos (Fase 4.1-4.3): baja cada servicio
 * (docker compose stop nachopps-servicio-X) uno por uno, y luego los 3
 * experimentos compuestos (4.2). Vuelca un resumen consolidado a
 * stress-tests/reports/chaos-suite-<ts>.json además de los reportes .md
 * individuales que cada script ya escribe.
 *
 * Uso:  node stress-tests/run-chaos-suite.js
 *       node stress-tests/run-chaos-suite.js --skip-compound
 *       node stress-tests/run-chaos-suite.js --only mesas,pedidos
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const REPORT_DIR = path.join(__dirname, 'reports');
const SERVICIOS = ['identidad', 'mesas', 'pedidos', 'cuentas', 'reservas', 'inventario', 'notificaciones', 'caja', 'reportes'];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const SKIP_COMPOUND = process.argv.includes('--skip-compound');
const only = arg('only', null);
const servicios = only ? only.split(',').map((s) => s.trim()) : SERVICIOS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRunning(container) {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', container], { encoding: 'utf8' }).trim() === 'true';
  } catch { return false; }
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const suite = { startedAt: new Date().toISOString(), individuales: [], compuestos: [] };

  console.log(`\n════════ MATRIZ DE CAOS — baja individual de ${servicios.length} servicios ════════`);
  for (const s of servicios) {
    console.log(`\n---- servicio-${s} ----`);
    const r = spawnSync('node', [path.join(__dirname, 'run-chaos-db-down.js'), '--db', s, '--duration', '20'], {
      stdio: 'inherit',
      env: process.env,
    });
    suite.individuales.push({ servicio: s, exitCode: r.status, pass: r.status === 0 });
    // Verificación de seguridad entre experimentos: no arrancar el siguiente con contenedores caídos.
    await sleep(3000);
    const contenedor = `nachopps-servicio-${s}`;
    if (!isRunning(contenedor)) {
      console.warn(`⚠️  ${contenedor} no está corriendo tras el experimento — reintentando docker start`);
      try { execFileSync('docker', ['start', contenedor], { stdio: 'ignore' }); } catch { /* noop */ }
      await sleep(5000);
    }
  }

  if (!SKIP_COMPOUND) {
    console.log(`\n════════ EXPERIMENTOS COMPUESTOS (4.2) ════════`);

    console.log('\n---- 1/3: RabbitMQ entero bajo carga ----');
    const c1 = spawnSync('node', [path.join(__dirname, 'run-chaos-rabbitmq-bajo-carga.js')], { stdio: 'inherit', env: process.env });
    suite.compuestos.push({ nombre: 'rabbitmq-bajo-carga', exitCode: c1.status, pass: c1.status === 0 });
    await sleep(5000);

    console.log('\n---- 2/3: baja de una BD individual (inventario, alta contención) ----');
    const c2 = spawnSync('node', [path.join(__dirname, 'run-chaos-db-down.js'), '--db', 'inventario', '--duration', '30'], { stdio: 'inherit', env: process.env });
    suite.compuestos.push({ nombre: 'db-inventario-down', exitCode: c2.status, pass: c2.status === 0 });
    await sleep(5000);

    console.log('\n---- 3/3: pedidos + inventario a la vez ----');
    const c3 = spawnSync('node', [path.join(__dirname, 'run-chaos-double-service-down.js'), '--duration', '30'], { stdio: 'inherit', env: process.env });
    suite.compuestos.push({ nombre: 'doble-pedidos-inventario', exitCode: c3.status, pass: c3.status === 0 });
  }

  const file = path.join(REPORT_DIR, `chaos-suite-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(suite, null, 2));

  console.log(`\n════════ RESUMEN MATRIZ DE CAOS ════════`);
  for (const r of suite.individuales) console.log(`${r.pass ? '✅' : '❌'} baja individual: servicio-${r.servicio}`);
  for (const r of suite.compuestos) console.log(`${r.pass ? '✅' : '❌'} compuesto: ${r.nombre}`);
  console.log(`\nInforme: ${file}`);

  const todos = [...suite.individuales, ...suite.compuestos];
  process.exit(todos.every((r) => r.pass) ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
