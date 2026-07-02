#!/usr/bin/env node
/**
 * Stress & Concurrency Test Suite — All Microservices
 * 
 * Tests:
 *  1. servicio-identidad: Login burst + token validation
 *  2. servicio-mesas: Concurrent table reads/writes
 *  3. servicio-pedidos: Concurrent order creation
 *  4. servicio-cuentas: Concurrent bill open/close
 *  5. servicio-reservas: Concurrent reservation creation
 *  6. servicio-inventario: Concurrent stock updates
 *  7. servicio-caja: Concurrent payment registration
 *  8. servicio-reportes: Concurrent report reads
 *  9. Cross-service: Full order-to-payment flow under load
 * 10. Cross-service: Multi-table concurrent full cycle
 */

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const ROUNDS = parseInt(process.env.ROUNDS || '50', 10);
const TIMEOUT_MS = 15000;

// ── Higiene de rate-limit (T-28.4) ──────────────────────────────────────────
// Kong limita /auth/login a 5/min por IP. Encadenar este script con otros (o
// repetir corridas) agota ese presupuesto y contamina los asserts de límite con
// 429 que no son fallos. Antes de medir reseteamos el contador:
//   RATE_LIMIT_RESET=restart  → reinicia el contenedor Kong (rápido; requiere docker)
//   RATE_LIMIT_RESET=wait     → espera la ventana (por defecto), sin dependencias
const KONG_CONTAINER = process.env.KONG_CONTAINER || 'nachopps-kong';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '61000', 10);
const LOGIN_BUDGET = parseInt(process.env.LOGIN_BUDGET || '5', 10);

let authToken = null;
let adminToken = null;
let testResults = [];
let testId = 0;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function genId() { return `stress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `${BASE}${path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, ms, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ms: Date.now() - start, ok: false, error: err.message };
  }
}

async function runConcurrent(label, fn, concurrency = CONCURRENCY, rounds = ROUNDS) {
  const id = ++testId;
  const startAll = Date.now();
  const promises = [];
  for (let i = 0; i < rounds; i++) {
    promises.push(fn(i));
  }
  const results = await Promise.allSettled(promises);
  const totalMs = Date.now() - startAll;

  const successes = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  const failures = results.filter(r => r.status === 'rejected' || !r.value?.ok).length;
  const statuses = {};
  const latencies = [];

  for (const r of results) {
    const val = r.status === 'fulfilled' ? r.value : { status: 0, ms: 0 };
    const key = String(val.status);
    statuses[key] = (statuses[key] || 0) + 1;
    if (val.ms) latencies.push(val.ms);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const result = {
    id, label, concurrency, rounds, totalMs,
    successes, failures, statuses,
    latency: { avg, p50, p95, p99, max: latencies[latencies.length - 1] || 0 },
    rps: Math.round((rounds / totalMs) * 1000),
  };
  testResults.push(result);
  console.log(`  [${id}] ${label}: ${successes}/${rounds} ok, ${failures} fail, p50=${result.latency.p50}ms p95=${result.latency.p95}ms rps=${result.rps}`);
  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// La cuenta se abre de forma asíncrona (pedido → outbox → RabbitMQ → servicio-cuentas);
// outbox_publish_lag_seconds mide p50≈1.5s / p95≈4.5s en este stack, así que un solo
// sleep corto antes de cobrar produce 404 falsos. Reintenta con backoff hasta maxWaitMs.
async function waitForCuenta(mesaId, token, maxWaitMs = 6000, stepMs = 400) {
  const deadline = Date.now() + maxWaitMs;
  let last;
  while (Date.now() < deadline) {
    await sleep(stepMs);
    last = await req('GET', `/cuentas/mesa/${mesaId}`, null, token);
    if (last.ok) return last;
  }
  return last;
}

// Resetea el presupuesto de rate-limit de login (ver nota de cabecera).
async function resetRateLimit(reason = '') {
  if ((process.env.RATE_LIMIT_RESET || 'wait') === 'restart') {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('docker', ['restart', KONG_CONTAINER], { stdio: 'ignore' });
      await sleep(8000); // Kong vuelve a estar listo
      console.log(`  ↻ Rate-limit reseteado vía restart de ${KONG_CONTAINER} ${reason}`);
      return;
    } catch (err) {
      console.log(`  ⚠ No se pudo reiniciar Kong (${err.message}); esperando la ventana`);
    }
  }
  console.log(`  ⏳ Esperando ${Math.round(RATE_LIMIT_WINDOW_MS / 1000)}s a que se reabra el presupuesto de login ${reason}`);
  await sleep(RATE_LIMIT_WINDOW_MS);
}

// Empuja al reporte un resultado de un test bespoke (no concurrente).
function pushResult({ label, rounds, ok, statuses }) {
  const id = ++testId;
  const result = {
    id, label, concurrency: 1, rounds, totalMs: 0,
    successes: ok ? rounds : 0,
    failures: ok ? 0 : rounds,
    statuses,
    latency: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
    rps: 0,
  };
  testResults.push(result);
  console.log(`  [${id}] ${label}: ${ok ? '✅ OK' : '⚠️ FALLA'} — ${JSON.stringify(statuses)}`);
  return result;
}

// ═══════════════════════════════════════════
// AUTH SETUP
// ═══════════════════════════════════════════

async function setupAuth() {
  console.log('\n═══ AUTH SETUP ═══');
  // Login as admin
  const r = await req('POST', '/identidad/auth/login', {
    email: 'admin@nachopps.pe', password: 'nachopps123'
  });
  if (r.ok && r.data?.access_token) {
    authToken = r.data.access_token;
    adminToken = r.data.access_token;
    console.log('  ✓ Auth token obtained');
  } else {
    console.log('  ✗ Login failed, continuing without auth. Status:', r.status, r.data);
  }
}

// ═══════════════════════════════════════════
// TEST 1: IDENTIDAD — Presupuesto de rate-limit de login
// ═══════════════════════════════════════════
//
// T-28.3: antes había dos pruebas que generaban ruido en vez de señal:
//   - "Login burst" lanzaba 50 logins → agotaba el presupuesto 5/min y contaba
//     los 429 (el rate-limit funcionando) como fallos.
//   - "Token validation burst" golpeaba POST /auth/validate, eliminado en T-02
//     → 100% de "fallo" garantizado.
// Las reemplaza una única prueba que convierte el límite en un assert: con
// credenciales inválidas esperamos 401 hasta agotar el presupuesto y 429 después.

async function testLoginRateLimitBudget() {
  console.log('\n═══ TEST 1: servicio-identidad — Presupuesto de rate-limit de login ═══');
  await resetRateLimit('(antes de medir el presupuesto)');
  const attempts = LOGIN_BUDGET + 3;
  const statuses = [];
  for (let i = 0; i < attempts; i++) {
    const r = await req('POST', '/identidad/auth/login', {
      email: 'noexiste@nachopps.pe', password: 'credencial-invalida'
    });
    statuses.push(r.status);
  }
  const dentroDelPresupuesto = statuses.slice(0, LOGIN_BUDGET);
  const fueraDelPresupuesto = statuses.slice(LOGIN_BUDGET);
  const ok =
    dentroDelPresupuesto.every((s) => s === 401 || s === 200) &&
    fueraDelPresupuesto.some((s) => s === 429);
  pushResult({
    label: `Login rate-limit budget (${LOGIN_BUDGET}/min → 429 desde el ${LOGIN_BUDGET + 1}.º)`,
    rounds: attempts,
    ok,
    statuses: statuses.reduce((a, s) => ({ ...a, [s]: (a[s] || 0) + 1 }), {}),
  });
}

// ═══════════════════════════════════════════
// TEST 2: MESAS — Concurrent Reads + Writes
// ═══════════════════════════════════════════

async function testMesasReads() {
  console.log('\n═══ TEST 2a: servicio-mesas — Concurrent GET ═══');
  await runConcurrent('Mesas concurrent reads', async (i) => {
    return req('GET', '/mesas', null, adminToken);
  });
}

async function testMesasCreateAndRead() {
  console.log('\n═══ TEST 2b: servicio-mesas — Concurrent Create + Read ═══');
  await runConcurrent('Mesas create+read', async (i) => {
    const create = await req('POST', '/mesas', {
      numero: Math.floor(Math.random() * 100000) + 9000 + i, capacidad: 4, ubicacion: `TEST-ZONE-${i}`
    }, adminToken);
    const read = await req('GET', `/mesas`, null, adminToken);
    return { ok: create.ok && read.ok, status: create.status, ms: create.ms + read.ms };
  }, 10, 20);
}

// ═══════════════════════════════════════════
// TEST 3: PEDIDOS — Concurrent Order Creation
// ═══════════════════════════════════════════

async function testPedidosConcurrentCreate() {
  console.log('\n═══ TEST 3: servicio-pedidos — Concurrent Order Creation ═══');
  // Get a table first (GET /mesas responde { mesas: [...] }, no { data: [...] })
  const mesasRes = await req('GET', '/mesas', null, adminToken);
  const mesaId = mesasRes.data?.mesas?.[0]?.id;
  if (!mesaId) { console.log('  ⚠ No mesas found, skipping'); return; }
  // productoId debe ser un UUID real: servicio-inventario valida @IsUUID en /productos/lote
  // (un id inventado como 'test-product' hace fallar el cold-start con 400→500, ver T-33).
  // GET /inventario/productos responde { data: [...] }; req() ya envuelve el body
  // en .data, así que la lista real vive en .data.data (no .data).
  const prods = await req('GET', '/inventario/productos', null, adminToken);
  const productoId = prods.data?.data?.[0]?.id;
  if (!productoId) { console.log('  ⚠ No productos found, skipping'); return; }

  await runConcurrent('Pedidos concurrent creation', async (i) => {
    return req('POST', '/pedidos', {
      mesaId,
      items: [{ productoId, cantidad: 1, area: 'COCINA' }]
    }, adminToken);
  }, CONCURRENCY, 30);
}

// ═══════════════════════════════════════════
// TEST 4: CUENTAS — Concurrent Bill Operations
// ═══════════════════════════════════════════

async function testCuentasConcurrent() {
  console.log('\n═══ TEST 4: servicio-cuentas — Concurrent Bill Operations ═══');
  await runConcurrent('Cuentas concurrent GET', async (i) => {
    return req('GET', '/cuentas', null, adminToken);
  });
}

// ═══════════════════════════════════════════
// TEST 5: RESERVAS — Concurrent Reservation Creation
// ═══════════════════════════════════════════

async function testReservasConcurrentCreate() {
  console.log('\n═══ TEST 5: servicio-reservas — Concurrent Reservation Creation ═══');
  await runConcurrent('Reservas concurrent creation', async (i) => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const fecha = date.toISOString().split('T')[0];
    const hora = `${19 + (i % 3)}:${i % 2 === 0 ? '00' : '30'}`;
    return req('POST', '/reservas', {
      clienteNombre: `Stress Client ${i}`,
      clienteTelefono: `999${String(i).padStart(6, '0')}`,
      fecha, hora,
      numComensales: 2 + (i % 4),
      mesaPreferida: `stress-mesa-${i % 5}`,
    }, adminToken);
  }, CONCURRENCY, 40);
}

async function testReservasAvailabilityCheck() {
  console.log('\n═══ TEST 5b: servicio-reservas — Concurrent Availability Checks ═══');
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const fecha = date.toISOString().split('T')[0];
  await runConcurrent('Reservas availability check burst', async (i) => {
    return req('GET', `/reservas/disponibilidad?fecha=${fecha}&hora=20:00`, null, adminToken);
  });
}

// ═══════════════════════════════════════════
// TEST 6: INVENTARIO — Concurrent Stock Updates
// ═══════════════════════════════════════════

async function testInventarioReads() {
  console.log('\n═══ TEST 6a: servicio-inventario — Concurrent Product Reads ═══');
  await runConcurrent('Inventario concurrent reads', async (i) => {
    return req('GET', '/inventario/productos', null, adminToken);
  });
}

async function testInventarioCreateProduct() {
  console.log('\n═══ TEST 6b: servicio-inventario — Concurrent Product Creation ═══');
  await runConcurrent('Inventario concurrent product creation', async (i) => {
    const catRes = await req('POST', '/inventario/categorias', {
      nombre: `TestCat-${genId()}`
    }, adminToken);
    if (!catRes.ok) return catRes;
    return req('POST', '/inventario/productos', {
      categoriaId: catRes.data?.categoria?.id,
      nombre: `TestProd-${genId()}`,
      precio: 10 + i,
      stockActual: 100,
    }, adminToken);
  }, 10, 20);
}

// ═══════════════════════════════════════════
// TEST 7: CAJA — Concurrent Payment Registration
// ═══════════════════════════════════════════

async function testCajaConcurrent() {
  console.log('\n═══ TEST 7: servicio-caja — Concurrent Payment Registration ═══');
  // First get a cuenta
  const cuentasRes = await req('GET', '/cuentas', null, adminToken);
  const cuentaId = Array.isArray(cuentasRes.data) ? cuentasRes.data.find(c => c.estado === 'ABIERTA')?.id : null;
  if (!cuentaId) {
    console.log('  ⚠ No open cuenta found, testing health check only');
    await runConcurrent('Caja health check burst', async (i) => {
      return req('GET', '/caja/health', null, adminToken);
    });
    return;
  }
  await runConcurrent('Caja concurrent payment attempts', async (i) => {
    return req('POST', '/caja/pagos', {
      cuentaId, montoRecibido: 50 + i, metodo: i % 2 === 0 ? 'EFECTIVO' : 'TARJETA'
    }, adminToken);
  }, 10, 20);
}

// ═══════════════════════════════════════════
// TEST 8: REPORTES — Concurrent Report Reads
// ═══════════════════════════════════════════

async function testReportesConcurrent() {
  console.log('\n═══ TEST 8: servicio-reportes — Concurrent Report Reads ═══');
  await runConcurrent('Reportes concurrent reads', async (i) => {
    return req('GET', '/reportes/resumen', null, adminToken);
  });
}

// ═══════════════════════════════════════════
// TEST 9: CROSS-SERVICE — Full Order-to-Payment Flow
// ═══════════════════════════════════════════


async function testFullFlowConcurrent() {
  console.log('\n═══ TEST 9: Cross-service — Full Order-to-Payment Flow ═══');
  // GET /inventario/productos responde { data: [...] } dentro del body ya envuelto por req().
  const prods = await req('GET', '/inventario/productos', null, adminToken);
  const realProdId = prods.data?.data?.[0]?.id;
  if (!realProdId) { console.log('  ⚠ No productos found, skipping'); return; }

  await runConcurrent('Full flow: mesa→pedido→cuenta→pago', async (i) => {
    // 1. Create mesa
    const mesa = await req('POST', '/mesas', {
      numero: Math.floor(Math.random() * 100000) + 8000 + i, capacidad: 2, ubicacion: 'STRESS-TEST'
    }, adminToken);
    if (!mesa.ok) return mesa;
    const mesaId = mesa.data?.mesa?.id || mesa.data?.id;

    // 2. Create pedido
    const pedido = await req('POST', '/pedidos', {
      mesaId,
      items: [{ productoId: realProdId, cantidad: 1, area: 'COCINA' }]

    }, adminToken);
    if (!pedido.ok) return pedido;
    const pedidoId = pedido.data?.id;

    // 3. Get cuenta (con reintentos: la apertura es async vía outbox→RabbitMQ)
    const cuenta = await waitForCuenta(mesaId, adminToken);
    if (!cuenta.ok) return cuenta;
    const cuentaId = cuenta.data?.id;

    // 4. Pay
    const pago = await req('POST', '/caja/pagos', {
      cuentaId, montoRecibido: 25, metodo: 'EFECTIVO'
    }, adminToken);

    return { ok: pago.ok, status: pago.status, ms: Date.now() - Date.now() + pago.ms };
  }, 10, 15);
}

// ═══════════════════════════════════════════
// TEST 10: CROSS-SERVICE — Multi-Table Full Cycle
// ═══════════════════════════════════════════

async function testMultiTableCycle() {
  console.log('\n═══ TEST 10: Cross-service — Multi-Table Concurrent Full Cycle ═══');
  const TABLES = 10;
  // productoId debe ser un UUID real (ver nota en TEST 3); la lista real vive en .data.data.
  const prods = await req('GET', '/inventario/productos', null, adminToken);
  const productoId1 = prods.data?.data?.[0]?.id;
  const productoId2 = prods.data?.data?.[1]?.id || productoId1;
  if (!productoId1) { console.log('  ⚠ No productos found, skipping'); return; }

  await runConcurrent(`${TABLES} tables doing full cycle simultaneously`, async (i) => {
    // Each "table" does: create mesa → create order → get cuenta → pay → delete mesa
    const mesa = await req('POST', '/mesas', {
      numero: Math.floor(Math.random() * 100000) + 7000 + i, capacidad: 4, ubicacion: `MULTI-${i}`
    }, adminToken);
    if (!mesa.ok) return mesa;

    const pedido = await req('POST', '/pedidos', {
      mesaId: mesa.data?.mesa?.id || mesa.data?.id,
      items: [
        { productoId: productoId1, cantidad: 2, area: 'COCINA' },
        { productoId: productoId2, cantidad: 1, area: 'BAR' }
      ]
    }, adminToken);

    const cuenta = await waitForCuenta(mesa.data?.mesa?.id || mesa.data?.id, adminToken);
    if (!cuenta.ok) return cuenta;
    return req('POST', '/caja/pagos', {
      cuentaId: cuenta.data?.id, montoRecibido: 55, metodo: 'TARJETA'
    }, adminToken);
  }, TABLES, TABLES);
}

// ═══════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════

function generateReport() {
  const now = new Date().toISOString();
  const totalTests = testResults.length;
  const totalRequests = testResults.reduce((s, t) => s + t.rounds, 0);
  const totalSuccess = testResults.reduce((s, t) => s + t.successes, 0);
  const totalFail = testResults.reduce((s, t) => s + t.failures, 0);
  const allP50 = testResults.map(t => t.latency.p50).filter(Boolean);
  const allP95 = testResults.map(t => t.latency.p95).filter(Boolean);
  const globalP50 = allP50.length ? Math.round(allP50.reduce((a, b) => a + b, 0) / allP50.length) : 0;
  const globalP95 = allP95.length ? Math.round(allP95.reduce((a, b) => a + b, 0) / allP95.length) : 0;

  let md = `# 📊 Stress & Concurrency Test Report\n\n`;
  md += `**Date:** ${now}  \n`;
  md += `**Base URL:** ${BASE}  \n`;
  md += `**Default Concurrency:** ${CONCURRENCY}  \n`;
  md += `**Default Rounds:** ${ROUNDS}  \n\n`;
  md += `---\n\n`;
  md += `## Executive Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Tests | ${totalTests} |\n`;
  md += `| Total Requests | ${totalRequests} |\n`;
  md += `| Successful | ${totalSuccess} (${totalRequests ? Math.round(totalSuccess / totalRequests * 100) : 0}%) |\n`;
  md += `| Failed | ${totalFail} (${totalRequests ? Math.round(totalFail / totalRequests * 100) : 0}%) |\n`;
  md += `| Global p50 Latency | ${globalP50}ms |\n`;
  md += `| Global p95 Latency | ${globalP95}ms |\n\n`;
  md += `---\n\n`;
  md += `## Detailed Results\n\n`;

  for (const t of testResults) {
    md += `### Test ${t.id}: ${t.label}\n\n`;
    md += `| Parameter | Value |\n|-----------|-------|\n`;
    md += `| Concurrency | ${t.concurrency} |\n`;
    md += `| Rounds | ${t.rounds} |\n`;
    md += `| Total Time | ${t.totalMs}ms |\n`;
    md += `| RPS | ${t.rps} |\n`;
    md += `| Successes | ${t.successes} |\n`;
    md += `| Failures | ${t.failures} |\n`;
    md += `| Status Codes | ${JSON.stringify(t.statuses)} |\n\n`;
    md += `**Latency:** avg=${t.latency.avg}ms | p50=${t.latency.p50}ms | p95=${t.latency.p95}ms | p99=${t.latency.p99}ms | max=${t.latency.max}ms\n\n`;
    md += `**Expected:** All requests return 2xx (200 or 201) with acceptable latency (p95 < 5000ms)\n\n`;
    md += `**Result:** ${t.failures === 0 ? '✅ PASS' : `⚠️ PARTIAL — ${t.failures} failures (${Math.round(t.failures / t.rounds * 100)}%)`}\n\n`;
    md += `---\n\n`;
  }

  md += `## Conclusions\n\n`;
  if (totalFail === 0) {
    md += `✅ **All tests passed.** The system handles ${CONCURRENCY} concurrent requests across all services without errors.\n\n`;
  } else {
    md += `⚠️ **Some failures detected.** ${totalFail} out of ${totalRequests} requests failed (${Math.round(totalFail / totalRequests * 100)}%). Review logs for details.\n\n`;
  }
  md += `- Global p50 latency: **${globalP50}ms**\n`;
  md += `- Global p95 latency: **${globalP95}ms**\n`;
  md += `- Total requests served: **${totalRequests}**\n`;

  return md;
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Stress & Concurrency Test Suite — All Services     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Base URL: ${BASE}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Rounds: ${ROUNDS}`);

  // Higiene T-28.4: arrancar con el presupuesto de login limpio para que el login
  // de setup no choque con un 429 dejado por una corrida o script anterior.
  await resetRateLimit('(arranque del suite)');
  await setupAuth();

  // Individual service tests
  await testLoginRateLimitBudget();
  await testMesasReads();
  await testMesasCreateAndRead();
  await testPedidosConcurrentCreate();
  await testCuentasConcurrent();
  await testReservasConcurrentCreate();
  await testReservasAvailabilityCheck();
  await testInventarioReads();
  await testInventarioCreateProduct();
  await testCajaConcurrent();
  await testReportesConcurrent();

  // Cross-service tests
  await testFullFlowConcurrent();
  await testMultiTableCycle();

  // Generate report
  const report = generateReport();
  const fs = await import('fs');
  const reportDir = 'stress-tests/reports';
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const filename = `${reportDir}/stress-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(filename, report);
  console.log(`\n\n📄 Report saved to: ${filename}`);
  console.log('\n' + report);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
