---
tipo: adr
id: ADR-004
estado: aceptada
fecha: 2026-05-30
fuente: [apps/servicio-inventario/src/app/app.service.ts:288]
---

# ADR-004 - Decremento atomico condicional

**Contexto.** Varios pedidos concurrentes pueden descontar el mismo producto. Un
read-modify-write clasico (`SELECT stock` → validar → `UPDATE`) tiene carrera: dos
transacciones leen stock=1, ambas validan y ambas descuentan, dejando stock=-1
(oversell). [apps/servicio-inventario/src/app/app.service.ts:288]

**Decision.** El descuento se hace en una sola sentencia condicional atomica:
`updateMany({ where: { id, stockActual: { gte: cantidad } }, data: { stockActual:
{ decrement: cantidad } } })`. Si `count === 0` no habia stock suficiente y se rechaza;
la base serializa condicion y decremento en la misma operacion.
[apps/servicio-inventario/src/app/app.service.ts:288]

**Alternativas descartadas.**
- *Lock pesimista (`SELECT ... FOR UPDATE`)*: correcto pero serializa lectores y alarga
  la transaccion; la sentencia condicional logra lo mismo con menos superficie.
- *Validar en pedidos contra su proyeccion local*: la proyeccion es eventual (ADR-003);
  solo filtra lo obvio, la garantia real debe vivir en el dueño del dato.
- *Aislamiento SERIALIZABLE global*: resuelve la carrera con reintentos por aborto y
  coste en todo el servicio; excesivo para un invariante puntual.

**Consecuencias.**
- El invariante [no-oversell](../invariantes/no-oversell.md) queda garantizado bajo
  carrera (verificado por `stress-tests/run-stock-idempotency-dlq.js` y los reports
  `stock-idempotency-dlq-*`).
- Combinado con el claim de `IdempotencyKey` por pedido, un `pedido.creado` reentregado
  no descuenta dos veces ([idempotencia-directa](../invariantes/idempotencia-directa.md)).
- Productos con `stockActual: null` no gestionan stock y quedan fuera del descuento.

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
