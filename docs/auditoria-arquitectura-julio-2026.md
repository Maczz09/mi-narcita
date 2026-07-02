# Auditoría arquitectónica integral — NachoPps (julio 2026)

**Alcance:** 9 microservicios NestJS + PWA React 19, 6 libs compartidas, 9 Postgres (database-per-service), RabbitMQ, Kong, stack de observabilidad (Prometheus + Grafana + Loki + Jaeger), CI/CD, tooling de seguridad (SonarQube + ZAP + npm audit).

**Método:** lectura directa de código fuente actual (incluyendo working tree, no solo HEAD) contrastada contra los 11 ADRs, el catálogo de eventos, las 10 fichas de invariantes, los 9 índices de servicio y la auditoría previa (`docs/auditoria-nachopps-junio-2026.md`, junio 2026).

**Veredicto general:** Quality Gate SonarQube en Excellence (0 bugs, 0 code smells, 81% cobertura), el hallazgo crítico de junio (clave RSA privada committeada) remediado, sin hallazgos críticos nuevos. Único gap operativo: Alertmanager sin receiver activo.

Esta versión expande cada elemento con **qué es, por qué se usó, para qué sirve y cómo se usa** en este repo concreto, con archivo:línea donde aplica.

---

## 1. Arquitectura general

```
PWA (React/Vite) ──cookie httpOnly JWT + X-CSRF-Token──► Kong :8000
                                                            │ jwt · cors · rate-limit · jwt-cache
                          ┌─────────────────────────────────┴────────────────────────────────┐
                          │ identidad · mesas · pedidos · cuentas · reservas · inventario ·   │
                          │ notificaciones · caja · reportes  (9 microservicios NestJS)        │
                          └───────────────┬─────────────────────────────┬────────────────────┘
                                          │ Outbox transaccional         │ Postgres por servicio (×9)
                                          ▼
                                   RabbitMQ (nachopps_exchange, topic) + DLX/parking
```

### 1.1 Monorepo Nx

- **Qué es:** herramienta de build system y orquestación para monorepos (grafo de dependencias entre proyectos, caché de tareas, ejecución afectada por diff).
- **Por qué se usó:** con 9 microservicios + 1 PWA + 6 libs compartidas, un repo por proyecto obligaría a versionar y publicar `@org/contracts`, `@org/shared-auth`, etc. como paquetes npm separados cada vez que cambian — fricción alta para un equipo pequeño que necesita iterar rápido en contratos compartidos entre backend y frontend (ADR-009). Nx permite que todos importen la lib directamente desde el working tree.
- **Para qué sirve:** (a) `nx affected` corre solo build/test/lint de lo que cambió y sus dependientes — en CI evita recompilar 9 servicios cuando se toca 1; (b) caché local/remota de tareas; (c) generadores (`nx g @nx/nest:app`) para scaffolding consistente.
- **Cómo se usa:** `nx.json` registra los plugins (`@nx/webpack`, `@nx/vite`, `@nx/eslint`) que auto-detectan `test`, `build`, `lint`, `typecheck` por proyecto sin declarar targets a mano. En CI (`ci.yml`), el job principal corre `nx affected -t typecheck build test`. Localmente: `npm exec nx run-many -- --target=e2e --all --parallel=1`.

### 1.2 Microservicios NestJS + arquitectura event-driven

- **Qué es:** 9 servicios NestJS independientes, cada uno dueño de su propia base de datos Postgres, comunicados mayormente por eventos asíncronos vía RabbitMQ y, donde hace falta respuesta inmediata, por HTTP síncrono con circuit breaker.
- **Por qué se usó:** el dominio (restobar) tiene sub-dominios con ciclos de vida y tasas de cambio distintos — mesas cambia de estado constantemente, reportes es de solo lectura y crece lento, identidad casi no cambia. Un monolito acoplaría el release de todos a la parte más lenta. Además, event-driven desacopla productor de consumidor: `servicio-pedidos` no necesita saber que `servicio-inventario` existe, solo que alguien puede estar escuchando `pedido.creado`.
- **Para qué sirve:** aislar fallos (si `notificaciones` cae, `pedidos` sigue creando pedidos — el evento queda en la cola), escalar servicios de forma independiente, y permitir que cada equipo/feature evolucione su propio schema sin coordinar un ALTER TABLE global.
- **Cómo se usa:** cada servicio expone su API REST detrás de Kong bajo su propio prefijo (`/pedidos`, `/cuentas`, etc.), publica eventos de dominio a un exchange topic compartido tras confirmar su propia transacción (outbox, ver 3.1), y consume los eventos que le interesan declarando bindings de routing key.

### 1.3 Database-per-service (ADR-001)

- **Qué es:** cada uno de los 9 servicios tiene su propia instancia Postgres; ningún servicio hace queries directas contra el schema de otro.
- **Por qué se usó:** es el correlato obligado de tener servicios desplegables/escalables de forma independiente — una base compartida sería un acoplamiento oculto que reintroduce el monolito por la puerta trasera (cualquier cambio de schema de un servicio podría romper queries de otro). Ver `docs/decisiones/ADR-001-database-per-service.md`.
- **Para qué sirve:** cada servicio puede migrar su schema, cambiar de motor o escalar su Postgres sin coordinar con los demás; el "contrato" entre servicios queda forzado a ser el evento o el endpoint HTTP, nunca una tabla compartida.
- **Cómo se usa:** `infra/docker-compose.yml` declara 9 contenedores Postgres separados (uno por servicio); cada servicio tiene su propio `schema.prisma` y su propio historial de migraciones Prisma. Cuando un servicio necesita datos que "pertenecen" a otro, los replica localmente vía eventos (ver 1.4) en vez de hacer join cruzado.

### 1.4 Proyecciones locales / Event-carried state transfer (ADR-003)

- **Qué es:** patrón donde un servicio consumidor mantiene una copia local (proyección) de datos que pertenecen a otro servicio, actualizada por los eventos que ese otro servicio publica.
- **Por qué se usó:** `servicio-pedidos` necesita saber si una mesa existe y si un producto tiene stock suficiente en el momento de crear un pedido, pero no puede hacer una query síncrona a `servicio-mesas`/`servicio-inventario` por cada ítem sin acoplar disponibilidad y latencia entre servicios. Guardar una réplica local resuelve esto sin sacrificar el aislamiento de la base de datos.
- **Para qué sirve:** permite validar en una sola transacción local (con locks y `RETURNING`, ver 3.3) sin round-trips HTTP síncronos al servicio dueño del dato, y sin que la caída de ese servicio bloquee la creación de pedidos.
- **Cómo se usa:** `servicio-pedidos` tiene tablas `MesaLocal`/`ProductoLocal` en su propio Postgres, actualizadas al consumir `mesa.creada`, `producto.creado`, `producto.actualizado`. La fuente de verdad sigue siendo el servicio productor (`mesas`, `inventario`); la proyección es una caché eventualmente consistente, nunca escrita directamente por el usuario.

---

## 2. Servicios y dominios (detalle por servicio)

| Servicio | Responsabilidad | Por qué es un servicio separado | Publica | Consume |
|---|---|---|---|---|
| **identidad** | Auth, usuarios, auditoría | Es el único que toca claves privadas y credenciales; aislarlo limita el blast radius de una brecha | — | — |
| **mesas** | Estado/asignación de mesas | Cambia de estado constantemente (alta frecuencia de escritura) frente a otros dominios | `mesa.creada`, `mesa.actualizada` | `cuenta.abierta`, `cuenta.cerrada` |
| **pedidos** | Creación/evolución de pedidos, proyección local de mesas/productos | Es el servicio con más lógica de negocio (validación de stock, ítems) — se beneficia de estar solo | `pedido.creado/actualizado/listo` | `pago.registrado`, `mesa.creada`, `producto.creado/actualizado` |
| **cuentas** | Ciclo de vida de cuenta de mesa | Orquesta el dinero de una mesa (suma de pedidos, división, cierre) — dominio propio y sensible | `cuenta.abierta/cerrada`, `ticket.generado` | `pedido.creado/actualizado`, `pago.registrado` |
| **inventario** | Stock y catálogo | Fuente canónica de stock; necesita ser la única escritura autorizada para evitar oversell distribuido | `producto.creado/actualizado` | `pedido.creado` (descuenta stock) |
| **caja** | Pagos, cierre de turno | Dominio financiero/legal (arqueo, cierre Z) con reglas propias de auditoría | `pago.registrado` | `cuenta.abierta/cerrada` |
| **reservas** | Reservas de mesa | Ciclo de vida y reglas de concurrencia (anti-doble-booking) independientes del resto | `reserva.creada/cancelada` | — |
| **notificaciones** | Proyección de eventos → UI/KDS en vivo (WebSocket) | Es un sumidero puro de eventos, sin lógica de negocio propia — separado para no acoplar el resto a WebSocket | — | 7 eventos clave |
| **reportes** | Analítica de venta diaria (solo lectura) | Read-model que no debe competir por recursos con los servicios transaccionales | — | `cuenta.cerrada` |

3 routing keys están definidas en `libs/contracts` sin productor o consumidor activo hoy (`reserva.confirmada`, `mesa.asignada`, `mesa.liberada`; además `arqueo.realizado`, `stock.bajo`, `stock.descontado` sin productor) — son ganchos de extensión ya tipados, no bugs.

---

## 3. Patrones de diseño y técnicas de resiliencia

### 3.1 Transactional Outbox (ADR-002)

- **Qué es:** patrón que resuelve el problema de "escribir en la base de datos y publicar un evento" de forma atómica, sin usar 2PC (two-phase commit) entre Postgres y RabbitMQ.
- **Por qué se usó:** si un servicio escribe su fila y *después* publica a RabbitMQ como dos pasos separados, un crash entre medio deja el estado inconsistente — o se perdió el evento (la fila quedó pero nadie se enteró) o se duplicó. El outbox evita esto escribiendo el evento a publicar en la **misma transacción** que el cambio de negocio.
- **Para qué sirve:** garantiza at-least-once delivery de eventos sin sacrificar atomicidad, permitiendo escalar el publicador horizontalmente (varias réplicas) sin publicar duplicados en el caso feliz.
- **Cómo se usa:** cada servicio productor tiene una tabla `OutboxEvent`; al ejecutar el caso de uso (ej. crear pedido), la fila de negocio y la fila de outbox se insertan en la misma transacción Prisma. Un proceso separado (`libs/resiliencia/outbox.processor.ts`) hace polling y publica:
  - **Claim atómico multi-réplica:** `UPDATE "outbox_events" SET status='PUBLISHING', "claimedAt"=now() WHERE id IN (SELECT id ... WHERE status='PENDING' ORDER BY "createdAt" LIMIT N FOR UPDATE SKIP LOCKED) RETURNING *` — cada réplica del processor toma un lote distinto sin bloquearse entre sí ni publicar la misma fila dos veces.
  - **Estados:** `PENDING → PUBLISHING → PROCESSED` (éxito) o `→ FAILED` (routing key inválida o reintentos agotados).
  - **Rescate de huérfanos:** un cron de un minuto vuelve a `PENDING` los eventos `PUBLISHING` con más de 60s sin progreso (réplica caída a mitad de publicar) — preserva at-least-once; la idempotencia del consumidor (3.4) absorbe el duplicado ocasional.
  - **Purga con retención diferenciada:** `PROCESSED` se borra a las 24h, `FAILED` a las 168h (7 días), configurable por servicio vía `OutboxModule.forService(..., { retencionProcessedHoras, retencionFailedHoras })`.
  - **Métricas:** `outbox_pending_total`, `outbox_failed_total` (gauges), `outbox_publish_lag_seconds` (histograma, tiempo entre `createdAt` y publicación real) — alimentan el dashboard `outbox-health.json` y la alerta `OutboxPendingHigh` (umbral 200).

### 3.2 Circuit breaker (Opossum)

- **Qué es:** patrón que envuelve una llamada a un servicio externo/dependencia y "abre el circuito" (deja de intentar, falla rápido) cuando la tasa de errores supera un umbral, en vez de seguir bombardeando una dependencia caída.
- **Por qué se usó:** cuando `servicio-pedidos` llama por HTTP a `servicio-inventario` (o `servicio-mesas`) para validar algo síncronamente, una caída de esa dependencia sin circuit breaker generaría timeouts en cascada — cada request de pedidos esperaría 3s (el timeout) antes de fallar, agotando threads/conexiones del lado que llama.
- **Para qué sirve:** falla rápido (sin esperar el timeout completo) una vez detectado el patrón de fallo, da tiempo a que la dependencia se recupere, y permite un fallback controlado en vez de un 500 genérico.
- **Cómo se usa:** decorator `@CircuitBreaker` en `libs/resiliencia/circuit-breaker.decorator.ts` envuelve el método del cliente HTTP con Opossum: `timeout=3000ms` (falla si tarda más), `errorThresholdPercentage=50` (abre si >50% de las últimas llamadas fallaron), `resetTimeout=30000ms` (después de abrir, espera 30s antes de probar de nuevo en modo half-open). El estado se expone como gauge Prometheus `circuit_breaker_state{dependency="inventario"}` (0=cerrado, 1=abierto) y dispara la alerta `ERPCircuitBreakerOpen`.

### 3.3 Decremento atómico condicional / no-oversell (ADR-004)

- **Qué es:** técnica de compare-and-swap implementada en SQL puro (no en código de aplicación) para descontar stock sin permitir que dos requests concurrentes vendan más unidades de las que hay.
- **Por qué se usó:** el patrón ingenuo "leer stock, restar en memoria, escribir" tiene una condición de carrera clásica: dos requests leen `stock=1` al mismo tiempo, ambos calculan `0` y escriben, vendiendo 2 unidades con solo 1 en inventario (oversell). Un lock de aplicación (mutex en memoria) no sirve porque hay múltiples instancias del servicio.
- **Para qué sirve:** garantiza la invariante de negocio "nunca vender más stock del que existe" sin necesitar un lock distribuido explícito — la propia base de datos actúa como árbitro atómico.
- **Cómo se usa:** `UPDATE productos_locales SET "stockActual" = "stockActual" - cantidad WHERE "stockActual" >= cantidad RETURNING "stockActual"` — si la condición del `WHERE` falla (no hay stock suficiente), la fila no se actualiza y `RETURNING` viene vacío; el código lanza `BadRequestException`. Se complementa con `pg_advisory_xact_lock(hashtext(productoId))` antes del `UPDATE` en `servicio-pedidos` para serializar el acceso al mismo producto dentro de la transacción (evita que dos `UPDATE` concurrentes al mismo producto generen deadlocks de índice).

### 3.4 Idempotencia (dos mecanismos distintos)

**a) Idempotencia HTTP directa — header `Idempotency-Key`**
- **Qué es:** técnica estándar de APIs (Stripe la popularizó) para que un cliente pueda reintentar una request POST de forma segura sin ejecutar la operación dos veces.
- **Por qué se usó:** un timeout de red no le dice al cliente si el servidor procesó la request o no; sin esto, reintentar un `POST /pagos` podría cobrar dos veces.
- **Para qué sirve:** el cliente genera un UUID por operación de negocio (no por request HTTP) y lo manda en el header; el servidor lo trata como clave de deduplicación.
- **Cómo se usa:** `libs/resiliencia/idempotency.interceptor.ts` — en la primera llamada crea un registro `IdempotencyKey` con un hash sha256 del body; si la misma clave llega de nuevo con el mismo body y la operación ya terminó, devuelve la respuesta cacheada (mismo status code y body) sin re-ejecutar nada; si la clave está en vuelo (otra request con la misma clave no terminó), responde 409 (carrera); si la clave se reusa con un body *distinto*, responde 422 (mal uso del mecanismo). Si la ejecución falla, la clave se borra para permitir un reintento limpio.

**b) Idempotencia de consumidor — unique constraint + P2002**
- **Qué es:** mecanismo para que un consumidor de eventos no aplique dos veces el mismo evento si RabbitMQ lo redelivera (lo cual *va a pasar* bajo at-least-once delivery, por diseño del outbox).
- **Por qué se usó:** el outbox garantiza at-least-once, nunca exactly-once — es una decisión consciente (exactly-once distribuido es prohibitivamente complejo). La responsabilidad de "no duplicar el efecto" se traslada al consumidor.
- **Para qué sirve:** evita que `servicio-inventario` descuente stock dos veces si recibe `pedido.creado` repetido tras un rescate de huérfano o un nack/requeue.
- **Cómo se usa:** antes de aplicar el efecto de negocio, el consumidor intenta insertar una fila `IdempotencyKey` (columna única) dentro de la misma transacción Prisma que el efecto; si Prisma lanza `P2002` (violación de constraint único), significa que ese evento ya se procesó — el handler retorna sin error y sin reaplicar el efecto.

### 3.5 Retry + backoff exponencial + Dead Letter Queue (ADR-007, ADR-008)

- **Qué es:** política de reintentos en el consumidor de RabbitMQ con backoff creciente, y una cola de "muertos" (DLQ) para mensajes que fallan persistentemente, más una cola de "parking" para revisión manual.
- **Por qué se usó:** un fallo transitorio (ej. la base de datos del consumidor está momentáneamente ocupada) no debería descartar el mensaje ni bloquear la cola para siempre; pero un mensaje "envenenado" (payload corrupto, bug determinístico) reintentado infinitamente saturaría el consumidor y ocultaría el problema real.
- **Para qué sirve:** distingue fallos transitorios (se resuelven solos con un par de reintentos) de fallos permanentes (necesitan ojo humano), sin perder el mensaje en ningún caso.
- **Cómo se usa:** `libs/resiliencia/rabbitmq-retry.interceptor.ts` — `maxRetries=3`, backoff `initialDelay · 2^(intento-1)` ms entre reintentos. Éxito → `ack(msg)`. Reintentos agotados → `nack(msg, false, false)` (sin requeue) → el binding DLX de la cola lo redirige automáticamente a la Dead Letter Queue → de ahí a una cola de parking para inspección/reinyección manual (validado en `stress-tests/run-stock-idempotency-dlq.js`, que ejercita el ciclo completo DLQ→parking→reinyección con verificación de idempotencia). El propio interceptor mide y expone `dlq_messages_total` (contador) y `broker_consumer_lag_seconds` (histograma, tiempo entre publicación — vía header `x-published-at` puesto por el publisher — y consumo real).

### 3.6 Saga con compensación

- **Qué es:** patrón para coordinar una operación que abarca múltiples pasos/servicios sin una transacción distribuida, deshaciendo (compensando) los pasos ya aplicados si uno posterior falla.
- **Por qué se usó:** crear un pedido puede implicar validar stock en varios productos y afectar más de un servicio; no hay 2PC entre microservicios con bases separadas, así que la consistencia se logra con pasos + compensación en vez de atomicidad real.
- **Para qué sirve:** si falta stock para un ítem del pedido a mitad de proceso, el sistema no debe dejar el pedido a medio crear ni el stock a medio descontar — emite un evento de compensación (`StockInsuficiente`) que deshace lo ya reservado.
- **Cómo se usa:** `pedidos-saga.service.ts` toma un `pg_advisory_xact_lock` por `pedidoId` para serializar los pasos de la saga de ese pedido específico (evita que dos ejecuciones concurrentes de la misma saga se pisen), y emite la compensación dentro de la misma transacción que detecta el fallo.

### 3.7 Slot único con índice parcial (ADR-005, ADR-010)

- **Qué es:** en vez de resolver el anti-doble-booking con locks de aplicación, se usa un índice único parcial de Postgres sobre las columnas que definen "el mismo slot".
- **Por qué se usó:** dos requests de reserva concurrentes para el mismo horario/mesa no deben poder crear ambas una reserva activa — un `SELECT` seguido de `INSERT` en código de aplicación tiene la misma condición de carrera que el oversell de stock. ADR-010 (aceptada 2026-06-11) decidió explícitamente granularidad **por mesa** (`mesaPreferida` obligatoria) en vez de por franja horaria genérica, porque el negocio necesita saber *qué* mesa queda libre, no solo *que* hay alguna.
- **Para qué sirve:** rechaza a nivel de base de datos (con un error de constraint, no con lógica) el segundo intento de reservar el mismo `(fecha, hora, mesaPreferida)` mientras haya una reserva activa — imposible de burlar con una condición de carrera, porque el índice lo garantiza el motor, no el código.
- **Cómo se usa:** índice único parcial en `servicio-reservas` sobre `(fecha, hora, mesaPreferida)` filtrado por estado activo; `GET /reservas/disponibilidad` calcula qué mesas están libres para una franja consultando qué combinaciones no tienen fila activa.

### 3.8 Comando como delta, no como estado absoluto (ADR-006)

- **Qué es:** los comandos de reposición de stock llevan "sumá 20 unidades" en vez de "el stock ahora es 120".
- **Por qué se usó:** un comando de estado absoluto es peligroso bajo reordenamiento o reintento (¿qué pasa si dos reposiciones llegan desordenadas, o una se reintenta? Se puede pisar un valor más reciente con uno más viejo). Un delta es conmutativo y seguro de reintentar (aplicar +20 dos veces es un bug detectable de idempotencia, pero nunca "pisa" un valor correcto con uno viejo).
- **Para qué sirve:** hace que la reposición de stock sea segura de reintentar y de aplicar en cualquier orden respecto a otras reposiciones (no respecto a ventas, que usan su propio decremento condicional).
- **Cómo se usa:** el comando de reposición lleva un campo delta (cantidad a sumar), aplicado con `UPDATE ... SET stock = stock + delta`.

---

## 4. Observabilidad

### 4.1 OpenTelemetry (trazas distribuidas)

- **Qué es:** estándar abierto (vendor-neutral) para instrumentar trazas, métricas y logs, con un modelo común de spans y contexto propagado entre servicios.
- **Por qué se usó:** en un sistema de 9 servicios que se llaman entre sí por HTTP y se coordinan por eventos async, un log aislado por servicio no alcanza para responder "¿por qué este pedido tardó 4 segundos en aparecer en caja?" — hace falta poder seguir una request/evento a través de todos los servicios que tocó.
- **Para qué sirve:** correlaciona automáticamente HTTP entrante/saliente, queries a Postgres y publicaciones/consumos de RabbitMQ bajo un mismo `trace_id`, visualizable como una línea de tiempo (Jaeger) y cruzable con logs y métricas.
- **Cómo se usa:** `libs/observabilidad/tracing.ts` expone `initTracing(nombreServicio)`, que se invoca **antes** de `NestFactory` en el bootstrap de cada servicio (el orden importa: la auto-instrumentación necesita parchear los módulos HTTP/pg/amqp antes de que NestJS los importe). Usa `getNodeAutoInstrumentations()` para instrumentar automáticamente HTTP, RabbitMQ y Postgres sin tocar el código de negocio, exporta spans vía OTLP a un collector, y maneja `SIGTERM` con `sdk.shutdown()` (con fallback a stderr si el logger ya se cerró). Un formatter de Winston inyecta `trace_id`/`span_id` en cada línea de log para poder saltar de una traza a los logs exactos de ese request.

### 4.2 Prometheus (métricas)

- **Qué es:** sistema de métricas de series temporales basado en pull (scrapea endpoints `/metrics` periódicamente) con su propio lenguaje de queries (PromQL).
- **Por qué se usó:** las trazas responden "qué pasó en esta request puntual"; las métricas responden "cómo está el sistema en agregado ahora mismo" (percentiles de latencia, tasas de error, profundidad de colas) — son complementarias, no sustitutas.
- **Para qué sirve:** alimenta los dashboards de Grafana y las reglas de alerta; permite ver tendencias y detectar degradación antes de que se vuelva un incidente visible.
- **Cómo se usa:** cada servicio expone `/telemetry/metrics` en formato de exposición Prometheus (vía `prom-client`), bloqueado externamente en Kong (responde 404 a un scanner externo) pero scrapeable desde Prometheus dentro de la red Docker. Métricas relevantes definidas en el código:
  - `http_requests_total` / `http_request_duration_seconds` (interceptor genérico, por método/ruta/status)
  - `rabbitmq_messages_processed_total` / `rabbitmq_message_processing_duration_seconds`
  - `erp_timeout_rate_total` + `circuit_breaker_state` (cliente HTTP a inventario)
  - `pagos_registrados_total` / `pago_monto_soles` (caja)
  - `outbox_pending_total` / `outbox_failed_total` / `outbox_publish_lag_seconds`
  - `dlq_messages_total` / `broker_consumer_lag_seconds` (agregadas recientemente, sin commitear)
  - `pagos_cierre_remoto_pendiente_total` (agregada recientemente, sin commitear — ver 3.9/sección de trabajo en curso más abajo)
  - Patrón `getOrCreateGauge/Counter/Histogram`: evita que Jest/Vitest fallen por doble registro del mismo nombre de métrica al correr specs que importan el módulo más de una vez.

### 4.3 Reglas de alerta (Prometheus Alertmanager)

- **Qué es:** definiciones declarativas (`infra/prometheus/alert.rules.yml`) de condiciones sobre las métricas anteriores que, sostenidas por un tiempo (`for`), disparan una alerta con severidad.
- **Por qué se usó:** mirar dashboards manualmente no escala como estrategia de detección de incidentes; las alertas convierten "alguien tiene que estar mirando la pantalla" en "el sistema avisa cuando algo se sale de rango".
- **Para qué sirve:** cada alerta corresponde a un síntoma concreto de un modo de fallo ya conocido del sistema (ver tabla), no a un umbral genérico inventado.
- **Cómo se usa (estado actual, con cambios recientes sin commitear):**

| Alerta | Expresión (resumen) | Severidad | Qué detecta |
|---|---|---|---|
| `ERP_P95_LatencyHigh` | p95 de latencia HTTP a inventario > 5s | warning | Dependencia lenta antes de que abra el circuit breaker |
| `ErpTimeoutRateHigh` | timeouts a inventario > 5 en 5m | critical | Dependencia cayendo, reemplaza la vieja `PaymentTimeoutRateHigh` (renombrada por semántica más precisa) |
| `PagoCierrePendienteHigh` | pagos con cierre remoto fallido > 5 en 10m | critical | **Nueva** — pago cobrado pero cuenta no cerrada (ver 3.9) |
| `ERPCircuitBreakerOpen` | `circuit_breaker_state==1` | warning | El circuit breaker ya abrió — inventario está caído desde el punto de vista de pedidos |
| `OutboxPendingHigh` | eventos pendientes > 200 | warning | El outbox processor no da abasto o está caído (umbral bajado de 1000 a 200 — más sensible) |
| `BrokerConsumerLagHigh` | p95 de lag broker→consumo > 300s | warning | Un consumidor está atrasado procesando su cola (refactorizada de gauge simple a histograma p95) |
| `DLQGrowingFast` | mensajes a DLQ > 2/min | critical | Algo está fallando sistemáticamente en un consumidor (umbral bajado de 10 a 2/min) |

### 4.4 Grafana (dashboards)

- **Qué es:** capa de visualización sobre Prometheus/Loki/Jaeger.
- **Por qué se usó:** las métricas crudas en PromQL no son operables bajo presión (un incidente a las 3am); un dashboard pre-armado con los paneles correctos reduce el tiempo de diagnóstico.
- **Para qué sirve:** tres dashboards con propósitos distintos — `checkout_health.json` (salud técnica del flujo de cobro: latencia ERP, timeouts, circuit breaker, outbox, DLQ), `negocio.json` (métricas de negocio: pedidos/pagos por minuto, montos, ítems rechazados por stock), `outbox-health.json` (foco específico en el outbox por servicio).
- **Cómo se usa:** provisioning automático vía `infra/grafana/provisioning/datasources/datasource.yml`, que registra Prometheus + Loki + (recientemente, sin commitear) **Jaeger** como datasources, con `exemplarTraceIdDestinations` (Prometheus→Jaeger) y `derivedFields` (Loki→Jaeger, extrae `trace_id` del log JSON) — permite saltar de un pico de latencia en un dashboard directo a la traza exacta que lo causó.

### 4.5 Loki + Promtail (logs)

- **Qué es:** Loki es un backend de logs indexado solo por etiquetas (no full-text, más barato que ElasticSearch); Promtail es el agente que descubre contenedores Docker y les hace tail de sus logs.
- **Por qué se usó:** los logs de 9 servicios en contenedores separados son inútiles si hay que entrar contenedor por contenedor con `docker logs`; centralizarlos con etiquetas (`service`, `container`) permite filtrar y correlacionar con trazas.
- **Para qué sirve:** búsqueda de logs por servicio/contenedor, correlación con trazas vía `trace_id` extraído del JSON de log (`derivedFields` en Grafana).
- **Cómo se usa:** Promtail se monta sobre `/var/run/docker.sock`, autodescubre contenedores y envía a `http://loki:3100/loki/api/v1/push`; Loki corre sin autenticación (`auth_enabled=false`, red interna) con retención de 7 días en filesystem local.

### 4.6 Jaeger (UI de trazas)

- **Qué es:** UI y backend de almacenamiento de trazas distribuidas, receptor de los spans que exporta OpenTelemetry.
- **Por qué se usó:** OpenTelemetry define el formato y la instrumentación, pero necesita un backend que las reciba, almacene y muestre como línea de tiempo navegable — Jaeger es ese backend.
- **Para qué sirve:** ver el árbol completo de spans de una request/evento (qué servicio llamó a qué, cuánto tardó cada salto, dónde se perdió tiempo).
- **Cómo se usa:** en producción, el puerto de Jaeger **no se publica** (no expuesto al host) — se accede solo vía túnel SSH (`docs/operacion/jaeger-prod.md`), como control de acceso adicional dado que las trazas pueden contener metadata sensible.

### 4.7 Alertmanager

- **Qué es:** componente de Prometheus que recibe las alertas disparadas y decide a quién y cómo notificar (agrupación, deduplicación, ruteo a Slack/email/PagerDuty/etc.).
- **Por qué se usó:** sin él, las alertas de la sección 4.3 solo existirían como un estado "rojo" en un dashboard que hay que estar mirando — Alertmanager es la pieza que las convierte en una notificación activa.
- **Para qué sirve (en teoría):** agrupar alertas relacionadas (`group_by: [alertname, service]`), evitar spam (`group_wait=30s`, `repeat_interval=3h`), y rutear cada alerta al canal correcto.
- **Cómo se usa hoy — GAP DETECTADO:** el `receiver` configurado en `infra/alertmanager/alertmanager.yml` está **vacío**; la integración Slack está comentada en el archivo. Esto significa que las 7 alertas de la sección 4.3 se **calculan correctamente** pero **no llegan a ningún humano** fuera de mirar Grafana manualmente. Es el hallazgo operativo más concreto de esta auditoría — remediarlo es descomentar/configurar un `slack_configs` (o el canal que se decida) con el webhook correspondiente.

---

## 5. Seguridad

### 5.1 JWT dual: RS256 (usuario) + HS256 (servicio-a-servicio)

- **Qué es:** dos esquemas de firma de JWT distintos usados para dos audiencias distintas — RS256 (asimétrico, clave privada/pública) para tokens de usuario final, HS256 (simétrico, secreto compartido) para tokens de servicio-a-servicio (S2S).
- **Por qué se usó:** con un solo secreto HS256 compartido por todos, cualquier servicio que lo tenga podría *firmar* tokens válidos para cualquier otro — un servicio comprometido podría impersonar a cualquier usuario. Con RS256 para usuarios, solo `servicio-identidad` tiene la clave privada; el resto solo puede *verificar* con la clave pública, nunca firmar. Además, mezclar los dos esquemas sin control abre la "confusión de algoritmo" (un atacante fuerza al verificador a tratar una clave pública RS256 como si fuera un secreto HS256) — de ahí el claim `aud` obligatorio.
- **Para qué sirve:** limita qué puede hacer un servicio comprometido (no puede fabricar tokens de usuario) y permite revocar/rotar el secreto S2S sin tocar la infraestructura de claves de usuario.
- **Cómo se usa:** `libs/shared-auth/jwt.strategy.ts` valida ambos esquemas vía `secretOrKeyProvider`; para tokens con `rol: SISTEMA` (S2S), exige que el claim `aud` coincida con `process.env.SERVICE_NAME` del servicio que verifica — rechaza un token S2S válido pero destinado a otro servicio. `ServiceTokenService.generateServiceToken()` genera estos tokens del lado emisor.

### 5.2 CSRF double-submit

- **Qué es:** mitigación de CSRF (Cross-Site Request Forgery) donde el servidor pone un token en una cookie *y* el cliente debe repetirlo en un header custom; un atacante en otro sitio puede forzar que el navegador mande la cookie automáticamente, pero no puede leerla para copiarla al header (same-origin policy).
- **Por qué se usó:** el JWT de usuario vive en una cookie httpOnly (no en localStorage, para no ser robable por XSS) — pero eso reintroduce el riesgo de CSRF clásico que localStorage no tiene. Double-submit es el mecanismo estándar para cerrar ese hueco sin sacrificar httpOnly.
- **Para qué sirve:** una request de mutación (POST/PATCH/DELETE) sin el header `X-CSRF-Token` correcto es rechazada, aunque la cookie de sesión viaje automáticamente.
- **Cómo se usa:** comparación con `timingSafeEqual` (tiempo constante, para no filtrar por timing cuánto del token coincide) entre la cookie `nachopps.csrf_token` y el header `X-CSRF-Token`; exceptúa métodos seguros (`GET`/`HEAD`/`OPTIONS`) y tokens Bearer (que no llevan cookie, así que no aplica CSRF).

### 5.3 Kong API Gateway

- **Qué es:** gateway de API que centraliza cross-cutting concerns (auth, rate-limit, CORS) en una capa delante de todos los servicios, en vez de reimplementarlos en cada uno.
- **Por qué se usó:** sin un gateway, cada uno de los 9 servicios necesitaría su propia lógica de rate-limiting/CORS/verificación JWT — duplicación y superficie de error. Centralizarlo en Kong da defensa en profundidad (Kong verifica JWT *además* de que cada servicio lo vuelva a verificar) y un único punto para políticas globales.
- **Para qué sirve:** login rate-limited a 5/min/IP (mitiga fuerza bruta), refresh a 60/min, verificación JWT RS256 a nivel de gateway (rechaza tokens inválidos antes de que lleguen al servicio), CORS centralizado, y bloqueo explícito de `/telemetry/metrics` para que un scanner externo no encuentre el endpoint de métricas.
- **Cómo se usa:** plugin `jwt` (verifica `iss`, clave pública inyectada vía template), plugin `rate-limiting`, plugin `cors`, plugin custom `jwt-cache` (Lua, TTL 60s, hasta 10k entradas, con "modo degradado" que acepta tokens válidos hasta su `exp` si `servicio-identidad` está caído — evita que la caída de identidad tumbe la verificación de *todos* los tokens ya emitidos). Admin API de Kong (`:8001`) solo accesible en loopback en producción.

### 5.4 Gestión de secretos (Docker secrets)

- **Qué es:** mecanismo de Docker para inyectar secretos como archivos montados en `/run/secrets/` en vez de variables de entorno planas (que quedan visibles en `docker inspect`, logs de proceso, etc.).
- **Por qué se usó:** una variable de entorno con la clave privada JWT es visible en cualquier herramienta que inspeccione el proceso o el contenedor; un archivo en `/run/secrets/` con permisos restringidos reduce esa superficie.
- **Para qué sirve:** separar "cómo se distribuye el secreto" (overlay de Docker) de "cómo lo consume la app" (variable de entorno de siempre) sin cambiar el código de la aplicación.
- **Cómo se usa:** `infra/docker-compose.secrets.yml` monta cada secreto como archivo; `infra/entrypoint.sh` recorre las variables `*_FILE` y las vuelca a la variable de entorno equivalente (`DATABASE_URL_FILE` → `DATABASE_URL`) antes de arrancar `node main.js`. El hallazgo crítico de junio 2026 (clave RSA privada real committeada en `infra/docker-compose.yml`) está remediado: `infra/secrets/jwt_private_key` en el árbol actual contiene solo un placeholder.

### 5.5 Tooling de seguridad (SonarQube, OWASP ZAP, npm audit)

- **SonarQube — qué es / por qué / cómo:** análisis estático (SAST) de calidad y seguridad de código. Se usó para tener un gate objetivo (no subjetivo) de calidad antes de un release — hoy en **Excellence** (0 bugs, 0 code smells, 81% cobertura). Se corre con `scripts/sonar-scan.ps1` (Docker `sonarsource/sonar-scanner-cli`), consumiendo la cobertura generada por `nx run-many -t test --coverage`.
- **OWASP ZAP — qué es / por qué / cómo:** escaneo dinámico (DAST) que ataca la API/PWA corriendo, buscando vulnerabilidades solo detectables en runtime (headers de seguridad faltantes, XSS reflejado, cookies mal configuradas). Se usó porque SAST no puede ver cómo responde el servidor realmente a un payload malicioso. `scripts/zap-baseline.ps1` corre un baseline scan con reglas FAIL explícitas sobre XSS/SQLi/clickjacking/CSP/cookies.
- **npm audit — qué es / por qué / cómo:** escaneo de vulnerabilidades conocidas (CVE) en dependencias de terceros. Se usó porque la mayoría de brechas reales vienen de dependencias desactualizadas, no de código propio. Corre como gate en CI: `npm audit --omit=dev --audit-level=high` rompe el build si aparece una vulnerabilidad de severidad alta o crítica en dependencias de producción.
- **Gap detectado:** los tres corren en local a demanda; solo `npm audit` está wireado en el pipeline de CI automático. SonarQube y ZAP dependen de que alguien los corra manualmente antes de un release.

### 5.6 Guard de entorno en seeds

- **Qué es:** validación en el propio script de seed (`scripts/poblar-datos.ts`) que aborta si detecta que el destino es producción.
- **Por qué se usó:** un script de datos de demo apuntado por error a `DATABASE_URL` de producción (typo en una variable de entorno, copia de `.env` equivocada) puede borrar/corromper datos reales — un incidente típico y evitable con una validación de 5 líneas.
- **Para qué sirve:** convierte un error operativo silencioso en un fallo ruidoso e inmediato.
- **Cómo se usa:** el script chequea `process.env.NODE_ENV === 'production'` y también que el hostname de la URL de conexión sea localhost/`.local` — aborta con excepción si cualquiera de las dos condiciones sugiere producción.

---

## 6. Infraestructura y despliegue

### 6.1 Dockerfile multi-stage

- **Qué es:** un único Dockerfile con varias etapas (`pruner` → `builder` → `proddeps` → `production`) donde cada etapa produce artefactos que la siguiente consume, y solo la última se convierte en la imagen final.
- **Por qué se usó:** compilar TypeScript y generar el cliente Prisma requiere devDependencies y el compilador — pero nada de eso debe existir en la imagen que corre en producción (superficie de ataque y tamaño de imagen). Multi-stage permite tener todo lo necesario para *construir* sin que quede nada de eso en lo que se *despliega*.
- **Para qué sirve:** imagen final mínima (sin TypeScript, sin devDependencies, sin código fuente, solo `dist/` compilado + `node_modules` de producción), reproducible (digest pinning de la imagen base Node por SHA256 en vez de tag `latest`, que puede cambiar de contenido).
- **Cómo se usa:** etapa `pruner` extrae solo los `package.json` de los workspaces (para que el caché de Docker no se invalide por cambios de código, solo por cambios de dependencias); `builder` corre `npm ci --ignore-scripts` (evita ejecutar scripts arbitrarios de postinstall de paquetes de terceros durante el build) y compila; `proddeps` reinstala solo dependencias de producción; `production` copia únicamente lo necesario y corre como usuario no-root `node`.

### 6.2 Docker Compose: dev / prod / secrets

- **Qué es:** tres archivos compose con propósitos distintos que se combinan con `-f` — uno para desarrollo local, otro para producción, y un overlay de secrets.
- **Por qué se usó:** dev necesita todos los puertos expuestos para poder debuggear cada servicio directamente y credenciales simples memorizables; producción necesita exactamente lo opuesto (nada expuesto salvo la entrada pública, credenciales obligatorias sin default). Mezclar ambos en un solo archivo con flags condicionales sería más frágil que tener archivos separados y explícitos.
- **Para qué sirve:** `docker-compose.yml` (dev) — credenciales hardcodeadas simples, todos los puertos publicados, `KONG_HEADERS: off`. `docker-compose.prod.yml` — variables obligatorias con sintaxis `${VAR:?error}` (el propio compose falla al levantar si falta una), puertos cerrados salvo Kong/PWA/Grafana, `stop_grace_period=30s` (tiempo para shutdown limpio antes de SIGKILL), sidecar de backup con retención, Watchtower para actualizaciones. `docker-compose.secrets.yml` — overlay que monta los secretos como archivos (ver 5.4).

### 6.3 Entrypoint (`infra/entrypoint.sh`)

- **Qué es:** script que corre como punto de entrada de cada contenedor de servicio, antes de arrancar la app Node.
- **Por qué se usó:** hay pasos de arranque que no le corresponden al código de la aplicación (cargar secretos desde archivo, esperar que la base de datos esté aceptando conexiones, aplicar migraciones) — hacerlo en shell antes de `exec node` mantiene la app misma simple.
- **Para qué sirve:** garantiza que el servicio nunca arranca contra una base de datos no lista o con un schema desactualizado.
- **Cómo se usa:** (1) vuelca `*_FILE` a variables de entorno, (2) espera con `nc -z` a que el host:puerto de `DATABASE_URL` responda, (3) corre `prisma migrate deploy` (aplica migraciones ya generadas y versionadas — deliberadamente *no* usa `prisma db push --accept-data-loss`, que podría borrar datos silenciosamente si el schema diverge), (4) `exec node main.js` — el `exec` es importante: reemplaza el proceso del shell en vez de crear un hijo, para que Node sea PID 1 y reciba señales (`SIGTERM`) directamente del orquestador para poder hacer shutdown limpio.

### 6.4 CI/CD (GitHub Actions)

- **Qué es:** pipeline automático que corre en cada push/PR.
- **Por qué se usó:** para que ningún cambio llegue a `main`/producción sin pasar por typecheck, build, tests, auditoría de dependencias y verificación de que las migraciones de base de datos no divergieron del schema.
- **Para qué sirve:** feedback automático y consistente, sin depender de que un humano se acuerde de correr todo localmente.
- **Cómo se usa:** job principal corre `nx affected -t typecheck build test` (solo lo que cambió, gracias a Nx); job de dependencias corre `npm audit --omit=dev --audit-level=high` como gate; job de drift de migraciones levanta una shadow database y compara `prisma migrate diff` contra el schema real, rompiendo el build si divergieron (evita el escenario "el schema de Prisma dice una cosa, las migraciones aplicadas en producción dicen otra"); un job adicional verifica que las copias de configuración de skills de agentes IA estén sincronizadas. `deploy.yml` separado construye y publica cada servicio a GHCR (GitHub Container Registry) con matriz por servicio y caché de build de GitHub Actions.

### 6.5 Backups

- **Qué es:** `pg_dump` automatizado de las 9 bases de datos.
- **Por qué se usó:** database-per-service multiplica por 9 el riesgo de "una base se corrompe y no hay respaldo" si no se automatiza desde el día uno.
- **Para qué sirve:** poder restaurar un punto en el tiempo ante corrupción de datos, error humano (DELETE sin WHERE) o fallo de infraestructura.
- **Cómo se usa:** sidecar en `docker-compose.prod.yml` que corre `pg_dump` por horario contra las 9 bases, comprime con gzip, y purga backups viejos según una retención configurable (`find ... -mtime +N -delete`).

### 6.6 Stress-tests / chaos testing

- **Qué es:** suite de scripts (`stress-tests/`, expuestos como `npm run probar:*`) que ejercitan el sistema bajo condiciones adversas reales (no mocks) contra el stack Docker levantado.
- **Por qué se usó:** los invariantes de resiliencia (no-oversell, exactamente-un-éxito-bajo-carrera, colas-limpias-happy-path) son afirmaciones sobre comportamiento bajo concurrencia y fallo — no se pueden verificar con un test unitario determinístico, hace falta generar la condición de carrera o el fallo real.
- **Para qué sirve:** confianza empírica (no solo teórica) de que los patrones de la sección 3 realmente sostienen sus garantías bajo carga y caos.
- **Cómo se usa:** `run-rabbitmq-chaos.js` tumba y levanta RabbitMQ y verifica que los servicios sigan vivos y las colas se reconecten solas; `run-stock-idempotency-dlq.js` fuerza el ciclo completo DLQ→parking→reinyección verificando que la idempotencia del consumidor evite doble efecto; `run-outbox-replicas.js` corre múltiples réplicas del outbox processor concurrentemente para verificar que en el caso feliz cada evento se publica exactamente una vez, y que matar una réplica a mitad de publicar no pierde eventos (rescate de huérfanos); `run-high-contention.js` / `run-concurrency-limits.js` generan carga concurrente alta sobre stock y reservas para stress-testear los locks advisory y los índices únicos parciales.

---

## 7. Stack tecnológico (resumen por capa)

| Capa | Tecnología | Por qué esta elección (resumen) |
|---|---|---|
| Backend | NestJS 11 + TypeScript strict | Estructura opinionada (módulos/DI) que escala bien a 9 servicios sin reinventar convenciones en cada uno; `strict` + `no-explicit-any` fuerza a modelar los contratos entre servicios en vez de pasar `any` |
| ORM/DB | Prisma 7 + PostgreSQL ×9 | Migraciones versionadas y tipadas; Postgres por sus garantías transaccionales fuertes (necesarias para `FOR UPDATE SKIP LOCKED`, advisory locks, índices parciales — piezas centrales de la resiliencia del sistema) |
| Mensajería | RabbitMQ (topic exchange + DLX) | Topic exchange permite bindings flexibles por routing key sin acoplar productor a la lista de consumidores; DLX nativo de RabbitMQ evita reimplementar DLQ a mano |
| Frontend | React 19 + Vite + React Query + Router v7 | React Query maneja caché/reintento/invalidación de datos del servidor sin Redux; Vite para dev server rápido |
| Gateway | Kong 3.9 | Gateway maduro con plugins JWT/CORS/rate-limit listos, extensible con Lua para el plugin custom `jwt-cache` |
| Observabilidad | OpenTelemetry + Prometheus + Grafana + Loki + Jaeger | Combinación estándar de la industria (los "tres pilares": métricas, logs, trazas) con instrumentación vendor-neutral |
| Resiliencia | Opossum + outbox/retry propios | Opossum por ser la librería de circuit breaker de facto en Node; outbox/retry escritos a medida porque encapsulan invariantes de negocio específicas (idempotencia, DLX bindings) que una librería genérica no cubre |
| Seguridad | SonarQube + OWASP ZAP + npm audit + Helmet + bcrypt + JWT RS256/HS256 | Cobertura de las tres categorías de riesgo: código propio (SAST), comportamiento en runtime (DAST), dependencias de terceros (SCA) |
| Infra | Docker multi-stage + Compose (dev/prod/secrets) + GHCR + Watchtower | Reproducibilidad (digest pinning) + separación clara de entornos + actualización automática de imágenes en prod (Watchtower) |
| Monorepo | Nx 22 + npm workspaces | Ver 1.1 |
| Testing | Jest + Vitest + Playwright + stress-tests custom | Jest/Vitest para unitarios/integración rápidos; Playwright para e2e real de la PWA; stress-tests custom porque los invariantes de concurrencia no son testeables con frameworks de test convencionales (ver 6.6) |

---

## 8. Trabajo en curso (sin commitear al momento de esta auditoría)

- **`apps/servicio-caja/src/app/app.service.ts`:** antes, si el pago se registraba en caja pero el cierre remoto de la cuenta (llamada HTTP a `servicio-cuentas`) fallaba, solo quedaba un `logger.warn`. Ahora se agrega el contador `pagos_cierre_remoto_pendiente_total`, un log estructurado (`errorCode: CIERRE_REMOTO_FAILED`, `resultingState: PAGO_SIN_CIERRE_CONFIRMADO`) y la alerta `PagoCierrePendienteHigh` — convierte un modo de fallo antes solo visible grepeando logs en algo observable y alertable. Es conceptualmente el mismo patrón que un `PAYMENT_UNKNOWN` de una pasarela de pago externa.
- **`apps/servicio-pedidos/src/app/mesas-http.client.ts`:** fix de un bug de URL duplicada — llamaba a `${MESAS_URL}/mesas/${mesaId}` cuando `MESAS_URL` ya incluye el segmento `/mesas`; corregido a `${MESAS_URL}/${mesaId}`.
- **`libs/resiliencia/rabbitmq-retry.interceptor.ts` + `libs/shared-rabbitmq/rabbitmq-publisher.service.ts`:** agregan el header `x-published-at` en publicación y lo leen en consumo para calcular `broker_consumer_lag_seconds`, más el contador `dlq_messages_total`.
- **Dashboards y `alert.rules.yml`:** actualizados para reflejar las métricas nuevas de arriba (ver tabla de la sección 4.3).
- **`stress-tests/run-all-stress-tests.js`:** hardening de las pruebas mismas (reintentos con backoff esperando la propagación async del outbox, IDs de mesa aleatorios para evitar colisiones entre corridas, uso de UUIDs de producto reales en vez de inventados).

---

## 9. Estado frente a la auditoría de junio 2026

| Hallazgo (junio) | Severidad | Estado ahora |
|---|---|---|
| H-01 Clave PEM privada committeada | 🔴 crítico | **Remediado** — placeholder en `infra/secrets/`, sin clave real en el árbol |
| H-06 Cobertura ~53%/45% | 🟡 medio | **Remediado** — 81% cobertura, Quality Gate Excellence |
| Resto (H-02 a H-13) | — | No re-verificado en esta pasada (foco puesto en arquitectura/resiliencia/observabilidad) |

No se hallaron **hallazgos críticos nuevos**. El único gap operativo real es Alertmanager sin receiver activo (sección 4.7).

---

## 10. Recomendaciones priorizadas

1. **Activar un receiver en Alertmanager** (Slack u otro canal) — hoy las 7 alertas de `alert.rules.yml` no llegan a ningún humano.
2. **Commitear el trabajo en curso** (sección 8) — ya validado y coherente; congelarlo sin commit es el único riesgo real de esta sesión.
3. **Actualizar `docs/operacion/ficha-observabilidad-checkout.md`** para reflejar `broker_consumer_lag_seconds` como histograma y documentar `pagos_cierre_remoto_pendiente_total`.
4. **Wirear SonarQube/ZAP en el pipeline de CI** (hoy son scripts manuales locales) para que el Quality Gate Excellence no dependa de que alguien lo corra a mano.
5. Re-auditar los hallazgos H-02 a H-08 de junio (tipado de `PedidoSnapshot`, Idempotency-Key estable en retry del cliente PWA, modo tolerante de `SERVICE_AUD_ENFORCE`) para confirmar si siguen abiertos.
