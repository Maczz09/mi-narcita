---
tipo: adr
id: ADR-005
estado: aceptada
fecha: 2026-05-30
fuente: [apps/servicio-reservas/prisma/migrations/20260609010000_slot_unico_index/migration.sql:1]
---

# ADR-005 - Reserva con slot activo unico

**Contexto.** Dos clientes pueden intentar reservar el mismo slot (fecha, hora) a la
vez. Validar disponibilidad en el servicio (`GET /disponibilidad` → `POST /`) no
alcanza: entre la consulta y el insert otra reserva puede ganar la carrera y quedarian
dos reservas activas para el mismo slot (doble booking).
[apps/servicio-reservas/prisma/migrations/20260609010000_slot_unico_index/migration.sql:1]

**Decision.** El anti-doble-booking se garantiza en la base con un **indice unico
parcial**: `CREATE UNIQUE INDEX "Reserva_fecha_hora_active_unique" ON
"Reserva"("fecha","hora") WHERE estado IN ('PENDIENTE','CONFIRMADA')`. Bajo carrera,
exactamente un insert gana y el resto recibe violacion de unicidad que el servicio
traduce a 409. Las reservas canceladas no bloquean el slot porque quedan fuera del
predicado del indice. La migracion versiona el indice (antes se creaba en runtime con
`$executeRawUnsafe`, invisible para el drift check) y limpia duplicados preexistentes
conservando el mas antiguo.

**Alternativas descartadas.**
- *Validacion aplicativa (leer y luego insertar)*: pierde la carrera por definicion; se
  mantiene solo como pre-chequeo de UX.
- *Unique constraint total sobre (fecha, hora)*: bloquearia re-reservar un slot cuya
  reserva fue cancelada; el indice parcial limita la unicidad a estados activos.
- *Lock de tabla o advisory lock*: serializa todas las reservas, no solo las del mismo
  slot.

**Consecuencias.**
- Invariantes [slot-reserva-activo-unico](../invariantes/slot-reserva-activo-unico.md) y
  [exactamente-un-exito-bajo-carrera](../invariantes/exactamente-un-exito-bajo-carrera.md)
  verificados bajo estres (reports `concurrency-limits-*`).
- La granularidad del slot (global por fecha+hora, sin mesa especifica) es una decision
  de alcance separada: ver [ADR-010](ADR-010-granularidad-anti-doble-booking.md).

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
