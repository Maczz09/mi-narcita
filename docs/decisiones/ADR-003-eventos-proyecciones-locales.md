---
tipo: adr
id: ADR-003
estado: aceptada
fecha: 2026-05-30
fuente: [libs/contracts/src/events/routing-keys.ts:5, apps/servicio-pedidos/prisma/migrations/20260528000000_add_productos_locales/migration.sql:1]
---

# ADR-003 - Eventos y proyecciones locales

**Contexto.** Con database-per-service (ADR-001), pedidos necesita leer mesas y
productos, caja necesita saber que cuentas estan abiertas y reportes necesita las
ventas cerradas — pero ninguno puede consultar la base del otro. Consultar por HTTP en
cada lectura añade latencia al hot path de venta y acopla disponibilidad: si inventario
cae, el comandero no podria ni listar productos. [libs/contracts/src/events/routing-keys.ts:5]

**Decision.** Los servicios publican eventos de dominio (routing keys tipados en
`libs/contracts/src/events/routing-keys.ts`) via outbox, y cada consumidor materializa
una **proyeccion local** de lo que necesita leer: `MesaLocal` y `ProductoLocal` en
pedidos, `CuentaAbierta` en caja, `VentaDiaria` en reportes. Las lecturas son siempre
locales; los eventos solo actualizan la proyeccion.
[apps/servicio-pedidos/prisma/migrations/20260528000000_add_productos_locales/migration.sql:1]

**Alternativas descartadas.**
- *Consulta HTTP sincrona en cada lectura*: acopla disponibilidad y suma latencia; se
  reserva solo para validaciones puntuales de escritura (pedidos→mesas,
  pedidos→inventario, caja→cuentas) protegidas con circuit breaker.
- *Leer la base ajena directamente (replica de lectura)*: rompe el ownership del
  esquema (ADR-001); el productor no podria migrar sin romper lectores.

**Consecuencias.**
- Consistencia eventual: la proyeccion puede atrasarse el lag de outbox+broker; el
  invariante critico (no-oversell) NO depende de la proyeccion sino del decremento
  atomico en el dueño del dato (ADR-004).
- Todo consumidor debe ser idempotente (claim de `IdempotencyKey`), porque outbox
  garantiza at-least-once.
- Los eventos son contrato publico: sus cambios se rigen por la
  [politica de versionado](../gobierno/politica-versionado.md).

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
