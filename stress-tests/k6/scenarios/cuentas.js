/**
 * servicio-cuentas (:3005) vía Kong. Lecturas + apertura de cuentas (escritura
 * → outbox cuenta.abierta). 409 = ya hay cuenta abierta en la mesa: respuesta
 * de negocio válida bajo concurrencia. cerrar/dividir quedan fuera: no tienen
 * idempotencia (gap conocido B-6, docs/auditoria-carga.md).
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad } from '../helpers.js';

export const options = {
  scenarios: { cuentas: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  const token = login();
  const opts = auth(token);
  // 20 mesas (medido 2026-07-13): abrirCuenta toma advisory lock POR MESA en su
  // tx — con una sola, 150 POSTs concurrentes se serializan en un lock y agotan
  // el pool (P2028). Con 20, la contención se reparte.
  const base = 800000 + Math.floor(Math.random() * 90000);
  const mesaIds = [];
  for (let i = 0; i < 20; i++) {
    const res = http.post(
      `${BASE}/mesas`,
      JSON.stringify({ numero: base + i, capacidad: 4, ubicacion: 'K6-CUENTAS' }),
      opts,
    );
    if (res.status !== 201) throw new Error(`setup: no se pudo crear mesa ${i} (${res.status})`);
    mesaIds.push(entidad(res.json(), 'mesa').id);
  }
  return { token, mesaIds };
}

export default function (data) {
  const opts = auth(data.token);
  const mesaId = data.mesaIds[Math.floor(Math.random() * data.mesaIds.length)];
  const r = Math.random();
  if (r < 0.6) {
    // La lectura real del dominio: cuenta por mesa (GET / raíz es health check).
    evaluar(http.get(`${BASE}/cuentas/mesa/${mesaId}`, opts), 'GET /cuentas/mesa/:id', [200, 404], () => true);
  } else if (r < 0.85) {
    evaluar(http.get(`${BASE}/cuentas`, opts), 'GET /cuentas (health)', [200], (b) => b.status === 'OK');
  } else {
    // Duplicado = 400 BadRequest ("La mesa ya tiene una cuenta abierta",
    // app.service.ts:82) — respuesta de negocio pactada bajo concurrencia.
    const res = http.post(`${BASE}/cuentas`, JSON.stringify({ mesaId }), opts);
    evaluar(res, 'POST /cuentas', [201, 400], (b, resp) => resp.status === 400 || !!entidad(b, 'cuenta').id);
  }
}
