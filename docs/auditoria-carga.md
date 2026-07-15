# Auditoría atómica de capacidad — pruebas de carga L1/L2/L3

**Fecha:** 2026-07-12 · **Rama:** `feat/resiliencia-s26` · **Fase 1 (solo lectura, cero cambios)**

Niveles objetivo del profesor: **L1 = 1.000** · **L2 = 500.000** · **L3 = 1.000.000** peticiones concurrentes contra todos los servicios.

---

## 0. Hechos transversales que aplican a los 9 servicios

Estos hallazgos salen de código compartido, así que valen para todos; la matriz por servicio (§1) solo lista lo que difiere.

### 0.1 Pool de base de datos — NO es el pool de Prisma, es `pg.Pool` con defaults

`libs/shared-prisma/src/lib/base-prisma.service.ts:17` crea el cliente con el driver adapter:

```ts
const pool = new Pool({ connectionString });   // pg.Pool con TODOS los defaults
const adapter = new PrismaPg(pool);
```

Consecuencias (verificado: ninguna `DATABASE_URL` de `infra/docker-compose.yml` lleva `connection_limit`, y los 9 `schema.prisma` tienen el datasource pelado, solo `provider = "postgresql"`):

- **`max = 10` conexiones** por proceso (default de `pg`). El parámetro `connection_limit` de la URL **se ignora** — con driver adapter manda `pg.Pool`, no el pool interno de Prisma.
- **`connectionTimeoutMillis = 0`** (default de `pg`): una petición que no consigue conexión **espera para siempre** en la cola interna del pool. Bajo saturación esto convierte el pool en una cola sin límite ni timeout → latencias que crecen sin techo y sin 503, hasta que el cliente (o Kong, a los 60 s) corta.
- **`idleTimeoutMillis = 10000`**: las conexiones ociosas se cierran a los 10 s → bajo carga oscilante hay churn de conexiones.

**Postgres correspondiente:** los 9 contenedores son `postgres:16-alpine` sin ningún tuning (`infra/docker-compose.yml`) → `max_connections = 100`, `shared_buffers = 128MB`. Con 1 réplica por servicio: 10 ≪ 100, **no hay riesgo de agotar conexiones**; el riesgo real es el contrario — el pool de 10 es el embudo y Postgres se queda infrautilizado.

### 0.2 RabbitMQ consumidor — bootstrap compartido

`libs/observabilidad/src/bootstrap.ts:80-100`:

- `prefetchCount = Number(RMQ_PREFETCH ?? 20)` — **20**; `RMQ_PREFETCH` no está en el compose, así que aplica el default en los 7 consumidores.
- `noAck: false` → ack manual.
- Cola durable con `x-dead-letter-exchange: NACHOPPS_DLX` y routing `dlq.<queue>`.

Ack/nack/reintentos: `libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts` — **3 reintentos** con backoff exponencial + jitter (base 1000 ms), `ack` en éxito, `nack(requeue=false)` al agotar → mensaje va a `dlq.<queue>` vía DLX. Emite `broker_consumer_lag_seconds`, `dlq_messages_total`, `retry_attempts_total{surface}`.

Declaración de colas/DLQ: `libs/shared-rabbitmq/src/lib/rabbitmq-publisher.service.ts:27-51` — exchanges `nachopps_exchange` (topic, durable) y `NACHOPPS_DLX`; por cada servicio con cola declara también `dlq.<queue>` durable y la ata al DLX. **Toda cola declarada tiene DLQ.**

### 0.3 Outbox — techo duro de 50 eventos/segundo por servicio

`libs/resiliencia/src/lib/outbox.processor.ts`: tick `EVERY_SECOND`, `batchSize = 50` (default, nadie lo sobreescribe), claim con `FOR UPDATE SKIP LOCKED`, `maxAttempts = 5` → FAILED. Publicación **secuencial** dentro del lote (un `await` por evento).

→ **Cada productor drena como máximo ~50 eventos/s** (menos, por la publicación secuencial con confirms). Cualquier prueba de escritura que genere eventos por encima de ese ritmo acumula backlog en `outbox_events` de forma lineal. No pierde mensajes (esa es la gracia), pero el "drenado post-carga" de la Fase 3 tardará `backlog/50` segundos como mínimo.

### 0.4 Límites HTTP — todos los servicios

`libs/observabilidad/src/bootstrap.ts` no configura body-parser ni timeouts de servidor:

- **Body JSON: 100 kb** (default de Express/body-parser). Suficiente; no es cuello de botella.
- **Timeouts Node defaults**: `keepAliveTimeout = 5 s`, `headersTimeout = 60 s`, `requestTimeout = 300 s`. El `keepAliveTimeout` de 5 s **por debajo** del keepalive de upstream de Kong (60 s) es la receta clásica de `502` esporádicos bajo carga (Kong reutiliza un socket que Node acaba de cerrar).
- Sin timeout de request en Nest: una query lenta retiene el socket hasta que Kong corta a los 60 s.
- Un solo proceso Node por contenedor, sin `cluster`: **1 event loop por servicio** = techo práctico de pocos miles de req/s por servicio en lecturas triviales, mucho menos con bcrypt/agregaciones.

### 0.5 docker-compose (dev, el que usan las pruebas)

`infra/docker-compose.yml`: **ningún servicio tiene `cpus`, `mem_limit`, `deploy.resources` ni `replicas`. Ningún servicio tiene `restart:`** (el prod sí: `unless-stopped`). Healthcheck: `wget http://localhost:3000/api/telemetry/metrics` cada 10 s, 5 reintentos, `start_period: 60s`. Sin límites, los 20+ contenedores compiten libremente por la CPU del host — bajo L2/L3 el ruido entre contenedores hace los números irreproducibles.

### 0.6 Métricas disponibles (todas las apps, vía `ObservabilidadModule`)

Expuestas en `/api/telemetry/metrics` (`libs/observabilidad/src/lib/observabilidad.module.ts:12-17`, `defaultMetrics: enabled`):

| Útil para saturación | Métrica | Fuente |
|---|---|---|
| ✅ Event loop lag | `nodejs_eventloop_lag_seconds` (+p50/p99) | prom-client default |
| ✅ CPU/heap proceso | `process_cpu_*`, `nodejs_heap_*` | prom-client default |
| ✅ Latencia HTTP | `http_request_duration_seconds` (buckets 0.01–5 s) | `metrics.interceptor.ts` |
| ✅ Volumen/errores HTTP | `http_requests_total{status_code}` | ídem |
| ✅ Consumo RMQ | `rabbitmq_messages_processed_total`, `rabbitmq_message_processing_duration_seconds` | ídem |
| ✅ Lag broker→consumidor | `broker_consumer_lag_seconds` | retry interceptor |
| ✅ DLQ | `dlq_messages_total` | retry interceptor |
| ✅ Outbox | `outbox_pending_total`, `outbox_failed_total`, `outbox_publish_lag_seconds` | outbox processor |
| ✅ Bulkhead | `bulkhead_in_flight`, `bulkhead_rejected_total` | bulkhead.ts |
| ✅ Breaker | `circuit_breaker_state`, `dependency_request_duration_seconds`, `dependency_timeout_total` | breaker/clients |

**Métricas que FALTAN para diagnosticar saturación:**

1. **Estado del `pg.Pool`** (`totalCount`/`idleCount`/`waitingCount`) — el cuello de botella n.º 1 de casi todos los servicios es invisible hoy.
2. **Profundidad de colas RabbitMQ desde el broker** (`rabbitmq_queue_messages`): el broker **no está scrapeado** — la imagen `rabbitmq:3-management` trae el plugin prometheus pero el puerto 15692 no está expuesto ni hay job en `infra/prometheus/prometheus.yml`. Hoy la profundidad de DLQ solo se infiere del contador del consumidor.
3. **Métricas de Kong** (plugin `prometheus` no está en `KONG_PLUGINS`): sin visibilidad de 429 del rate-limiting ni de latencia añadida por el gateway.
4. Buckets de `http_request_duration_seconds` topan en 5 s — bajo saturación todo cae en `+Inf` y el p99 pierde resolución.

---

## 1. Matriz por servicio

Puertos = host (compose mapea todos a 3000 interno). "Pool 10" = §0.1 en todos.

| # | Servicio (puerto) | Cola RMQ (prefetch 20) | Bindings que consume | DLQ | Outbox productor | Endpoints HTTP y protección |
|---|---|---|---|---|---|---|
| 1 | **identidad** (3001) | — (solo publica; `RabbitMQModule.forRoot(uri)` sin cola, `apps/servicio-identidad/src/app/app.module.ts:17`) | — | n/a | ✅ (`app.module.ts:15`) | `POST auth/login` (Kong 5/min/IP), `POST auth/refresh` (60/min), `POST auth/logout` (30/min), `GET auth/me`, `POST/GET usuarios`, `PATCH usuarios/:id/rol` — **sin idempotencia, sin bulkhead/breaker** (no llama a otros servicios) |
| 2 | **mesas** (3002) | `mesas_queue` | `cuenta.abierta`, `cuenta.cerrada` | ✅ `dlq.mesas_queue` | ✅ | `GET /`, `GET /:id`, `POST /`, `PATCH /:id/estado` — **cero primitivas de resiliencia en HTTP**; eventos con `RabbitMQRetryInterceptor` (`events.controller.ts:7`) |
| 3 | **pedidos** (3004) | `pedidos_queue` | `pago.registrado`, `mesa.creada`, `mesa.actualizada`, `producto.creado`, `producto.actualizado`, `stock.insuficiente` | ✅ | ✅ | `POST /` **CON `IdempotencyInterceptor`** (`app.controller.ts:19`); `GET /`, `PATCH /:id/estado`, `PATCH items/:itemId/estado` sin protección extra. Llamadas salientes a mesas e inventario **CON bulkhead (10/10) + breaker (timeout 2500 ms, 50 %, reset 30 s) + retry** (`mesas-http.client.ts`, `inventario-http.client.ts`) |
| 4 | **cuentas** (3005) | `cuentas_queue` | `pedido.creado`, `pedido.actualizado`, `pago.registrado` | ✅ | ✅ | `GET /`, `POST /`, `GET mesa/:mesaId`, `GET /:id`, **`POST /:id/dividir` y `POST /:id/cerrar` SIN idempotencia** (mutaciones de dinero); sin clientes HTTP salientes (el `PEDIDOS_SERVICE_URL` del compose no lo usa ningún código — env muerta) |
| 5 | **reservas** (3006) | — (solo publica) | — | n/a | ✅ | `GET /`, `GET disponibilidad`, `POST /`, `PATCH /:id/confirmar`, `DELETE /:id` — **cero primitivas** |
| 6 | **inventario** (3007) | `inventario_queue` | `pedido.creado` | ✅ | ✅ (`injectEventId: true` → dedupe en consumidor) | `GET` varios, `POST categorias/productos/lote`, `PATCH productos/:id[/stock]` — **sin idempotencia HTTP**; el descuento de stock por evento sí dedupe por `eventId` |
| 7 | **notificaciones** (3008) | `notificaciones_queue` | 9 routing keys (pedido.*, cuenta.*, ticket.generado, mesa.actualizada, reserva.*) | ✅ | ❌ (consumidor puro) | `GET /` (auditoría); `RabbitMQRetryInterceptor` a nivel de controller |
| 8 | **caja** (3009) | `caja_queue` | `pedido.entregado`, `cuenta.abierta`, `cuenta.cerrada` | ✅ | ✅ | `POST /pagos` **CON `IdempotencyInterceptor`** (`app.controller.ts:28`); turnos (`abrir`, `cerrar`, `arqueo`, `movimientos`) **sin idempotencia**; cliente a cuentas **CON bulkhead + breaker + retry** (`cuentas-http.client.ts`) |
| 9 | **reportes** (3010) | `reportes_queue` | `cuenta.cerrada` | ✅ | ❌ (consumidor puro) | `GET resumen/por-producto/por-turno/por-mesero` — solo lecturas, **sin caché ni protección**; agregaciones = queries pesadas contra pool de 10 |

`IdempotencyPurgeService` registrado en pedidos, caja, mesas, inventario, notificaciones y reportes; `OutboxAdmin` (`GET /outbox/failed`, `POST /outbox/:id/retry`) en los 7 productores.

---

## 2. Capas transversales

### 2.1 Kong (`infra/kong/kong.yml.template`, `infra/docker-compose.yml:437-471`)

- **Plugins globales:** `cors`, `rate-limiting` (**3000/min + 30000/h, `policy: local`**), `jwt-cache` (TTL 60 s, 10k entradas, `degraded_mode`, shm 12 MB).
- **Por ruta:** JWT RS256 en todas las rutas de servicio; login 5/min/IP, refresh 60/min, logout 30/min; `/telemetry/metrics` bloqueado con `request-termination` 404.
- **⚠️ EL hallazgo de la auditoría:** el `rate-limiting` global usa el default `limit_by: consumer`, y **todo el tráfico autenticado es el mismo consumer (`nachopps-app`)** → el límite de 3000/min (**50 req/s**) es un cubo único compartido por todo el sistema. 30000/h son **8,3 req/s sostenidos**. **Cualquier prueba de carga por encima de ~8-50 rps muere en 429 en el gateway sin tocar un solo servicio.** L1 (1.000 concurrentes) ya lo revienta.
- **Sin configurar** (defaults de Kong): `connect/write/read timeout` = 60 s por servicio, `retries = 5` (¡Kong reintenta él solo los 5xx idempotentes — amplificación de reintentos!), sin `upstream keepalive` tuning, `worker_processes` auto. Sin límite de conexiones upstream por servicio.

### 2.2 RabbitMQ broker (`infra/docker-compose.yml:10-24`)

`rabbitmq:3-management` **sin `rabbitmq.conf` ni límites**: `vm_memory_high_watermark = 0.4` (40 % de la RAM del host, al no haber `mem_limit` en el contenedor), `disk_free_limit = 50MB`, conexiones/canales ilimitados (channel_max 2047 por conexión). Con 9 servicios × (1 conexión publisher + 1 consumidor) el broker va sobradísimo en conexiones; el riesgo bajo L2/L3 es **memoria por acumulación en colas** si los consumidores (prefetch 20, procesamiento con BD) van más lentos que la publicación → el memory watermark bloquea a los publishers (backpressure del broker, no pérdida). Puerto 15692 (prometheus) no expuesto.

### 2.3 Postgres ×9

Defaults de imagen (§0.1): `max_connections = 100`, `shared_buffers = 128MB`, sin tuning. Riesgo de agotamiento de conexiones: **nulo con 1 réplica** (pool 10). Si algún día hay N réplicas: 10×N, agota a partir de ~9 réplicas por servicio. El riesgo real bajo carga es CPU/IO del host compartido entre 9 Postgres + 9 Node + broker + stack de observabilidad.

---

## 3. Veredicto por servicio: qué aguanta HOY y cuello de botella n.º 1

"Aguanta" = p95 < 2 s sin errores 5xx, tráfico vía Kong. Estimaciones sobre hardware de desarrollo típico (8-16 cores compartidos entre TODO el stack); el techo global lo pone Kong (§2.1) — estas cifras asumen que se levanta ese límite para la prueba.

| Servicio | Nivel que aguanta HOY | Cuello de botella n.º 1 |
|---|---|---|
| identidad | L1 solo en lecturas (`auth/me` con jwt-cache). Login: **5/min por diseño** — no es objetivo de carga | CPU de hashing en login; para el resto, pool pg=10 |
| mesas | L1 | Pool pg=10 con espera infinita (§0.1) |
| pedidos | L1 con degradación elegante (503 del bulkhead al pasar de ~20 llamadas salientes concurrentes) | **Bulkhead 10+10 hacia mesas/inventario**: en `POST /` cada pedido valida contra ambos → a >~200 rps de escritura, shed load masivo. Después, outbox a 50 ev/s (§0.3) |
| cuentas | L1 en lectura; escritura L1 justo | Pool pg=10 + **`cerrar`/`dividir` sin idempotencia** (bajo retry de Kong/cliente puede duplicar operaciones de dinero) |
| reservas | L1 | Pool pg=10 |
| inventario | L1 | Contención de fila en `PATCH productos/:id/stock` (updates concurrentes al mismo producto se serializan en Postgres) + pool 10 |
| notificaciones | L1 (HTTP es trivial) | Consumo: 9 bindings × prefetch 20; bajo L2/L3 de escrituras en el resto del sistema, su cola es la que más crece |
| caja | L1 | Bulkhead hacia cuentas + pool pg=10 |
| reportes | L1 solo con pocos usuarios: cada `GET resumen` es agregación sin caché | Queries de agregación contra pool de 10 — 10 requests lentas simultáneas bloquean el servicio entero |

**Cuellos de botella globales, en orden:** (1) rate-limiting de Kong 50 rps → 429; (2) pool pg=10 con cola infinita por servicio; (3) outbox 50 ev/s por productor; (4) un solo event loop por servicio sin límites de CPU en compose; (5) keepAlive 5 s Node vs 60 s Kong → 502 esporádicos.

---

## 4. ¿Es viable 1.000.000 de peticiones simultáneas en una máquina local? NO.

Afirmación explícita: **ni L3 (1M) ni L2 (500k) peticiones *concurrentes* reales son físicamente posibles en este stack ni en ninguna máquina local**, y no por el código:

- **Sockets:** 1M conexiones TCP simultáneas ≈ >10 GB solo en buffers de kernel + 1M file descriptors, contra un único proceso Node por servicio y un Kong con `worker_connections` por defecto. Docker Desktop en Windows (NAT + vpnkit) colapsa órdenes de magnitud antes.
- **Generador de carga:** k6 necesita del orden de 1-10 MB por VU → 1M VUs = del orden de terabytes de RAM. Nadie prueba "1M concurrentes" con 1M de sockets; se prueba **el ritmo de llegada equivalente**.
- **Little's Law:** concurrencia = throughput × latencia. 1M usuarios concurrentes con think-time de 10 s ≡ ~100.000 req/s de llegada. Este stack completo en un host hará, siendo optimistas, **2.000-5.000 req/s agregados** en lecturas (1 event loop/servicio, BDs sin tuning, todo compitiendo por la misma CPU). Es decir: L3 real exigiría ~20-50× el hardware.

### Equivalente honesto en k6 (lo que propondré implementar en Fase 3)

Modelar los niveles como **ritmo de llegada + volumen total**, no como VUs mágicos:

| Nivel | Semántica del profesor | Traducción k6 | Justificación |
|---|---|---|---|
| **L1** | 1.000 concurrentes | `constant-vus`/`ramping-vus` hasta **1.000 VUs reales** (~2-5 min) | 1.000 sockets sí caben en local; mide concurrencia real |
| **L2** | 500.000 peticiones | `ramping-arrival-rate`: escalar de 100 → **~1.500-2.000 req/s** hasta completar **500.000 requests totales** (~5-8 min) | Por Little's Law, 500k usuarios con think-time 10 s ≈ 50k rps — inalcanzable; se entrega el *volumen* L2 al máximo ritmo que el host sostenga, y el informe declara el rps de saturación medido |
| **L3** | 1.000.000 peticiones | Igual, hasta **1.000.000 requests totales**, manteniendo la meseta en el rps de saturación hallado en L2 (~10-15 min) | Demuestra estabilidad sostenida (sin degradación acumulativa: outbox drena, DLQ no crece, memoria plana) — que es lo único que L3 puede demostrar de más que L2 |

Los números de meseta (1.500-2.000 rps) son hipótesis a **calibrar con una corrida de descubrimiento** (ramp hasta fallo) el primer día de Fase 3; el criterio queda parametrizado en `levels.js`, no hardcodeado.

**Precondición innegociable para cualquier nivel:** subir/desactivar el rate-limiting global de Kong para el perfil de pruebas (es configurable por env: `KONG_RATE_LIMIT_MINUTE`/`KONG_RATE_LIMIT_HOUR` ya existen en el compose) — si no, los tres niveles son un benchmark del contador de 429 de Kong.
