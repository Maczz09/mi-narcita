/**
 * servicio-reportes (:3010) vía Kong. Solo lecturas — pero las caras: cada
 * request es una agregación sin caché contra un pool de 10 conexiones. Es el
 * candidato n.º 1 a saturar el pool (observar pg_pool_waiting_count).
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar } from '../helpers.js';

export const options = {
  scenarios: { reportes: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  return { token: login() };
}

export default function (data) {
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
