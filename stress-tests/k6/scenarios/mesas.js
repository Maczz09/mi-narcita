/**
 * servicio-mesas (:3002) vía Kong. 70 % lecturas, 30 % escrituras (POST /mesas
 * pasa por el outbox → publica mesa.creada). 409 = numero duplicado, respuesta
 * de negocio válida bajo concurrencia.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad } from '../helpers.js';

export const options = {
  scenarios: { mesas: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  const opts = auth(data.token);
  if (Math.random() < 0.7) {
    evaluar(http.get(`${BASE}/mesas`, opts), 'GET /mesas', [200], (b) => Array.isArray(b) || Array.isArray(b.mesas));
  } else {
    // Rango acotado a 60 números (medido 2026-07-13): GET /mesas lista todo —
    // con 500 números la tabla llegaba a ~515 filas y serializar ~100KB × cientos
    // de req/s degeneraba en p99=timeout. 60 mesas es el tamaño real de un
    // restobar: respuestas ~13KB, los repetidos dan 409 (pactado) y cada 201
    // sigue ejercitando outbox → mesa.creada.
    const body = JSON.stringify({
      numero: 100000 + Math.floor(Math.random() * 60),
      capacidad: 4,
      ubicacion: 'K6-CARGA',
    });
    evaluar(http.post(`${BASE}/mesas`, body, opts), 'POST /mesas', [201, 409], (b, res) =>
      res.status === 409 || !!entidad(b, 'mesa').id,
    );
  }
}
