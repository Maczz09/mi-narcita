---
tipo: runbook
servicio: servicio-pedidos
owner: ventas-team
revisado: 2026-07-07
---

# Runbook: servicio-pedidos

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-pedidos/ficha.yaml).

## Incidente cubierto

Circuit breaker abierto hacia inventario o mesas: los pedidos se rechazan o se crean sin validación de stock/mesa. Bloquea la toma de pedidos en el salón.

## Detección

- Alerta `ERPCircuitBreakerOpen` (`circuit_breaker_state{dependency="inventario"} == 1` por más de 2 min).
- Alerta `ErpTimeoutRateHigh` (más de 5 timeouts al ERP/inventario en 5 min).
- Alerta `ERP_P95_LatencyHigh` (latencia p95 de inventario > 5 s) como precursor.

## Primeras revisiones

- Health del servicio: `curl http://localhost:3004/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `pedidos_queue` y `dlq.pedidos_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Health de servicio-inventario y servicio-mesas (las dependencias HTTP).
- Logs del breaker (opossum) en pedidos: causa de apertura (timeout vs error).
- Proyecciones locales `ProductoLocal`/`MesaLocal`: si están frescas, la lectura sigue sirviendo.

## Acción

- La degradación es controlada por diseño: el breaker pasa a half-open solo. NO reiniciar pedidos como primer paso.
- Resolver la causa en la dependencia (ver runbook de [inventario](servicio-inventario.md) / [mesas](servicio-mesas.md)).
- Si el breaker no cierra tras recuperarse la dependencia, reiniciar el servicio pedidos.

## Escalamiento

1. Guardia ventas-team (responsable operativo).
2. `tech-lead-ventas` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `finanzas-restobar` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

Salón/soporte (impacto en toma de pedidos), owner de la dependencia causante y canal #incidentes.
