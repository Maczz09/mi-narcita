/**
 * servicio-identidad (:3001) vía Kong. Solo lecturas: el login tiene
 * rate-limit 5/min por diseño (control de abuso, no de carga) y crear usuarios
 * masivamente contaminaría el store de auth. Escritura por outbox y
 * idempotencia se cubren en pedidos/caja.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar } from '../helpers.js';

export const options = {
  scenarios: { identidad: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  const opts = auth(data.token);
  if (Math.random() < 0.8) {
    evaluar(http.get(`${BASE}/identidad/auth/me`, opts), 'GET auth/me', [200], (b) => !!(b.email || b.id || b.sub));
  } else {
    // UsuarioListResponse (contracts): { data: UsuarioDto[], nextCursor }
    evaluar(http.get(`${BASE}/identidad/usuarios`, opts), 'GET usuarios', [200], (b) => Array.isArray(b.data));
  }
}
