/**
 * Helpers compartidos de los escenarios k6. Corren dentro de k6 (Goja), no Node.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE = __ENV.BASE_URL || 'http://localhost:8000';

/** Respuestas fuera del contrato del escenario (incluye 5xx no pactados). */
export const erroresInesperados = new Rate('errores_inesperados');

/**
 * status 0 = la petición nunca obtuvo respuesta HTTP: error de dial/reset del
 * arnés (proxy NAT de Docker Desktop en Windows saturado a ~1000 conexiones).
 * Verificado en runtime: durante un L1 con 3.4% de status 0, Kong solo registró
 * 200s (kong_http_requests_total) — la app nunca vio esas peticiones. Se miden
 * aparte para no confundir ruido del testbed con errores del sistema.
 */
export const erroresRed = new Rate('errores_red');

export function login() {
  const res = http.post(
    `${BASE}/identidad/auth/login`,
    JSON.stringify({
      email: __ENV.K6_USER || 'admin@nachopps.pe',
      password: __ENV.K6_PASS || 'nachopps123',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login falló: ${res.status} ${res.body}`);
  }
  const token = res.json('access_token');
  if (!token) throw new Error('Login sin access_token en la respuesta');
  return token;
}

export function auth(token, extraHeaders = {}) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
  };
}

/** Algunas respuestas vienen envueltas ({ mesa: {...} }) y otras planas. */
export function entidad(body, key) {
  if (body && typeof body === 'object' && body[key]) return body[key];
  return body;
}

/**
 * Check de negocio (Fase 3.4): status dentro del contrato del escenario Y
 * cuerpo válido — no solo "no fue 500".
 */
export function evaluar(res, nombre, esperados, checkBody) {
  if (res.status === 0) {
    erroresRed.add(1);
    erroresInesperados.add(0);
    return null;
  }
  erroresRed.add(0);
  const statusOk = esperados.includes(res.status);
  erroresInesperados.add(!statusOk);
  let body = null;
  if (statusOk && checkBody) {
    try {
      body = res.json();
    } catch {
      body = null;
    }
  }
  check(res, {
    [`${nombre} → ${esperados.join('/')}`]: () => statusOk,
    ...(statusOk && checkBody
      ? { [`${nombre}: cuerpo válido`]: () => body !== null && !!checkBody(body, res) }
      : {}),
  });
  return statusOk ? body : null;
}

/**
 * Para setup(): reintenta hasta que fn devuelva algo truthy (p. ej. esperar la
 * proyección event-driven de una mesa/producto en el servicio consumidor).
 */
export function esperarHasta(descripcion, fn, timeoutSec = 60, intervalSec = 2) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const out = fn();
    if (out) return out;
    sleep(intervalSec);
  }
  throw new Error(`setup: timeout esperando ${descripcion}`);
}

export function nombreUnico(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
