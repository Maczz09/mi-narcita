#!/usr/bin/env node
/**
 * Caos 4.2 — RabbitMQ entero caído BAJO CARGA (compuesto #1 del plan).
 *
 * Reutiliza la lógica ya verificada de run-rabbitmq-chaos.js (baseline →
 * docker kill → servicios sobreviven → docker start → colas recuperan
 * consumidores → mutación funciona), pero la ejecuta con tráfico k6 real de
 * fondo (escenario `mesas`, lectura+escritura) para que las verificaciones no
 * sean con el sistema ocioso — que es la única forma de saber si la caída del
 * broker + carga concurrente satura el pool de conexiones o dispara efectos
 * que no aparecen en frío.
 *
 * Uso:  node stress-tests/run-chaos-rabbitmq-bajo-carga.js
 *       node stress-tests/run-chaos-rabbitmq-bajo-carga.js --vus 200 --load-duration 90
 */
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const VUS = arg('vus', '200');
const LOAD_DURATION = arg('load-duration', '90s');

async function main() {
  console.log(`\n🐰📈 Caos RabbitMQ bajo carga: k6 (${VUS} VUs, ${LOAD_DURATION}) de fondo + docker kill/start\n`);

  const k6 = spawn(
    'k6',
    [
      'run',
      '--vus', VUS,
      '--duration', LOAD_DURATION,
      '--env', 'LEVEL=L1',
      path.join(__dirname, 'k6', 'scenarios', 'mesas.js'),
    ],
    { stdio: 'inherit', shell: false, env: process.env },
  );

  // Da tiempo a que k6 levante VUs y empiece a generar tráfico antes de matar
  // el broker (si no, el "baseline" del chaos coincidiría con el arranque de k6).
  await new Promise((r) => setTimeout(r, 8000));

  const chaos = spawnSync('node', [path.join(__dirname, 'run-rabbitmq-chaos.js')], {
    stdio: 'inherit',
    env: process.env,
  });

  await new Promise((resolve) => {
    if (k6.exitCode !== null) return resolve();
    k6.on('exit', resolve);
  });

  console.log(`\nk6 de fondo terminó con código ${k6.exitCode}. Caos terminó con código ${chaos.status}.`);
  // El resultado del caos manda: k6 solo aporta la carga concurrente, no se evalúa por thresholds aquí.
  process.exit(chaos.status ?? 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
