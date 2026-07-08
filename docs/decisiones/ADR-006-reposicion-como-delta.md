---
tipo: adr
id: ADR-006
estado: aceptada
fecha: 2026-05-30
fuente: [libs/contracts/src/domains/inventario.ts:125, apps/servicio-inventario/src/app/app.service.ts:228]
---

# ADR-006 - Reposicion como delta

**Contexto.** La reposicion de stock (`PATCH /productos/:id/stock`) podria modelarse
como valor absoluto ("el stock ahora es 50") o como delta ("suman 20 unidades"). Con
valor absoluto, una reposicion concurrente con ventas pierde actualizaciones: si el
reponedor lee 30, llegan 5 ventas y luego escribe 50, las 5 ventas se esfuman.
[libs/contracts/src/domains/inventario.ts:125]

**Decision.** El comando de reposicion transporta un **delta** (`cantidad`) que se suma
al stock vigente dentro de una transaccion (`stockBase + delta`), nunca un valor
absoluto que lo reemplace. Asi la reposicion conmuta con los decrementos de venta
(ADR-004) y el resultado es correcto sin importar el orden de llegada.
[apps/servicio-inventario/src/app/app.service.ts:228]

**Alternativas descartadas.**
- *Set absoluto del stock*: pierde ventas concurrentes (lost update); solo seria valido
  con inventario congelado (conteo fisico), un caso operativo distinto.
- *Version optimista (campo `version` + retry)*: correcto pero mas complejo; el delta
  elimina el conflicto en lugar de detectarlo.

**Consecuencias.**
- Invariante [reposicion-como-delta](../invariantes/reposicion-como-delta.md)
  verificado en `stress-tests` (reposiciones concurrentes con ventas no pierden
  unidades).
- El endpoint publica `producto.actualizado` via outbox para refrescar las proyecciones
  locales de pedidos (ADR-003).
- Un conteo fisico que deba fijar stock absoluto requeriria un comando distinto y
  explicito (fuera del alcance actual).

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
