/**
 * servicio-notificaciones (:3008) vía Kong. Consumidor puro (9 bindings); su
 * superficie HTTP es la auditoría de notificaciones. La presión real le llega
 * por RabbitMQ cuando los escenarios de escritura de los demás servicios
 * publican eventos — observar rabbitmq_queue_messages{queue="notificaciones_queue"}.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar } from '../helpers.js';

export const options = {
  scenarios: { notificaciones: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  evaluar(http.get(`${BASE}/notificaciones`, auth(data.token)), 'GET /notificaciones', [200], (b) =>
    Array.isArray(b) || Array.isArray(b.notificaciones),
  );
}
