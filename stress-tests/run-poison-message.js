#!/usr/bin/env node
/**
 * Caos — mensaje envenenado → DLQ al primer intento (Fase 4, T-17).
 *
 * Aísla y demuestra el comportamiento de T-11 (H-5): un payload que siempre
 * fallará por parseo/validación no debe quemar los 3 reintentos (~7s) antes de
 * la DLQ. Publica directo al exchange `nachopps_exchange` un payload corrupto
 * (JSON malformado) con una routing key que consume pedidos, y verifica:
 *
 *   (a) el mensaje aterriza en `dlq.pedidos_queue`;
 *   (b) `dlq_messages_total` incrementa en las métricas (Prometheus);
 *   (c) con T-11 aplicado, llega al PRIMER intento — publicación→DLQ < 3s
 *       (sin T-11 serían ~7s de los 3 reintentos con backoff).
 *
 * Requiere el stack Docker levantado.
 *
 * Uso:  node stress-tests/run-poison-message.js
 *       POISON_RK=stock.insuficiente node stress-tests/run-poison-message.js
 */
const fs = require('node:fs');
const amqp = require('amqplib');
const { promQuery } = require('./k6/verify-postload');

const RABBITMQ_URI = process.env.RABBITMQ_URI || 'amqp://nachopps:nachopps_secret@localhost:5672';
const EXCHANGE = 'nachopps_exchange';
const DLX = 'NACHOPPS_DLX';
const PEDIDOS_DLQ = 'dlq.pedidos_queue';
// Routing key consumida por pedidos (ver bindings de pedidos_queue).
const POISON_RK = process.env.POISON_RK || 'producto.creado';
const REPORT_DIR = 'stress-tests/reports';
const DLQ_TIMEOUT_MS = Number(process.env.POISON_DLQ_TIMEOUT_MS || 15000);

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// Payload corrupto: envelope JSON truncado (no parseable). El consumidor no
// puede deserializarlo → error de parseo permanente → con T-11 va a la DLQ al
// primer intento, sin quemar reintentos. Marcador embebido para localizarlo.
const MARKER = `qa-poison-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function poisonBuffer() {
  return Buffer.from(`{"pattern":"${POISON_RK}","marker":"${MARKER}","data":`);
}

async function withChannel(fn) {
  const conn = await amqp.connect(RABBITMQ_URI);
  try {
    const channel = await conn.createConfirmChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DLX, 'topic', { durable: true });
    await channel.assertQueue(PEDIDOS_DLQ, { durable: true });
    const r = await fn(channel);
    await channel.close();
    return r;
  } finally {
    await conn.close().catch(() => undefined);
  }
}

async function purgarDlq() {
  await withChannel(async (ch) => { try { await ch.purgeQueue(PEDIDOS_DLQ); } catch { /* puede no existir */ } });
}

// Poll de la DLQ hasta encontrar el mensaje veneno; devuelve ms transcurridos.
async function esperarEnDlq(timeoutMs, desdeMs) {
  return withChannel(async (channel) => {
    while (Date.now() - desdeMs < timeoutMs) {
      const msg = await channel.get(PEDIDOS_DLQ, { noAck: false });
      if (msg) {
        const body = msg.content.toString('utf8');
        channel.ack(msg);
        if (body.includes(MARKER)) return { found: true, ms: Date.now() - desdeMs };
      } else {
        await sleep(150);
      }
    }
    return { found: false, ms: Date.now() - desdeMs };
  });
}

async function main() {
  console.log(`\n☠️  Mensaje envenenado → DLQ (routing key ${POISON_RK})\n`);
  await purgarDlq();
  const dlqAntes = await promQuery('sum(dlq_messages_total)').catch(() => 0);

  const tPublish = Date.now();
  await withChannel(async (ch) => {
    ch.publish(EXCHANGE, POISON_RK, poisonBuffer(), { contentType: 'application/json', headers: { 'x-qa-poison': MARKER } });
    await ch.waitForConfirms();
  });
  record('Payload corrupto publicado', true, `rk=${POISON_RK} marker=${MARKER}`);

  const dlq = await esperarEnDlq(DLQ_TIMEOUT_MS, tPublish);
  record('El mensaje aterriza en dlq.pedidos_queue', dlq.found, dlq.found ? `en ${dlq.ms}ms` : `no apareció en ${DLQ_TIMEOUT_MS}ms`);
  // T-11: parseo permanente → primer intento → < 3s (sin T-11 serían ~7s).
  record('Llega a la DLQ al primer intento (< 3s, T-11)', dlq.found && dlq.ms < 3000, `${dlq.ms}ms`);

  // dlq_messages_total (Prometheus; tolera el lag de scrape, ~15s).
  let dlqDespues = dlqAntes;
  for (let i = 0; i < 8 && !(dlqDespues > dlqAntes); i += 1) {
    await sleep(3000);
    dlqDespues = await promQuery('sum(dlq_messages_total)').catch(() => dlqDespues);
  }
  record('dlq_messages_total incrementa en las métricas', dlqDespues > dlqAntes, `${dlqAntes} → ${dlqDespues}`);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = results.filter((r) => r.ok).length;
  const md = [
    `# Caos: mensaje envenenado → DLQ — ${new Date().toISOString()}`,
    '',
    `Routing key: \`${POISON_RK}\`  ·  Marcador: \`${MARKER}\``,
    `Resultado: **${passed}/${results.length}** verificaciones OK`,
    '',
    '| Verificación | Resultado | Detalle |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail ?? ''} |`),
    '',
  ].join('\n');
  const file = `${REPORT_DIR}/poison-message-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(file, md);
  console.log(`\n📄 Reporte: ${file}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
