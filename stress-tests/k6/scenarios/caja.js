/**
 * servicio-caja (:3009) vía Kong. Lecturas de turno + movimientos de caja
 * (escritura). El endpoint idempotente de caja (POST /pagos) exige una cuenta
 * abierta con consumo real por cada pago (saga completa cuentas→caja); la
 * verificación de su interceptor bajo carga la cubre el escenario de pedidos
 * (mismo interceptor compartido) y run-stock-idempotency-dlq.js en Node.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad } from '../helpers.js';

export const options = {
  scenarios: { caja: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  const token = login();
  const opts = auth(token);
  // Abre turno si no hay uno activo (409/422 = ya abierto, válido).
  http.post(`${BASE}/caja/turnos/abrir`, JSON.stringify({ fondoInicial: 100 }), opts);
  const activo = http.get(`${BASE}/caja/turnos/activo`, opts);
  if (activo.status !== 200) throw new Error(`setup: no hay turno activo (${activo.status}) ${activo.body}`);
  const turno = entidad(activo.json(), 'turno');
  if (!turno.id) throw new Error('setup: turno activo sin id');
  return { token, turnoId: turno.id };
}

// Mezcla 45/25/20/10 (medido 2026-07-13): el resumen recalcula sobre TODOS los
// movimientos del turno por request (sin caché — hallazgo del informe); con 50%
// de resumen + 20% de escrituras, la propia corrida hacía crecer la agregación
// hasta degenerar en p99=timeout. Proporciones reales: turno-activo es la
// consulta frecuente; el resumen es pantalla de gerencia.
export default function (data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.45) {
    evaluar(http.get(`${BASE}/caja/turnos/activo`, opts), 'GET turno activo', [200], (b) => !!entidad(b, 'turno').id);
  } else if (r < 0.7) {
    evaluar(http.get(`${BASE}/caja`, opts), 'GET /caja', [200], () => true);
  } else if (r < 0.9) {
    evaluar(http.get(`${BASE}/caja/turnos/activo/resumen`, opts), 'GET turno resumen', [200], (b) =>
      typeof b.totalVentas === 'number' || !!b.turno,
    );
  } else {
    const body = JSON.stringify({ tipo: 'INGRESO', monto: 1, donde: 'K6-CARGA', motivo: 'prueba de carga' });
    evaluar(http.post(`${BASE}/caja/turnos/${data.turnoId}/movimientos`, body, opts), 'POST movimiento', [201], (b) => {
      const mov = entidad(b, 'movimiento');
      return !!(mov.id || mov.turnoId);
    });
  }
}
