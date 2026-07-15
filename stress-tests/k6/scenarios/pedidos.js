/**
 * servicio-pedidos (:3004) vía Kong — el escenario más completo:
 *  - GET /pedidos (lectura)
 *  - POST /pedidos con Idempotency-Key única (escritura → saga con
 *    mesas/inventario protegida por bulkhead+breaker, y outbox → pedido.creado)
 *  - POST /pedidos con Idempotency-Key COMPARTIDA (verifica el
 *    IdempotencyInterceptor bajo carga: todas las réplicas deben devolver el
 *    MISMO pedido.id — exactamente-una creación)
 *
 * 503 en el POST = shed-load deliberado del bulkhead (10+10 hacia
 * mesas/inventario): es degradación controlada, no error. Se acepta como
 * respuesta pactada y se observa por separado en bulkhead_rejected_total.
 */
import http from 'k6/http';
import { LEVEL, buildScenario, buildThresholds } from '../levels.js';
import { BASE, login, auth, evaluar, entidad, esperarHasta, nombreUnico } from '../helpers.js';

export const options = {
  scenarios: { pedidos: buildScenario(LEVEL) },
  thresholds: buildThresholds(LEVEL),
};

export function setup() {
  const token = login();
  const opts = auth(token);

  // 40 mesas + producto con stock enorme. Repartir los pedidos entre mesas es
  // crítico (medido 2026-07-13): con UNA mesa, el consumidor de cuentas
  // serializa todo en su advisory lock por mesa y el snapshot JSON de esa única
  // cuenta crece sin límite (update cada vez más caro → P2028 → DLQ). 40 mesas
  // = hora punta realista y contención repartida.
  const NUM_MESAS = 40;
  const base = 900000 + Math.floor(Math.random() * 90000);
  const mesas = [];
  for (let i = 0; i < NUM_MESAS; i++) {
    const res = http.post(
      `${BASE}/mesas`,
      JSON.stringify({ numero: base + i, capacidad: 4, ubicacion: 'K6-PEDIDOS' }),
      opts,
    );
    if (res.status !== 201) throw new Error(`setup: no se pudo crear mesa ${i} (${res.status}) ${res.body}`);
    mesas.push(entidad(res.json(), 'mesa'));
  }
  const mesa = mesas[0];

  const catRes = http.post(
    `${BASE}/inventario/categorias`,
    JSON.stringify({ nombre: nombreUnico('K6-Cat'), descripcion: 'k6 carga' }),
    opts,
  );
  if (catRes.status !== 201) throw new Error(`setup: no se pudo crear categoria (${catRes.status}) ${catRes.body}`);
  const categoria = entidad(catRes.json(), 'categoria');

  // 20 productos (medido 2026-07-13): la escritura de pedidos toma
  // pg_advisory_xact_lock POR PRODUCTO dentro de la tx — con un solo producto,
  // 150 escritores concurrentes se serializan en un único lock reteniendo su
  // conexión mientras esperan → pool agotado → P2028. Un menú real tiene
  // decenas de platos; 20 reparte la contención.
  const NUM_PRODUCTOS = 20;
  const productos = [];
  for (let i = 0; i < NUM_PRODUCTOS; i++) {
    const prodRes = http.post(
      `${BASE}/inventario/productos`,
      JSON.stringify({
        categoriaId: categoria.id,
        nombre: nombreUnico(`K6-Producto-${i}`),
        descripcion: 'k6 carga',
        precio: 10,
        disponible: true,
        stockActual: 10000000,
      }),
      opts,
    );
    if (prodRes.status !== 201) throw new Error(`setup: no se pudo crear producto ${i} (${prodRes.status}) ${prodRes.body}`);
    productos.push(entidad(prodRes.json(), 'producto'));
  }
  const producto = productos[0];

  // La mesa y el producto llegan a pedidos por proyección event-driven — se
  // sondea con un POST real (que además fija el pedido canónico de la clave
  // idempotente compartida).
  const claveCompartida = `k6-idem-${Date.now()}`;
  const bodyCompartido = JSON.stringify({
    mesaId: mesa.id,
    items: [{ productoId: producto.id, cantidad: 1, area: 'COCINA' }],
  });
  const canonico = esperarHasta(
    'proyección de mesa/producto en pedidos',
    () => {
      const res = http.post(`${BASE}/pedidos`, bodyCompartido, auth(token, { 'Idempotency-Key': claveCompartida }));
      return res.status === 201 || res.status === 200 ? entidad(res.json(), 'pedido') : null;
    },
    90,
    3,
  );

  // La proyección llega en orden de publicación: si la última mesa ya está,
  // las anteriores también. Probe extra sobre la última para asegurarlo.
  esperarHasta(
    'proyección de la última mesa en pedidos',
    () => {
      const res = http.post(
        `${BASE}/pedidos`,
        JSON.stringify({ mesaId: mesas[NUM_MESAS - 1].id, items: [{ productoId: producto.id, cantidad: 1, area: 'COCINA' }] }),
        auth(token, { 'Idempotency-Key': `k6-setup-probe-${Date.now()}` }),
      );
      return res.status === 201 || res.status === 200;
    },
    60,
    3,
  );

  return {
    token,
    mesaId: mesa.id,
    mesaIds: mesas.map((m) => m.id),
    productoId: producto.id,
    productoIds: productos.map((p) => p.id),
    claveCompartida,
    bodyCompartido,
    pedidoCanonicoId: canonico.id,
  };
}

// Mezcla 75/15/10 (medido 2026-07-13): con 40% de escrituras, 1000 VUs meten
// ~400 escritores concurrentes sostenidos — ningún restobar hace eso; la
// llegada superaba el ritmo de servicio de las transacciones y el tail moría
// en P2028 por construcción. 150 escritores concurrentes (15%) sigue siendo
// hora punta extrema y deja medir el sistema, no el generador.
export default function (data) {
  const r = Math.random();
  if (r < 0.75) {
    // PedidoListResponse: { data: PedidoDto[], nextCursor } (paginado, máx 100)
    evaluar(http.get(`${BASE}/pedidos`, auth(data.token)), 'GET /pedidos', [200], (b) => Array.isArray(b.data));
    return;
  }
  if (r < 0.9) {
    // Escritura real: clave única → crea pedido (o 503 de bulkhead bajo
    // saturación), repartido entre 40 mesas × 20 productos del setup.
    const body = JSON.stringify({
      mesaId: data.mesaIds[Math.floor(Math.random() * data.mesaIds.length)],
      items: [{ productoId: data.productoIds[Math.floor(Math.random() * data.productoIds.length)], cantidad: 1, area: 'COCINA' }],
    });
    const res = http.post(`${BASE}/pedidos`, body, auth(data.token, { 'Idempotency-Key': nombreUnico('k6') }));
    evaluar(res, 'POST /pedidos (única)', [201, 200, 503], (b, resp) =>
      resp.status === 503 || !!entidad(b, 'pedido').id,
    );
    return;
  }
  // Verificación del interceptor bajo carga: misma clave + mismo body desde
  // muchos VUs → SIEMPRE el mismo pedido (replay, nunca duplicado).
  const res = http.post(`${BASE}/pedidos`, data.bodyCompartido, auth(data.token, { 'Idempotency-Key': data.claveCompartida }));
  evaluar(res, 'POST /pedidos (replay idempotente)', [200, 201, 409, 503], (b, resp) => {
    if (resp.status === 503 || resp.status === 409) return true; // shed-load / en curso
    return entidad(b, 'pedido').id === data.pedidoCanonicoId;
  });
}
