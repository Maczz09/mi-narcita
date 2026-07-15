/**
 * servicio-reservas (:3006) vía Kong. Lecturas, disponibilidad y creación
 * (escritura → outbox reserva.creada). Fechas/horas aleatorias en un rango
 * amplio para que la mayoría de POST sean 201; 409 = choque de agenda válido.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad, nombreUnico } from '../helpers.js';

export const options = {
  scenarios: { reservas: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  return { token: login() };
}

function fechaAleatoria() {
  const d = new Date(Date.now() + (1 + Math.floor(Math.random() * 300)) * 86400000);
  return d.toISOString().slice(0, 10);
}

function horaAleatoria() {
  const h = 12 + Math.floor(Math.random() * 10);
  const m = Math.random() < 0.5 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
}

export default function (data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.5) {
    // Listado paginado: { data, nextCursor }
    evaluar(http.get(`${BASE}/reservas`, opts), 'GET /reservas', [200], (b) => Array.isArray(b.data) || Array.isArray(b.reservas));
  } else if (r < 0.7) {
    const url = `${BASE}/reservas/disponibilidad?fecha=${fechaAleatoria()}&hora=${horaAleatoria()}`;
    evaluar(http.get(url, opts), 'GET /reservas/disponibilidad', [200], (b) => typeof b.disponible === 'boolean');
  } else {
    const body = JSON.stringify({
      fecha: fechaAleatoria(),
      hora: horaAleatoria(),
      mesaPreferida: `K6-${1 + Math.floor(Math.random() * 500)}`,
      clienteNombre: nombreUnico('Cliente K6'),
      numComensales: 2,
    });
    evaluar(http.post(`${BASE}/reservas`, body, opts), 'POST /reservas', [201, 409], (b, resp) =>
      resp.status === 409 || !!entidad(b, 'reserva').id,
    );
  }
}
