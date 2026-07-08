---
tipo: runbook
servicio: servicio-inventario
owner: abastecimiento-team
revisado: 2026-07-07
---

# Runbook: servicio-inventario

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-inventario/ficha.yaml).

## Incidente cubierto

Stock desincronizado: eventos `pedido.creado` en DLQ sin descontar, o stock que no cuadra con lo vendido. Riesgo de oversell si se acumula.

## Detección

- Alerta `DLQGrowingFast` con mensajes en `dlq.inventario_queue`.
- Alerta `ERP_P95_LatencyHigh` (inventario respondiendo lento, precursor de timeouts en pedidos).
- Cocina reporta faltantes que el sistema daba como disponibles.

## Primeras revisiones

- Health del servicio: `curl http://localhost:3007/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `inventario_queue` y `dlq.inventario_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Mensajes en `dlq.inventario_queue`: payload y causa del fallo (schema vs base caída).
- Claims en `IdempotencyKey`: si el descuento ya ocurrió, la reinyección no duplica.
- `stockActual` de los productos implicados vs pedidos del período.

## Acción

- Reinyectar desde la DLQ con contador `x-reinjection-count`; al superar el tope va a `parking.inventario_queue` para análisis manual ([flujo](../../flujos/fallo-consumidor-dlq-reinyeccion-parking.md)).
- Corregir stock tras conteo físico usando reposición como delta (`PATCH /productos/:id/stock`, [ADR-006](../../decisiones/ADR-006-reposicion-como-delta.md)) — nunca editar la base a mano.

## Escalamiento

1. Guardia abastecimiento-team (responsable operativo).
2. `tech-lead-abastecimiento` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `operaciones-cocina` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

operaciones-cocina (stock real), tech-lead-ventas si pedidos estuvo rechazando por breaker, canal #incidentes.
