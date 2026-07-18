# Plan de implementación — Resiliencia (S26)

> Objetivo: cerrar los gaps del audit de resiliencia (timeouts, retries, circuit
> breaker, bulkhead, backpressure, degradación y señales) sobre la codebase
> **nachopos** (microservicios NestJS + Nx). El PDF de la sesión 26 es solo el
> **checklist de qué buscar**; el naming y la forma los manda el código.

## Contexto para una sesión nueva

- **Repo:** POS de restaurante (`nachopos`), no un checkout genérico. Dependencias reales:
  `servicio-inventario` (stock), `servicio-cuentas` + `servicio-caja` (pago/cierre),
  RabbitMQ (broker), `servicio-notificaciones` (email async).
- **Librería de resiliencia:** `libs/resiliencia` (circuit breaker con `opossum`,
  idempotency interceptor, rabbitmq retry interceptor, outbox processor).
- **Métricas:** helpers `getOrCreateCounter/Histogram/Gauge` de `@org/observabilidad`.
- **Rama sugerida:** `feat/resiliencia-s26` desde `backup/main-2026-07-01`.
- **Convención de trabajo (sesiones previas):** 1 tarea = 1 commit temático, revisable
  commit-a-commit. `gh` no está instalado.
- **Preflight (no es parte del plan):** hay `libs/observabilidad/src/lib/tracing.ts`
  modificado sin commitear y `postman/` sin trackear → commitéalo o `git stash`
  antes de empezar para que el diff de cada fase quede limpio.

## Convenciones de naming (fuente de verdad = el código, verificado)

Existen **dos** convenciones y hay que respetarlas:

- **Métricas de negocio → español:** `pagos_registrados_total`, `pago_monto_soles`,
  `pedidos_creados_total`, `pedidos_rechazados_sin_stock_total`,
  `pagos_cierre_remoto_pendiente_total`.
- **Métricas de patrón/infra → inglés:** `circuit_breaker_state`,
  `broker_consumer_lag_seconds`, `dlq_messages_total`, `outbox_*`.
- Los nombres nuevos de patrón (`dependency_*`, `bulkhead_*`, `retry_attempts_total`)
  van en **inglés** por esa convención, NO por copiar el PDF.
- Los valores de label `dependency` son nombres reales de servicio:
  `inventario | mesas | cuentas`. Nunca `erp` / `payment`.

**Único PDF-ismo ya presente en el código:** el trío `erp_*` en el cliente de
inventario (lo corrige R-06). No hay otros: el estado de pago inseguro ya se llama
`PAGO_SIN_CIERRE_CONFIRMADO` (no `PAYMENT_UNKNOWN`).

## Decisiones cerradas (no re-preguntar)

- Alcance: **todos** los puntos, en 5 fases ordenadas por riesgo.
- Bulkhead: **outbound** (axios `maxSockets` + `p-limit` por dependencia).
- Backpressure a nivel broker: **solo `prefetchCount`** (sin `x-max-length`, para no
  redeclarar colas). Anotar como riesgo residual.
- Retry budget: **timeouts por operación + budget documentado**, con **1 retry solo en
  lecturas GET idempotentes** (sin deadline propagado).

---

## Fase 0 — Correcciones baratas (bajo riesgo)

### R-01 · Jitter en el retry del broker
- **Archivo:** `libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts` (~línea 72).
- **Cambio:** el delay es `initialDelay * 2**(retryCount-1)` (exponencial puro). Añadir
  jitter: `const base = initialDelay * 2**(retryCount-1); const delayMs = base + Math.floor(Math.random()*initialDelay);`
  Comentario: `// backoff exponencial + jitter (evita reintentos sincronizados entre réplicas)`.
- **Prueba:** ajustar/añadir aserción en el spec de que `delayMs ∈ [base, base+initialDelay)`.
- **Commit:** `fix(resiliencia): jitter en backoff del retry de consumidores RabbitMQ`

### R-02 · Eliminar `OrgResilienciaModule` muerto
- **Archivos:** borrar `libs/resiliencia/src/lib/resiliencia.module.ts`; quitar su
  `export *` de `libs/resiliencia/src/index.ts` (línea 1). Grep previo de
  `OrgResilienciaModule` en `apps/` para confirmar 0 imports (si aparece, quitarlo del
  `imports:` del módulo que lo use).
- **Prueba:** `nx run-many -t build` de los servicios que importan `@org/resiliencia`.
- **Commit:** `refactor(resiliencia): elimina OrgResilienciaModule sin uso`

### R-03 · Circuit breaker en la escritura de dinero (`cerrarCuenta`)
- **Archivo:** `apps/servicio-caja/src/app/cuentas-http.client.ts` (método `cerrarCuenta`, ~línea 40).
- **Cambio:** decorar con
  `@CircuitBreakerOptions({ timeout: 4000, errorThresholdPercentage: 50, resetTimeout: 30_000, errorFilter: e => Boolean(e?.response?.status && e.response.status < 500) })`
  (mismo patrón que `fetchCuenta`; timeout "pago" 2–4 s). Confirmar que el catch de la
  degradación honesta en `apps/servicio-caja/src/app/app.service.ts` (~línea 418) también
  captura `EOPENBREAKER` (hoy captura cualquier error → ya lo cubre).
- **Prueba:** spec nuevo: el breaker de `cerrarCuenta` abre tras N fallos y el pago sigue
  registrándose como `PAGO_SIN_CIERRE_CONFIRMADO`.
- **Commit:** `feat(caja): circuit breaker en cierre remoto de cuenta (ruta de dinero)`

### R-04 · Gauge `circuit_breaker_state` dirigido por eventos del breaker
- **Archivos:** `libs/resiliencia/src/lib/circuit-breaker.decorator.ts` (handlers de eventos,
  ~línea 31); limpieza en `apps/servicio-pedidos/src/app/inventario-http.client.ts`
  (líneas 78, 81).
- **Cambio:** en el decorador crear `getOrCreateGauge('circuit_breaker_state','...',['breaker'])`
  y en los handlers: `open→set 1`, `halfOpen→set 0.5`, `close→set 0`, label
  `breaker=breakerName`. Eliminar los `circuitBreakerGauge.set(1/0)` manuales del cliente
  inventario (son un proxy incorrecto y no reflejan HALF_OPEN).
- **Prueba:** spec del decorador: emular evento `open` → gauge = 1.
- **Commit:** `feat(resiliencia): estado de circuito como gauge dirigido por eventos (incl. HALF_OPEN)`

**Aceptación Fase 0:** build verde de todos los servicios; `circuit_breaker_state` visible
para los 4 breakers.

---

## Fase 1 — Observabilidad (señales mínimas)

### R-05 · Histograma de latencia de dependencia (habilita p95/p99)
- **Archivo:** `libs/resiliencia/src/lib/circuit-breaker.decorator.ts` (punto único: envuelve
  TODAS las llamadas con breaker, ~línea 23).
- **Cambio:** `getOrCreateHistogram('dependency_request_duration_seconds','Latencia de llamadas a dependencias con breaker',[0.05,0.1,0.3,0.5,1,2,3,5,10],['breaker'])`;
  medir alrededor de `breaker.fire(...)` (start + observe en `finally`). Da p95/p99 por
  dependencia para inventario, mesas, cuentas y cierre desde un solo sitio.
- **Prueba:** spec del decorador: tras `fire`, el histograma tiene ≥1 observación con el
  label correcto.
- **Commit:** `feat(resiliencia): histograma dependency_request_duration_seconds (p95/p99 por dependencia)`
- **Riesgo residual a documentar (R-17):** `opossum` NO abre por percentil de latencia (el
  PDF pide "abrir si p95>3 s"). Con esto queda *medido y alertable* vía Prometheus, que es la
  vía realista sin cambiar de librería.

### R-06 · Renombrar el ERP-ismo → `dependency_timeout_total`
- **Archivos:** `apps/servicio-pedidos/src/app/inventario-http.client.ts` (líneas 33-34, 84, 89);
  ramas de timeout de `apps/servicio-pedidos/src/app/mesas-http.client.ts` (~línea 68) y
  `apps/servicio-caja/src/app/cuentas-http.client.ts`.
- **Cambio:**
  - métrica `erp_timeout_rate_total` → `dependency_timeout_total` con label `['dependency']`,
    `.inc({ dependency })` en las ramas `ECONNABORTED/ETIMEDOUT` de los **tres** clientes
    (`dependency = inventario | mesas | cuentas`).
  - variable `erpTimeoutCounter` → `timeoutCounter`.
  - `errorCode: 'ERP_TIMEOUT'` → `'DEPENDENCY_TIMEOUT'`.
  - `resultingState: 'STOCK_VALIDATION_PENDING'` **se queda** (dominio).
  - Sin alias de compatibilidad (los dashboards son S27, aún no existen).
- **Prueba:** spec por cliente: timeout simulado incrementa el contador con su label.
- **Commit:** `refactor(resiliencia): renombra métrica ERP-ismo a dependency_timeout_total en los tres clientes`

### R-07 · `retry_attempts_total`
- **Archivo:** `libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts` (~línea 59) y, más tarde,
  el helper de R-14.
- **Cambio:** `getOrCreateCounter('retry_attempts_total','Reintentos ejecutados',['surface'])`,
  `.inc({ surface: 'broker' })` en cada reintento del interceptor. El de HTTP se conecta en
  R-16 con `surface:'http'`.
- **Prueba:** spec: 2 fallos → 2 incrementos.
- **Commit:** `feat(resiliencia): retry_attempts_total para detectar amplificación`

### R-08 · Tasa de éxito de pedido/pago (SIN métrica nueva de "checkout")
- **Contexto:** los contadores de negocio ya existen; NO se crea `checkout_total`.
  - **Pago:** la tasa de éxito se **deriva** de `pagos_registrados_total` (éxito) y
    `pagos_cierre_remoto_pendiente_total` (fallo parcial). Solo se documenta el PromQL (R-17).
  - **Pedido:** el único hueco es el pedido rechazado por **dependencia caída** (503/breaker),
    que hoy no cuenta nadie (`pedidos_rechazados_sin_stock_total` solo cubre stock).
- **Archivo:** `apps/servicio-pedidos/src/app/app.service.ts` (catch de la llamada a
  `inventarioHttp.obtenerProductosLote`, ~línea 110).
- **Cambio:** añadir contador en convención española, hermano del existente:
  `pedidos_rechazados_dependencia_total` (sin label o con `['dependency']`), incrementado
  cuando la creación de pedido falla por dependencia no disponible.
  - Tasa de éxito = `pedidos_creados_total / (creados + rechazados_sin_stock + rechazados_dependencia)`.
- **Prueba:** spec: pedido rechazado por 503 de inventario incrementa el contador.
- **Commit:** `feat(pedidos): pedidos_rechazados_dependencia_total para tasa de éxito`

**Aceptación Fase 1:** existen p95/p99 (R-05), timeout rate ×3 (R-06), circuit state por
eventos (R-04), retry count (R-07), tasa de éxito de pedido (R-08); broker lag y DLQ ya
existían. *pool saturation / rejected* llegan en Fase 3.

---

## Fase 2 — Backpressure (`prefetchCount`)

### R-09 · Cap de concurrencia por consumidor
- **Archivo:** `libs/observabilidad/src/bootstrap.ts` (~línea 81, punto único de
  `app.connectMicroservice`).
- **Cambio:** añadir `prefetchCount: Number(process.env.RMQ_PREFETCH ?? 20)` a `options`
  (`noAck: false` ya está). Sin tocar la declaración de colas → cero riesgo de redeclare.
  Documentar `RMQ_PREFETCH` en `.env.example`.
- **Prueba:** el e2e de DLQ (`apps/servicio-pedidos-e2e/src/servicio-pedidos/dlq.spec.ts`)
  sigue verde.
- **Commit:** `feat(resiliencia): prefetchCount configurable en consumidores RabbitMQ (backpressure)`
- **Riesgo residual (R-17):** `x-max-length`/`x-overflow` en colas queda fuera por decisión
  (evita recrear colas).

---

## Fase 3 — Bulkhead outbound (aislar recursos por dependencia)

### R-10 · Dependencia `p-limit`
- **Archivo:** `package.json`.
- **Cambio:** `pnpm add p-limit@3` (**v3 = CommonJS**; v4+ es ESM-only y rompe la interop con
  el build CJS de Nest). `// ponytail: p-limit@3 por CJS; alternativa sin dep = semáforo de ~20 líneas`.
- **Commit:** `chore(deps): p-limit@3 para bulkhead outbound`

### R-11 · Limitador + agente axios por dependencia
- **Archivo nuevo:** `libs/resiliencia/src/lib/bulkhead.ts` (+ export en `index.ts`).
- **Cambio:** helper `createBulkhead(name, { maxConcurrent, maxQueue })` que envuelve
  `p-limit(maxConcurrent)`, cuenta pendientes y **rechaza con `ServiceUnavailableException`
  (503) cuando la cola supera `maxQueue`** (shed load). Exponer un `http.Agent`/`https.Agent`
  con `maxSockets = maxConcurrent` para axios. Métricas de patrón (inglés):
  `bulkhead_in_flight{dependency}` (gauge) y `bulkhead_rejected_total{dependency}` (counter).
- **Prueba (obligatoria — lógica no trivial):** `bulkhead.spec.ts` — con
  `maxConcurrent:1, maxQueue:1`, la 3.ª llamada concurrente se rechaza (503) y
  `rejected==1`; las 2 primeras resuelven en orden.
- **Commit:** `feat(resiliencia): bulkhead outbound (p-limit + maxSockets + shed load)`

### R-12 · Aplicar bulkhead por pool a cada cliente
- **Archivos:** `apps/servicio-pedidos/src/app/inventario-http.client.ts`,
  `apps/servicio-pedidos/src/app/mesas-http.client.ts`,
  `apps/servicio-caja/src/app/cuentas-http.client.ts`.
- **Cambio:** cada cliente crea su bulkhead con `dependency = inventario | mesas | cuentas`
  (envs `INVENTARIO_POOL_MAX`, `MESAS_POOL_MAX`, `CUENTAS_POOL_MAX`), pasa el `httpAgent` a
  axios y envuelve la llamada en `bulkhead.run(() => fetch...)`. Orden: **bulkhead por fuera
  del breaker** (aísla el recurso antes de fallar rápido).
- **Prueba:** spec: saturar el pool de `inventario` no consume el de `cuentas` (pools
  independientes, gauges distintos).
- **Commit:** `feat(resiliencia): pools aislados por dependencia (inventario/cuentas/mesas)`

### R-13 · Señales de pool
- Ya emitidas en R-11 (`bulkhead_in_flight` = pool saturation; `bulkhead_rejected_total` =
  rejected requests). **Sin tarea aparte**; solo verificar que aparecen en `/metrics`.

**Aceptación Fase 3:** un cliente saturado no agota los sockets/concurrencia de otro;
`bulkhead_in_flight` y `bulkhead_rejected_total` visibles → señales del audit completas.

---

## Fase 4 — Retry budget + timeouts por operación

### R-14 · Helper `retryAsync` con backoff + jitter
- **Archivo nuevo:** `libs/resiliencia/src/lib/retry.ts` (+ export).
- **Cambio:** `retryAsync(fn, { retries=1, baseMs=250, isRetryable })` — exponencial + jitter
  (mismo patrón que `apps/pwa-cliente/src/api/client.ts` ~línea 148), `isRetryable` por
  defecto solo red/5xx (nunca 4xx). Incrementa `retry_attempts_total{surface:'http'}` (R-07).
- **Prueba (obligatoria):** `retry.spec.ts` — 5xx reintenta y luego resuelve; 4xx no
  reintenta; se respeta `retries` máximo.
- **Commit:** `feat(resiliencia): helper retryAsync (backoff+jitter, clasificación de error)`

### R-15 · Timeouts diferenciados por operación
- **Archivos:** los 3 clientes HTTP.
- **Cambio:** sustituir el plano `HTTP_TIMEOUT_MS = 5000` por constantes por criticidad
  (lectura 1–2 s, pago 2–4 s): lecturas (`obtenerMesa`, `productos/lote`, `fetchCuenta`) →
  **2000 ms**; `cerrarCuenta` (dinero) → **4000 ms**. Alinear el `timeout` del breaker con
  cada uno (breaker ≥ transporte). Valores por env con default.
- **Prueba:** specs existentes de los clientes siguen verdes con los nuevos timeouts.
- **Commit:** `feat(resiliencia): timeouts por operación según criticidad (lectura vs dinero)`

### R-16 · 1 retry en lecturas GET idempotentes
- **Archivos:** `apps/servicio-pedidos/src/app/mesas-http.client.ts` (`GET /mesa`, ~línea 42),
  `apps/servicio-caja/src/app/cuentas-http.client.ts` (`GET /cuenta`, ~línea 32).
- **Cambio:** envolver la llamada axios en `retryAsync(fn,{retries:1,baseMs:250})`. **No**
  aplicar a `productos/lote` (POST) ni a escrituras (`cerrarCuenta`). Orden: retry **dentro**
  del breaker (el breaker cuenta el resultado final, no cada intento).
- **Prueba:** spec: un 503 transitorio en `GET /mesa` se recupera en el 2.º intento; un 404
  no reintenta.
- **Commit:** `feat(resiliencia): 1 retry en lecturas GET idempotentes (mesas, cuentas)`

### R-17 · Documento de política de resiliencia
- **Archivo nuevo:** `docs/resiliencia-politica.md`.
- **Contenido:**
  - Tabla **dependencia → failure mode → impacto → mecanismo → trade-off** (inventario,
    cuentas/caja, broker, notificaciones, cache).
  - **Retry budget por flujo** (`crear pedido`, `registrar pago + cerrar cuenta`) desglosado
    por operación con los timeouts de R-15, verificando que reintentos + timeouts caben en el
    total.
  - **Umbrales de breaker** por dependencia y **riesgos residuales aceptados**: sin apertura
    por p95 en opossum (R-05), sin `x-max-length` en colas (R-09), bulkhead/rate-limit
    **por instancia** (no global, no hay Redis), retry HTTP solo en GET.
  - Mapa **señal → umbral → acción operativa** para las métricas, incluido el PromQL de tasa
    de éxito de pago derivada (R-08).
- **Commit:** `docs(resiliencia): ficha de política, retry budget y riesgos residuales`

**Aceptación Fase 4:** timeouts justificados por operación; lecturas idempotentes con 1
retry acotado; presupuesto documentado y defendible.

---

## Trazabilidad (gap del audit → tarea)

| Gap | Tareas |
|---|---|
| Timeouts sin presupuesto | R-15, R-17 |
| Jitter broker / retry HTTP / budget | R-01, R-14, R-16, R-17 |
| Breaker en dinero / estado / p95 | R-03, R-04, R-05 (+doc R-17) |
| Bulkhead | R-10, R-11, R-12 |
| Backpressure | R-09 (+ shed load en R-11) |
| Señales (p95/p99, timeout, circuit, retry, pool, rejected, éxito) | R-05, R-06, R-04, R-07, R-11, R-08 |
| Módulo muerto | R-02 |

**17 tareas / 5 fases / 1 dep nueva (`p-limit@3`).** Cada fase deja el build verde y es
mergeable por sí sola.

## Verificación por fase

- Fase 0-1: `nx run-many -t test` de `resiliencia`, `servicio-pedidos`, `servicio-caja`.
- Fase 2: e2e de DLQ verde.
- Fase 3: `bulkhead.spec.ts` verde + revisar `/metrics`.
- Fase 4: `retry.spec.ts` verde + specs de clientes verdes.

## Anexo S27 — Hallazgos H-1..H-7 de la auditoría e2e (resueltos)

Auditoría del backend + causa raíz de la demo fallida (`docker stop` de cuentas
en pleno cobro). Resueltos en la rama `feat/resiliencia-e2e-s27`
([plan atómico](../../plan-resiliencia-e2e-claude-code.md)):

| Hallazgo | Resuelto en | Commit |
|---|---|---|
| **H-1** Claims de idempotencia huérfanos sin TTL (409 hasta 7 días) | TTL de 60s + re-reclamo (`libs/resiliencia/src/lib/idempotency.interceptor.ts`) | `263d273` |
| **H-2** `PAGO_SIN_CIERRE_CONFIRMADO` sin reconciliación automática | Cron cada 5 min (`apps/servicio-caja/src/app/cierre-reconciliacion.service.ts`) | `9306f33` |
| **H-3** Códigos transitorios de red reportados como 500 | ECONNRESET/EPIPE/EAI_AGAIN/EHOSTUNREACH → 503 en los 3 clientes HTTP | `35799a4` |
| **H-4** El outbox quema `attempts` con el broker caído | `isConnected()` + pausa del tick (`outbox.processor.ts`, `rabbitmq-publisher.service.ts`) | `f94f36f` |
| **H-5** Mensajes envenenados queman 3 reintentos antes de la DLQ | Error permanente (4xx/parseo) → DLQ al primer intento (`rabbitmq-retry.interceptor.ts`) | `638e93a` |
| **H-6** Latencia del flujo completo medía solo el último paso | Medición extremo a extremo (`stress-tests/run-all-stress-tests.js`) | `486ecf8` |
| **H-7** `auto-skip-tests.js` enmascaraba fallos | Herramienta eliminada | `e973974` |

Adicionalmente (PWA/gateway, misma rama): timeout de 8s con AbortSignal
(`fix(pwa)`), mapeo 502/503/504 a mensaje humano, auto-recuperación de queries,
timeouts por servicio en Kong (T-07) y `errorCode`/log operable en el
GlobalExceptionFilter (T-14). Evidencia de runtime: scripts de caos
`run-chaos-mid-flow.js` (+`--kill`) y `run-poison-message.js`.
