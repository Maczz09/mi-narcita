# Ficha de Observabilidad Operativa: Flujo de Checkout

## 1. Preguntas Operativas
| Pregunta | Señal | Responsable |
| :--- | :--- | :--- |
| ¿El ERP/Inventario está degradado? | `erp_p95_latency`, `erp_timeout_rate` | Operaciones |
| ¿El circuit breaker se activó? | `payment_circuit_breaker_state` | Operaciones / Plataforma |
| ¿Hay pedidos inciertos financieramente? | `payment_unknown_count` | Negocio / Soporte |
| ¿Qué clientes fueron afectados? | `correlationId` / `orderId` | Soporte |
| ¿El broker está retrasado? | `broker_lag_seconds` | Operaciones |
| ¿El outbox acumula eventos sin publicar?| `outbox_pending_events` | Operaciones |
| ¿Hay duplicados o reintentos altos? | `duplicate_event_count`, `retry_attempts` | Desarrollo |
| ¿Caché genera conflictos de stock? | `cache_stale_stock_conflicts` | Desarrollo |

## 2. Logs Estructurados
Se configuraron los servicios para emitir logs en JSON con contexto. Ejemplo de Timeout:
```json
{
  "timestamp": "2026-06-26T18:44:02Z",
  "level": "WARN",
  "service": "servicio-pedidos",
  "operation": "fetchProductosLote",
  "correlationId": "trace-12345",
  "orderId": "ped_981",
  "dependency": "inventario",
  "durationMs": 5000,
  "errorCode": "ERP_TIMEOUT",
  "resultingState": "STOCK_VALIDATION_PENDING",
  "message": "Stock validation timed out; order moved to pending validation"
}
```

## 3. Métricas
| Métrica | Tipo | Dimensiones | Uso |
| :--- | :--- | :--- | :--- |
| `erp_latency_p95` | Histograma | service, route | Degradación de latencia |
| `erp_timeout_rate` | Ratio/Counter | service | Alerta de indisponibilidad |
| `circuit_breaker_state` | Gauge | service, dependency | Visibilidad del estado de resiliencia |
| `checkout_success_rate` | Ratio | client | Impacto a usuario |
| `stock_validation_pending_count` | Gauge | status | Impacto operativo |
| `outbox_pending_events` | Gauge | topic | Alerta de publicación atrasada |
| `broker_lag_seconds` | Gauge | queue | Atraso del consumidor |
| `dlq_messages` | Gauge | queue | Fallos no recuperados (poison pills) |
| `notification_failure_rate` | Ratio | type | Impacto de comunicación |
| `cache_hit_ratio` | Ratio | cache_name | Rendimiento de caché |
| `cache_stale_stock_conflicts` | Counter | product_id | Falsos positivos de stock |
| `orders_requires_manual_review` | Gauge | reason | Carga de soporte |

## 4. Trazas
| Traza requerida | Spans | CorrelationID | Estado |
| :--- | :--- | :--- | :--- |
| Checkout con validación de stock y pago | API -> DB -> Payment -> Inventario -> Outbox -> Broker | `trace_id` inyectado nativamente por OpenTelemetry | Trazabilidad end-to-end de fallos |

## 5. Alertas Accionables
| Alerta | Umbral | Impacto | Acción (Runbook) |
| :--- | :--- | :--- | :--- |
| **ERP p95 alto** | > 5s por 5 min | Lentitud en checkout | Revisar dependencias del inventario |
| **Payment Timeout Rate**| > 5% por 5 min | Pagos inciertos aumentan | Revisar pasarela de pagos |
| **Circuit Breaker OPEN**| > 2 min en OPEN | Degradación controlada | Escalar si no hay recovery automático |
| **Broker Lag Alto** | > 5 min | Consumidores atrasados | Escalar pods consumidores / revisar cuellos de botella |
| **Outbox Pending Alto** | > 1000 eventos | Eventos atascados en DB | Reiniciar Outbox Publisher / Revisar Broker |
| **DLQ Creciendo** | > 10/min | Fallos persistentes | Revisar schema de eventos / Reencolar mensajes fallidos |

## 6. Dashboard
- **Checkout:** Success rate, p95 latencia, errores por minuto.
- **Payments:** Timeout rate, count de `PAYMENT_UNKNOWN`.
- **Orders:** Pedidos pendientes de validación, órdenes cobradas vs canceladas.
- **Resilience:** Estados de Circuit Breakers, Retry counts.
- **Events:** Outbox pending, Broker lag, DLQ sizes.
- **Business:** Ordenes confirmadas por minuto, usuarios afectados.

## 7. Diagnóstico y 8. Decisión Técnica
* **Síntoma:** Alerta de "Checkout p95 alto".
* **Diagnóstico Guiado:** 
  1. ¿Error rate alto en Checkout? Sí.
  2. ¿Timeout de ERP (Inventario) domina? Sí.
  3. Revisar Circuit Breaker: ¿Está en OPEN?
* **Decisión (Ejemplo ERP Caído):** Si Circuit Breaker abrió por fallos del ERP y Outbox se acumula, no podemos confirmar la orden. El sistema se protege devolviendo *Stock Validation Pending* y Soporte interviene buscando por `orderId` usando el CorrelationID extraído del log.
