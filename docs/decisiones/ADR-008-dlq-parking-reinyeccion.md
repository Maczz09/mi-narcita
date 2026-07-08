---
tipo: adr
id: ADR-008
estado: aceptada
fecha: 2026-05-30
fuente: [libs/shared-rabbitmq/src/lib/rabbitmq-publisher.service.ts:35, stress-tests/run-stock-idempotency-dlq.js:22]
---

# ADR-008 - DLQ, parking y reinyeccion

**Contexto.** Con ack/nack manual (ADR-007), los mensajes que agotan reintentos
necesitan un destino: descartarlos pierde eventos de negocio (un `pedido.creado` no
descontado); dejarlos en la cola principal bloquea el resto. Hace falta un lugar de
cuarentena auditable y un procedimiento para reprocesarlos tras corregir la causa.
[libs/shared-rabbitmq/src/lib/rabbitmq-publisher.service.ts:35]

**Decision.** Cada cola de servicio declara dead-lettering hacia el exchange
`NACHOPPS_DLX` (topic, durable) con routing key `dlq.<cola>`; el publisher asegura por
servicio una DLQ durable `dlq.<cola>` bindeada a ese DLX. El flujo operativo es:
mensaje agotado → DLQ (cuarentena) → diagnostico → **reinyeccion** a la cola original
si la causa se corrigio, o **parking** (cola de estacionamiento) si requiere analisis
mas largo, segun el procedimiento de
[fallo-consumidor-dlq-reinyeccion-parking](../flujos/fallo-consumidor-dlq-reinyeccion-parking.md).
[stress-tests/run-stock-idempotency-dlq.js:22]

**Alternativas descartadas.**
- *Descartar tras reintentos*: pierde eventos con efecto monetario o de stock; el
  sistema quedaria inconsistente en silencio.
- *Requeue infinito*: el mensaje venenoso bloquea la cola (ver ADR-007).
- *Una DLQ global unica*: mezcla dominios y complica el diagnostico y la reinyeccion
  selectiva; una DLQ por cola mantiene el blast radius por servicio.

**Consecuencias.**
- Ningun evento se pierde: o se procesa, o queda auditable en `dlq.<cola>`.
- La reinyeccion puede producir duplicados (at-least-once); los absorbe la idempotencia
  del consumidor ([idempotencia-inversa](../invariantes/idempotencia-inversa.md)).
- La metrica `dlq_messages_total` (ADR-007) permite alertar cuando una DLQ crece; el
  runbook de cada servicio incluye el procedimiento de inspeccion y reinyeccion.
- El escenario completo se verifica en `stress-tests/run-stock-idempotency-dlq.js`
  (reports `stock-idempotency-dlq-*`).

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
