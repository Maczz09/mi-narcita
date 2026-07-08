---
tipo: runbook
servicio: servicio-cuentas
owner: ventas-team
revisado: 2026-07-07
---

# Runbook: servicio-cuentas

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-cuentas/ficha.yaml).

## Incidente cubierto

Cuenta que no se cierra tras un pago (evento `pago.registrado` no consumido) o cuenta que no refleja pedidos (`pedido.creado`/`pedido.actualizado` perdidos): el total cobrado no coincide con lo consumido.

## Detección

- Alerta `DLQGrowingFast` con mensajes en `dlq.cuentas_queue`.
- Alerta `BrokerConsumerLagHigh` (p95 publicación→consumo > 5 min).
- Alerta `PagoCierrePendienteHigh` disparada desde caja (el par de este incidente).

## Primeras revisiones

- Health del servicio: `curl http://localhost:3005/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `cuentas_queue` y `dlq.cuentas_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Handler `handlePagoRegistrado` en logs: errores y reintentos del interceptor.
- Outbox de caja y de pedidos: si el evento ni siquiera se publicó, el problema es del productor.

## Acción

- Reinyectar mensajes desde `dlq.cuentas_queue` según el [flujo DLQ/reinyección/parking](../../flujos/fallo-consumidor-dlq-reinyeccion-parking.md); la idempotencia absorbe duplicados.
- Si la proyección quedó inconsistente: `npm run backfill:cuentas-abiertas` ([procedimiento](../backfill-cuentas-abiertas.md)).

## Escalamiento

1. Guardia ventas-team (responsable operativo).
2. `tech-lead-ventas` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `finanzas-restobar` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

finanzas-restobar y soporte; avisar a servicio-caja (consumidor de `cuenta.cerrada`) si hubo reinyección masiva.
