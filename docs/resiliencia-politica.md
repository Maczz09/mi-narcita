# Política de resiliencia (S26)

Ficha operativa de los mecanismos de resiliencia de **nachopps** (timeouts,
retries, circuit breaker, bulkhead, backpressure, degradación y señales). El
código es la fuente de verdad; este documento explica el *porqué*, el
presupuesto de reintentos y los riesgos residuales aceptados.

Referencias de implementación: `libs/resiliencia` (breaker, bulkhead, retry,
retry de broker), `libs/observabilidad` (métricas, prefetch) y los tres clientes
HTTP (`servicio-pedidos`→inventario/mesas, `servicio-caja`→cuentas).

---

## 1. Dependencia → failure mode → impacto → mecanismo → trade-off

| Dependencia | Failure mode | Impacto | Mecanismo | Trade-off aceptado |
|---|---|---|---|---|
| **inventario** (pedidos→inventario) | lenta / caída / 5xx | no se puede validar stock al crear pedido | breaker (`fetchProductosLote`), timeout 2 s, bulkhead `inventario`, contador `pedidos_rechazados_dependencia_total` | lote es POST → **sin retry** (no idempotente sin key); el pedido se rechaza con 503 en vez de encolar |
| **mesas** (pedidos→mesas) | lenta / caída / 5xx | no se puede resolver la mesa del pedido | breaker (`fetchMesaRemota`), timeout 2 s, **1 retry** (GET idempotente), bulkhead `mesas` | 404 no se reintenta ni abre circuito (es dato, no fallo) |
| **cuentas** (caja→cuentas), lectura | lenta / caída / 5xx | no se puede leer la cuenta a cobrar | breaker (`fetchCuentaConBreaker`), timeout 2 s, **1 retry** (GET), bulkhead `cuentas` | igual que mesas |
| **cuentas**, cierre (ruta de dinero) | lenta / caída / 5xx | el pago se registra pero la cuenta no cierra | breaker (`cerrarCuentaConBreaker`), timeout **4 s**, **sin retry** | se degrada honestamente a `PAGO_SIN_CIERRE_CONFIRMADO`; el dinero nunca se pierde ni se cobra dos veces |
| **RabbitMQ** (broker) | mensaje que falla en el consumidor | evento no procesado | retry con backoff exponencial **+ jitter** (3 intentos), luego DLQ; `prefetchCount` para backpressure | sin `x-max-length` en colas (ver §4) |
| **notificaciones** (email async) | caída del servicio de email | email no enviado | desacoplado por broker + outbox; reintentos del consumidor | email es best-effort; no bloquea el flujo de negocio |
| **cache / proyección local** | proyección desactualizada | datos ligeramente stale | cold-start desde la dependencia (upsert) + eventos de dominio | se acepta staleness acotado a cambio de disponibilidad |

---

## 2. Presupuesto de reintentos por flujo

Los timeouts son **por operación** (R-15): lecturas 2 s, dinero (cierre) 4 s. El
timeout del breaker se fija en *transporte + 500 ms* para que el timeout de axios
se dispare (y se cuente en `dependency_timeout_total`) **antes** que el del
breaker. Sólo las **lecturas GET idempotentes** llevan 1 retry (R-16); backoff
`250·2^(n-1) + jitter[0,250)` ms.

### Flujo A — crear pedido

| Paso | Operación | Timeout | Retry | Peor caso |
|---|---|---|---|---|
| 1 | `GET /mesa` (mesas) | 2 s | 1 | 2 s + ~0,25 s + 2 s = **4,25 s** |
| 2 | `POST /productos/lote` (inventario) | 2 s | 0 | **2 s** |
| 3 | persistir pedido (local + outbox) | — | — | ~local |

**Techo del flujo A ≈ 6,25 s** de espera en dependencias antes de fallar. Cada
paso falla rápido con 503 si su breaker está abierto o su bulkhead saturado.

### Flujo B — registrar pago + cerrar cuenta

| Paso | Operación | Timeout | Retry | Peor caso |
|---|---|---|---|---|
| 1 | `GET /cuenta` (cuentas) | 2 s | 1 | 2 s + ~0,25 s + 2 s = **4,25 s** |
| 2 | registrar transacción (tx local + outbox) | — | — | ~local |
| 3 | `POST /cerrar` (cuentas, dinero) | 4 s | 0 | **4 s** |

**Techo del flujo B ≈ 8,25 s.** El paso 3 **nunca** se reintenta: si falla, el
pago ya está registrado y se marca `PAGO_SIN_CIERRE_CONFIRMADO` (el cierre se
reconcilia después). Así reintentos + timeouts **caben** dentro de un límite
acotado y predecible por flujo, sin deadline propagado (decisión cerrada del plan).

---

## 3. Umbrales de circuit breaker por dependencia

Todos con `errorThresholdPercentage: 50`, `resetTimeout: 30 s`, volumen mínimo de
opossum. Los **4xx no abren** el circuito (`errorFilter`).

| Breaker | timeout | Notas |
|---|---|---|
| `InventarioHttpClient.fetchProductosLote` | 2,5 s | lectura de stock |
| `MesasHttpClient.fetchMesaRemota` | 2,5 s | lectura de mesa |
| `CuentasHttpClient.fetchCuentaConBreaker` | 2,5 s | lectura de cuenta |
| `CuentasHttpClient.cerrarCuentaConBreaker` | 4,5 s | ruta de dinero |

Estado observable en `circuit_breaker_state{breaker}` (0=CLOSED, 0.5=HALF_OPEN,
1=OPEN), dirigido por los eventos del breaker (R-04).

---

## 4. Riesgos residuales aceptados

1. **Sin apertura por p95 de latencia** (R-05): opossum no abre por percentil.
   Mitigación: `dependency_request_duration_seconds` da p95/p99 por dependencia,
   *medido y alertable* en Prometheus (vía realista sin cambiar de librería).
2. **Sin `x-max-length`/`x-overflow` en colas** (R-09): evita redeclarar colas.
   El backpressure se limita a `prefetchCount` (cap de mensajes en vuelo por
   consumidor). Una cola puede crecer sin cota dura.
3. **Bulkhead y rate-limit por instancia, no global**: no hay Redis; cada réplica
   tiene su propio pool. Bajo N réplicas la concurrencia total a una dependencia
   es N × pool.
4. **Retry HTTP sólo en GET**: escrituras (`productos/lote`, `cerrar`) no se
   reintentan automáticamente para no duplicar efectos sin idempotencia.

---

## 5. Señal → umbral → acción operativa

| Señal (métrica) | Umbral sugerido | Acción |
|---|---|---|
| `circuit_breaker_state{breaker} == 1` | cualquiera sostenido | dependencia caída: revisar el servicio destino |
| `dependency_request_duration_seconds` p95 | > 3 s | dependencia lenta: investigar latencia / capacidad |
| `rate(dependency_timeout_total[5m])` | > 0 sostenido | timeouts a dependencia: red o servicio saturado |
| `rate(retry_attempts_total[5m])` | pico anómalo | amplificación de reintentos: posible tormenta |
| `bulkhead_in_flight{dependency}` | == pool máx sostenido | pool saturado: subir `*_POOL_MAX` o escalar destino |
| `rate(bulkhead_rejected_total[5m])` | > 0 | shed load activo: la dependencia no da abasto |
| `broker_consumer_lag_seconds` | alto/creciente | consumidores atrasados: escalar o subir `RMQ_PREFETCH` |
| `increase(dlq_messages_total[1h])` | > 0 | mensajes muertos: inspeccionar DLQ y causa raíz |

### PromQL de tasas de éxito (derivadas, sin métrica nueva)

**Pago** (éxito = registrado; fallo parcial = cierre pendiente) — R-08:

```promql
sum(rate(pagos_registrados_total[5m]))
/
(sum(rate(pagos_registrados_total[5m])) + sum(rate(pagos_cierre_remoto_pendiente_total[5m])))
```

**Pedido** (éxito = creado; fallos = sin stock + dependencia caída) — R-08:

```promql
sum(rate(pedidos_creados_total[5m]))
/
(
  sum(rate(pedidos_creados_total[5m]))
  + sum(rate(pedidos_rechazados_sin_stock_total[5m]))
  + sum(rate(pedidos_rechazados_dependencia_total[5m]))
)
```

---

## 6. Variables de entorno

| Variable | Default | Efecto |
|---|---|---|
| `RMQ_PREFETCH` | 20 | mensajes sin-ack en vuelo por consumidor (backpressure) |
| `INVENTARIO_POOL_MAX` / `MESAS_POOL_MAX` / `CUENTAS_POOL_MAX` | 10 | concurrencia + cola del bulkhead por dependencia |
| `INVENTARIO_TIMEOUT_MS` / `MESAS_TIMEOUT_MS` / `CUENTAS_TIMEOUT_MS` | 2000 | timeout de lectura (breaker = +500 ms) |
| `CUENTAS_CIERRE_TIMEOUT_MS` | 4000 | timeout de cierre / dinero (breaker = +500 ms) |
