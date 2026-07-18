---
tipo: matriz-resiliencia
fuente: [libs/resiliencia, docs/resiliencia-politica.md, stress-tests/]
revisado: 2026-07-14
sesion: S33 (Despliegue y operación · pág. 17)
---

# Matriz de resiliencia — NachoPps

Mapea los escenarios de falla que la sesión 33 exige probar **en vivo** contra
el mecanismo que los cubre en código y el **script ejecutable** que los
demuestra. La política profunda (presupuestos de reintento, umbrales de breaker,
señal→acción) vive en [resiliencia-politica.md](resiliencia-politica.md); esta
tabla es la vista corta pedida por el material S33.

## 1. Escenarios de falla obligatorios (pág. 17 / 27)

| Falla | Cómo probar | Evidencia esperada | Mecanismo (código) | Prueba ejecutable |
|-------|-------------|--------------------|--------------------|-------------------|
| **Dependencia caída** | apagar contenedor de BD o de un servicio | error controlado / estado pendiente; eventos no se pierden (quedan en outbox) | `pg` con `connectionTimeoutMillis` (`libs/shared-prisma/src/lib/base-prisma.service.ts`); breaker abre y devuelve 503 | `stress-tests/run-chaos-db-down.js`, `run-chaos-double-service-down.js` |
| **Timeout** | simular demora en la dependencia | timeout visible y contado | timeout por operación 2–4 s + `dependency_timeout_total` (`libs/resiliencia/src/lib/circuit-breaker.decorator.ts`) | `run-chaos-double-service-down.js` |
| **503 temporal** | mock del proveedor devuelve 5xx | retry con límite, luego DLQ | retry backoff exponencial+jitter (3 intentos) → DLQ (`libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts`) | `run-stock-idempotency-dlq.js` |
| **Webhook / evento duplicado** | reenviar el mismo `eventId` | no duplica la acción | claim atómico de `idempotencyKey` por `pedido.id` antes de procesar; `injectEventId` en outbox (`libs/resiliencia/src/lib/outbox.processor.ts:158`) | `run-stock-idempotency-dlq.js` |
| **Pago rechazado / sin stock** | forzar rechazo del descuento | compensación de saga | `stock.insuficiente` → `PedidoEstado.RechazadoSinStock` (`libs/contracts/src/domains/pedidos.ts:24`); consumido en `apps/servicio-pedidos/src/app/events.controller.ts:33` | `run-stock-idempotency-dlq.js` |
| **429 rate limit** | superar el límite de Kong | degradación controlada (429, no caída) | plugin `rate-limiting` de Kong (`infra/kong/kong.yml.template`) | `run-security-limits.js` |
| **Cierre remoto no confirmado** | cuentas lenta/caída al cerrar | dinero nunca se pierde ni se cobra dos veces | degradación honesta a `PAGO_SIN_CIERRE_CONFIRMADO` + `pagos_cierre_remoto_pendiente_total` (`apps/servicio-caja/src/app/app.service.ts`) | `run-chaos-double-service-down.js` |

## 2. Dependencia → mecanismo → trade-off (resumen)

Extracto de [resiliencia-politica.md §1](resiliencia-politica.md); ver ahí la tabla completa.

| Dependencia | Failure mode | Mecanismo | Trade-off |
|-------------|--------------|-----------|-----------|
| inventario (pedidos→inventario) | lenta/caída/5xx | breaker + timeout 2 s + bulkhead | POST no idempotente → sin retry, se rechaza con 503 |
| mesas (pedidos→mesas) | lenta/caída/5xx | breaker + timeout 2 s + **1 retry** (GET) | 404 no reintenta ni abre circuito |
| cuentas, cierre (dinero) | lenta/caída/5xx | breaker + timeout **4 s** + sin retry | degrada a `PAGO_SIN_CIERRE_CONFIRMADO` |
| RabbitMQ (broker) | mensaje falla en consumidor | retry backoff+jitter → DLQ + prefetch | sin `x-max-length` en colas (riesgo residual aceptado) |

## 3. Señales operativas

| Señal (métrica) | Umbral | Acción |
|-----------------|--------|--------|
| `circuit_breaker_state{breaker} == 1` | sostenido | dependencia caída: revisar servicio destino |
| `rate(dependency_timeout_total[5m])` | > 0 sostenido | red o servicio saturado |
| `rate(retry_attempts_total[5m])` | pico anómalo | posible tormenta de reintentos |
| `dlq_messages_total` | creciente | mensajes envenenados: inspeccionar DLQ / parking |

> El estado de las dependencias síncronas también se ve en vivo en
> `GET /api/health/dependencies` de cada servicio (lee `circuit_breaker_state`).

Modo de fallo del gateway "reinicié el servicio y Kong sigue diciendo `name
resolution failed`": ver el runbook
[caché DNS de Kong tras reinicio de upstream](operacion/runbooks/kong-dns-upstream.md).

Ver también: [runbooks](operacion/runbooks/) · [invariantes de resiliencia](invariantes/).
