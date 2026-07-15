/**
 * Verificación post-carga (Fase 3.6) — script Node, consulta Prometheus.
 *
 * Criterios:
 *  1. Outbox drenada: sum(outbox_pending_total) llega a 0 antes del timeout.
 *  2. Sin eventos muertos nuevos: sum(outbox_failed_total) no crece vs baseline.
 *  3. DLQ sin crecimiento: sum(dlq_messages_total) no crece vs baseline.
 *
 * (1)+(2)+(3) juntos = sin pérdida de mensajes: el outbox garantiza
 * at-least-once, así que "todo publicado, nada FAILED, nada en DLQ" implica que
 * cada evento generado por la carga llegó y fue procesado.
 *
 * Uso standalone:  node stress-tests/k6/verify-postload.js [--timeout 300]
 * Uso como módulo: const { snapshotBaseline, verifyPostLoad } = require(...)
 */

const PROM = process.env.PROM_URL || 'http://localhost:9090';

async function promQuery(query) {
  const res = await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Prometheus ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const result = data.data?.result ?? [];
  // Suma de todas las series devueltas (ya vienen agregadas si la query usa sum()).
  return result.reduce((acc, serie) => acc + Number(serie.value[1] || 0), 0);
}

async function snapshotBaseline() {
  const [failed, dlq] = await Promise.all([
    promQuery('sum(outbox_failed_total)'),
    promQuery('sum(dlq_messages_total)'),
  ]);
  return { failed, dlq };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{failed:number,dlq:number}} baseline  capturada ANTES de la carga
 * @param {{timeoutSec?:number, pollSec?:number}} opts
 * @returns {{pass:boolean, checks:Array<{name:string, pass:boolean, detail:string}>}}
 */
async function verifyPostLoad(baseline, opts = {}) {
  const timeoutSec = opts.timeoutSec ?? Number(process.env.POSTLOAD_TIMEOUT_SEC ?? 300);
  const pollSec = opts.pollSec ?? 5;
  const checks = [];

  // 1. Outbox drenada (con paciencia: techo de ~50 ev/s por productor).
  const deadline = Date.now() + timeoutSec * 1000;
  let pending = await promQuery('sum(outbox_pending_total)');
  let drainedAt = null;
  while (pending > 0 && Date.now() < deadline) {
    await sleep(pollSec * 1000);
    pending = await promQuery('sum(outbox_pending_total)');
  }
  if (pending === 0) drainedAt = new Date().toISOString();
  checks.push({
    name: 'outbox drenada',
    pass: pending === 0,
    detail: pending === 0 ? `pendientes=0 @ ${drainedAt}` : `aún ${pending} pendientes tras ${timeoutSec}s`,
  });

  // 2. Sin FAILED nuevos.
  const failed = await promQuery('sum(outbox_failed_total)');
  checks.push({
    name: 'outbox sin FAILED nuevos',
    pass: failed <= baseline.failed,
    detail: `baseline=${baseline.failed} → ahora=${failed}`,
  });

  // 3. DLQ sin crecimiento.
  const dlq = await promQuery('sum(dlq_messages_total)');
  checks.push({
    name: 'DLQ sin crecimiento',
    pass: dlq <= baseline.dlq,
    detail: `baseline=${baseline.dlq} → ahora=${dlq}`,
  });

  return { pass: checks.every((c) => c.pass), checks };
}

module.exports = { promQuery, snapshotBaseline, verifyPostLoad };

if (require.main === module) {
  (async () => {
    const timeoutIdx = process.argv.indexOf('--timeout');
    const timeoutSec = timeoutIdx > -1 ? Number(process.argv[timeoutIdx + 1]) : undefined;
    // Standalone no tiene baseline previa: exige failed/dlq en cero absoluto.
    const result = await verifyPostLoad({ failed: 0, dlq: 0 }, { timeoutSec });
    for (const c of result.checks) {
      console.log(`${c.pass ? '✅' : '❌'} ${c.name} — ${c.detail}`);
    }
    process.exit(result.pass ? 0 : 1);
  })().catch((err) => {
    console.error(`Error verificando post-carga: ${err.message}`);
    process.exit(2);
  });
}
