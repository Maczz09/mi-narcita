---
tipo: adr
id: ADR-002
estado: aceptada
fecha: 2026-05-30
fuente: [apps/servicio-inventario/prisma/schema.prisma:38, libs/resiliencia/src/lib/outbox.processor.ts:60]
---

# ADR-002 - Transactional Outbox

**Contexto.** Un servicio que cambia estado y publica el evento en dos operaciones
separadas (commit a Postgres y publish a RabbitMQ) puede fallar entre ambas: estado
guardado sin evento (consumidores nunca se enteran) o evento publicado sin estado
(consumidores reaccionan a algo que no existe). No hay transaccion distribuida entre la
base y el broker. [apps/servicio-inventario/prisma/schema.prisma:38]

**Decision.** Patron Transactional Outbox en todos los servicios productores: el evento
se inserta como fila `OutboxEvent` (`status: PENDING`) **en la misma transaccion** que
el cambio de estado, y un `OutboxProcessor` (cron cada 1 s, unificado en
`libs/resiliencia`) lo publica al exchange con reintentos (5 fallos → `FAILED`), purga
de procesados e idempotencia. La atomicidad la da la transaccion local; la entrega, el
processor. [apps/servicio-inventario/prisma/schema.prisma:38, libs/resiliencia/src/lib/outbox.processor.ts:60]

**Alternativas descartadas.**
- *Publish directo tras el commit*: ventana de fallo entre commit y publish; es
  exactamente el problema a resolver.
- *Two-phase commit / transaccion distribuida*: RabbitMQ no participa en 2PC y el
  acoplamiento operativo seria mayor que el problema.
- *Change Data Capture (Debezium)*: garantia equivalente leyendo el WAL, pero suma una
  pieza de infraestructura pesada; el outbox con cron cubre la escala actual.

**Consecuencias.**
- Garantia **at-least-once**: puede publicarse un duplicado (crash tras publish y antes
  de marcar `PROCESSED`); los consumidores lo absorben con claim de `IdempotencyKey`.
- Lag de publicacion de hasta ~1 s (cron), medido por `outbox_publish_lag_seconds`.
- Los eventos `FAILED` requieren revision operativa (runbook del servicio productor).

**Adenda T-23 (2026-06-09) — mensajes persistentes.** El publisher
(`libs/shared-rabbitmq/src/lib/rabbitmq-publisher.service.ts`) ahora publica con
`persistent: true` (`deliveryMode: 2`). Sin esto, aunque colas y exchanges sean
durables, los mensajes viajaban transient: un reinicio del broker perdia los eventos
encolados aun no consumidos, pese a que el outbox ya los marco `PROCESSED` — rompiendo
la garantia at-least-once del patron. El canal es `ConfirmChannel`, asi que el `await`
del publish sigue resolviendo en el confirm del broker. [libs/shared-rabbitmq/src/lib/rabbitmq-publisher.service.ts:68]

**Adenda T-07 (2026-06-09) — processor unificado.** Las 7 copias byte-a-byte del
`OutboxProcessor` (una por servicio productor) se consolidaron en
`libs/resiliencia/src/lib/outbox.processor.ts`, registradas con
`OutboxModule.forService(PrismaService, { producer })`. Misma semantica; solo
desaparece la duplicacion. [libs/resiliencia/src/lib/outbox.processor.ts:60]

**Adenda T-08 (2026-06-09) — claim con SKIP LOCKED y escalado horizontal.** El
processor reclama cada lote con `UPDATE outbox_events SET status='PUBLISHING',
"claimedAt"=now() WHERE id IN (SELECT id … WHERE status='PENDING' ORDER BY
"createdAt" LIMIT N FOR UPDATE SKIP LOCKED) RETURNING *`. Esto habilita **varias
replicas por servicio**: cada una salta las filas bloqueadas por las demas, sin
publicar duplicados en el happy path. Se anade la columna `claimedAt` (migracion
`20260609040000_outbox_claimed_at` en los 7 servicios) y un cron de rescate (cada
minuto) que devuelve a `PENDING` los `PUBLISHING` huerfanos > 60s (replica caida a
mitad de lote), preservando at-least-once; el duplicado lo absorbe la idempotencia
del consumidor. Deroga la antigua "Restriccion de escalado: 1 replica" del README.
[libs/resiliencia/src/lib/outbox.processor.ts:60]

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
