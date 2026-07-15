/**
 * Corrida de descubrimiento (README §"Calibrar la meseta"): sube el ritmo de
 * llegada en escalones contra un endpoint de lectura mixta (mesas) hasta
 * encontrar el req/s de saturación real del host. Ese valor alimenta --rate
 * en L2/L3 — no se hardcodea.
 *
 * Uso:  k6 run stress-tests/k6/calibrate.js
 */
import http from 'k6/http';
import { BASE, login, auth, evaluar } from './helpers.js';

export const options = {
  scenarios: {
    calibracion: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 6000,
      stages: [
        { duration: '30s', target: 500 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 1500 },
        { duration: '30s', target: 2000 },
        { duration: '30s', target: 2500 },
        { duration: '30s', target: 3000 },
        { duration: '20s', target: 0 },
      ],
    },
  },
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  evaluar(http.get(`${BASE}/mesas`, auth(data.token)), 'GET /mesas', [200], (b) => Array.isArray(b) || Array.isArray(b.mesas));
}
