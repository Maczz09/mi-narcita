/**
 * L2/L3 — carga de SISTEMA COMPLETO (los 9 servicios simultáneamente).
 *
 * "Nivel 2: 500.000 / Nivel 3: 1.000.000 peticiones contra todos los
 * servicios" se ejecuta como volumen TOTAL del sistema entregado con 9
 * escenarios ramping-arrival-rate en paralelo (uno por servicio, meseta
 * K6_RATE/9 cada uno). Es la lectura fiel del enunciado (todos a la vez) y la
 * única viable: la calibración (stress-tests/reports/_calibrate.log) mostró
 * que el arnés NAT de Docker Desktop colapsa en arrival-rate >~500 rps contra
 * un solo servicio, y las capacidades por servicio medidas en L1 (caja ~130
 * it/s) hacen imposible 500k secuenciales por servicio en tiempo finito.
 *
 * Uso:
 *   k6 run --env LEVEL=L2 --env K6_RATE=400 stress-tests/k6/scenarios/sistema.js
 */
import http from 'k6/http';
import { LEVEL, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad, esperarHasta, nombreUnico } from '../helpers.js';

const RATE_TOTAL = Number(__ENV.K6_RATE || 400); // req/s del sistema (calibrado)
const TOTALS = { L2: 500000, L3: 1000000 };
const TOTAL = TOTALS[LEVEL];
if (!TOTAL) throw new Error(`sistema.js es solo para L2/L3 (LEVEL=${LEVEL})`);

const N = 9;
const ratePorServicio = Math.max(1, Math.round(RATE_TOTAL / N));
const rampSec = 60;
const holdSec = Math.max(60, Math.ceil((TOTAL - (RATE_TOTAL * rampSec) / 2) / RATE_TOTAL));

function escenario(execName) {
  return {
    executor: 'ramping-arrival-rate',
    startRate: 0,
    timeUnit: '1s',
    preAllocatedVUs: 100,
    maxVUs: 400,
    exec: execName,
    stages: [
      { duration: `${rampSec}s`, target: ratePorServicio },
      { duration: `${holdSec}s`, target: ratePorServicio },
      { duration: '30s', target: 0 },
    ],
  };
}

export const options = {
  scenarios: {
    identidad: escenario('identidadFn'),
    mesas: escenario('mesasFn'),
    pedidos: escenario('pedidosFn'),
    cuentas: escenario('cuentasFn'),
    reservas: escenario('reservasFn'),
    inventario: escenario('inventarioFn'),
    notificaciones: escenario('notificacionesFn'),
    caja: escenario('cajaFn'),
    reportes: escenario('reportesFn'),
  },
  thresholds: buildThresholds(LEVEL),
};

// ── Setup combinado: fixtures de los 9 dominios en una pasada ────────────────
export function setup() {
  const token = login();
  const opts = auth(token);

  // Mesas para pedidos (40) y cuentas (20) — locks repartidos (ver escenarios
  // individuales para la justificación medida de cada número).
  const basePedidos = 900000 + Math.floor(Math.random() * 80000);
  const mesasPedidos = [];
  for (let i = 0; i < 40; i++) {
    const res = http.post(`${BASE}/mesas`, JSON.stringify({ numero: basePedidos + i, capacidad: 4, ubicacion: 'K6-PEDIDOS' }), opts);
    if (res.status !== 201) throw new Error(`setup: mesa pedidos ${i} (${res.status})`);
    mesasPedidos.push(entidad(res.json(), 'mesa').id);
  }
  const baseCuentas = 800000 + Math.floor(Math.random() * 80000);
  const mesasCuentas = [];
  for (let i = 0; i < 20; i++) {
    const res = http.post(`${BASE}/mesas`, JSON.stringify({ numero: baseCuentas + i, capacidad: 4, ubicacion: 'K6-CUENTAS' }), opts);
    if (res.status !== 201) throw new Error(`setup: mesa cuentas ${i} (${res.status})`);
    mesasCuentas.push(entidad(res.json(), 'mesa').id);
  }

  const catRes = http.post(`${BASE}/inventario/categorias`, JSON.stringify({ nombre: nombreUnico('K6-Cat'), descripcion: 'k6 sistema' }), opts);
  if (catRes.status !== 201) throw new Error(`setup: categoria (${catRes.status})`);
  const categoriaId = entidad(catRes.json(), 'categoria').id;

  const productos = [];
  for (let i = 0; i < 20; i++) {
    const res = http.post(
      `${BASE}/inventario/productos`,
      JSON.stringify({ categoriaId, nombre: nombreUnico(`K6-Prod-${i}`), descripcion: 'k6 sistema', precio: 10, disponible: true, stockActual: 10000000 }),
      opts,
    );
    if (res.status !== 201) throw new Error(`setup: producto ${i} (${res.status})`);
    productos.push(entidad(res.json(), 'producto').id);
  }

  // Turno de caja (409/422 = ya abierto, válido)
  http.post(`${BASE}/caja/turnos/abrir`, JSON.stringify({ fondoInicial: 100 }), opts);
  const activo = http.get(`${BASE}/caja/turnos/activo`, opts);
  if (activo.status !== 200) throw new Error(`setup: turno activo (${activo.status})`);
  const turnoId = entidad(activo.json(), 'turno').id;

  // Pedido canónico (clave idempotente compartida) + espera de proyecciones
  const claveCompartida = `k6-idem-${Date.now()}`;
  const bodyCompartido = JSON.stringify({ mesaId: mesasPedidos[0], items: [{ productoId: productos[0], cantidad: 1, area: 'COCINA' }] });
  const canonico = esperarHasta(
    'proyección mesa/producto en pedidos',
    () => {
      const res = http.post(`${BASE}/pedidos`, bodyCompartido, auth(token, { 'Idempotency-Key': claveCompartida }));
      return res.status === 201 || res.status === 200 ? entidad(res.json(), 'pedido') : null;
    },
    90,
    3,
  );
  esperarHasta(
    'proyección de la última mesa en pedidos',
    () => {
      const res = http.post(
        `${BASE}/pedidos`,
        JSON.stringify({ mesaId: mesasPedidos[39], items: [{ productoId: productos[0], cantidad: 1, area: 'COCINA' }] }),
        auth(token, { 'Idempotency-Key': `k6-probe-${Date.now()}` }),
      );
      return res.status === 201 || res.status === 200;
    },
    60,
    3,
  );

  return { token, mesasPedidos, mesasCuentas, productos, categoriaId, turnoId, claveCompartida, bodyCompartido, pedidoCanonicoId: canonico.id };
}

// ── Cuerpos de iteración (mismas mezclas y contratos que los escenarios L1) ──
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function identidadFn(data) {
  const opts = auth(data.token);
  if (Math.random() < 0.8) {
    evaluar(http.get(`${BASE}/identidad/auth/me`, opts), 'GET auth/me', [200], (b) => !!(b.email || b.id || b.sub));
  } else {
    evaluar(http.get(`${BASE}/identidad/usuarios`, opts), 'GET usuarios', [200], (b) => Array.isArray(b.data));
  }
}

export function mesasFn(data) {
  const opts = auth(data.token);
  if (Math.random() < 0.7) {
    evaluar(http.get(`${BASE}/mesas`, opts), 'GET /mesas', [200], (b) => Array.isArray(b) || Array.isArray(b.mesas));
  } else {
    const body = JSON.stringify({ numero: 100000 + Math.floor(Math.random() * 60), capacidad: 4, ubicacion: 'K6-CARGA' });
    evaluar(http.post(`${BASE}/mesas`, body, opts), 'POST /mesas', [201, 409], (b, res) => res.status === 409 || !!entidad(b, 'mesa').id);
  }
}

export function pedidosFn(data) {
  const r = Math.random();
  if (r < 0.75) {
    evaluar(http.get(`${BASE}/pedidos`, auth(data.token)), 'GET /pedidos', [200], (b) => Array.isArray(b.data));
    return;
  }
  if (r < 0.9) {
    const body = JSON.stringify({ mesaId: pick(data.mesasPedidos), items: [{ productoId: pick(data.productos), cantidad: 1, area: 'COCINA' }] });
    const res = http.post(`${BASE}/pedidos`, body, auth(data.token, { 'Idempotency-Key': nombreUnico('k6') }));
    evaluar(res, 'POST /pedidos (única)', [201, 200, 503], (b, resp) => resp.status === 503 || !!entidad(b, 'pedido').id);
    return;
  }
  const res = http.post(`${BASE}/pedidos`, data.bodyCompartido, auth(data.token, { 'Idempotency-Key': data.claveCompartida }));
  evaluar(res, 'POST /pedidos (replay idempotente)', [200, 201, 409, 503], (b, resp) => {
    if (resp.status === 503 || resp.status === 409) return true;
    return entidad(b, 'pedido').id === data.pedidoCanonicoId;
  });
}

export function cuentasFn(data) {
  const opts = auth(data.token);
  const mesaId = pick(data.mesasCuentas);
  const r = Math.random();
  if (r < 0.6) {
    evaluar(http.get(`${BASE}/cuentas/mesa/${mesaId}`, opts), 'GET /cuentas/mesa/:id', [200, 404], () => true);
  } else if (r < 0.85) {
    evaluar(http.get(`${BASE}/cuentas`, opts), 'GET /cuentas (health)', [200], (b) => b.status === 'OK');
  } else {
    const res = http.post(`${BASE}/cuentas`, JSON.stringify({ mesaId }), opts);
    evaluar(res, 'POST /cuentas', [201, 400], (b, resp) => resp.status === 400 || !!entidad(b, 'cuenta').id);
  }
}

function fechaAleatoria() {
  const d = new Date(Date.now() + (1 + Math.floor(Math.random() * 300)) * 86400000);
  return d.toISOString().slice(0, 10);
}
function horaAleatoria() {
  const h = 12 + Math.floor(Math.random() * 10);
  return `${String(h).padStart(2, '0')}:${Math.random() < 0.5 ? '00' : '30'}`;
}

export function reservasFn(data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.5) {
    evaluar(http.get(`${BASE}/reservas`, opts), 'GET /reservas', [200], (b) => Array.isArray(b.data) || Array.isArray(b.reservas));
  } else if (r < 0.7) {
    evaluar(http.get(`${BASE}/reservas/disponibilidad?fecha=${fechaAleatoria()}&hora=${horaAleatoria()}`, opts), 'GET disponibilidad', [200], (b) => typeof b.disponible === 'boolean');
  } else {
    const body = JSON.stringify({ fecha: fechaAleatoria(), hora: horaAleatoria(), mesaPreferida: `K6-${1 + Math.floor(Math.random() * 500)}`, clienteNombre: nombreUnico('Cliente K6'), numComensales: 2 });
    evaluar(http.post(`${BASE}/reservas`, body, opts), 'POST /reservas', [201, 409], (b, resp) => resp.status === 409 || !!entidad(b, 'reserva').id);
  }
}

export function inventarioFn(data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.7) {
    evaluar(http.get(`${BASE}/inventario/productos`, opts), 'GET /productos', [200], (b) => Array.isArray(b.data) || Array.isArray(b.productos));
  } else if (r < 0.85) {
    evaluar(http.get(`${BASE}/inventario/categorias`, opts), 'GET /categorias', [200], (b) => Array.isArray(b) || Array.isArray(b.categorias));
  } else {
    const body = JSON.stringify({ categoriaId: data.categoriaId, nombre: nombreUnico('K6-Prod'), descripcion: 'k6', precio: 5, disponible: true, stockActual: 100 });
    evaluar(http.post(`${BASE}/inventario/productos`, body, opts), 'POST /productos', [201], (b) => !!entidad(b, 'producto').id);
  }
}

export function notificacionesFn(data) {
  evaluar(http.get(`${BASE}/notificaciones`, auth(data.token)), 'GET /notificaciones', [200], (b) => Array.isArray(b) || Array.isArray(b.notificaciones));
}

export function cajaFn(data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.45) {
    evaluar(http.get(`${BASE}/caja/turnos/activo`, opts), 'GET turno activo', [200], (b) => !!entidad(b, 'turno').id);
  } else if (r < 0.7) {
    evaluar(http.get(`${BASE}/caja`, opts), 'GET /caja', [200], () => true);
  } else if (r < 0.9) {
    evaluar(http.get(`${BASE}/caja/turnos/activo/resumen`, opts), 'GET turno resumen', [200], (b) => typeof b.totalVentas === 'number' || !!b.turno);
  } else {
    const body = JSON.stringify({ tipo: 'INGRESO', monto: 1, donde: 'K6-CARGA', motivo: 'carga sistema' });
    evaluar(http.post(`${BASE}/caja/turnos/${data.turnoId}/movimientos`, body, opts), 'POST movimiento', [201], (b) => {
      const mov = entidad(b, 'movimiento');
      return !!(mov.id || mov.turnoId);
    });
  }
}

export function reportesFn(data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.4) {
    evaluar(http.get(`${BASE}/reportes/resumen`, opts), 'GET /resumen', [200], (b) => typeof b === 'object' && b !== null);
  } else if (r < 0.7) {
    evaluar(http.get(`${BASE}/reportes/por-producto`, opts), 'GET /por-producto', [200], (b) => typeof b === 'object' && b !== null);
  } else {
    evaluar(http.get(`${BASE}/reportes/por-turno`, opts), 'GET /por-turno', [200], (b) => typeof b === 'object' && b !== null);
  }
}
