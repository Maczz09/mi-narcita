/**
 * servicio-inventario (:3007) vía Kong. Lecturas de catálogo + creación de
 * productos (escritura → outbox producto.creado). La contención de stock
 * (PATCH :id/stock sobre la misma fila) ya la cubre el script Node
 * run-high-contention.js — no se duplica aquí.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad, nombreUnico } from '../helpers.js';

export const options = {
  scenarios: { inventario: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  const token = login();
  const catRes = http.post(
    `${BASE}/inventario/categorias`,
    JSON.stringify({ nombre: nombreUnico('K6-Cat-Inv'), descripcion: 'k6 carga' }),
    auth(token),
  );
  if (catRes.status !== 201) throw new Error(`setup: no se pudo crear categoria (${catRes.status})`);
  return { token, categoriaId: entidad(catRes.json(), 'categoria').id };
}

export default function (data) {
  const opts = auth(data.token);
  const r = Math.random();
  if (r < 0.7) {
    // Listado paginado: { data, nextCursor }
    evaluar(http.get(`${BASE}/inventario/productos`, opts), 'GET /productos', [200], (b) => Array.isArray(b.data) || Array.isArray(b.productos));
  } else if (r < 0.85) {
    evaluar(http.get(`${BASE}/inventario/categorias`, opts), 'GET /categorias', [200], (b) => Array.isArray(b) || Array.isArray(b.categorias));
  } else {
    const body = JSON.stringify({
      categoriaId: data.categoriaId,
      nombre: nombreUnico('K6-Prod'),
      descripcion: 'k6 carga',
      precio: 5,
      disponible: true,
      stockActual: 100,
    });
    evaluar(http.post(`${BASE}/inventario/productos`, body, opts), 'POST /productos', [201], (b) => !!entidad(b, 'producto').id);
  }
}
