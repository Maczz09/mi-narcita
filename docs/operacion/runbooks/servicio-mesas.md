---
tipo: runbook
servicio: servicio-mesas
owner: salon-team
revisado: 2026-07-07
---

# Runbook: servicio-mesas

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-mesas/ficha.yaml).

## Incidente cubierto

Mesa que no se libera tras cerrarse la cuenta (`cuenta.cerrada` no consumido): el salón ve mesas ocupadas que están libres y deja de sentar clientes.

## Detección

- Alerta `DLQGrowingFast` con mensajes en `dlq.mesas_queue`.
- Salón reporta mesas 'fantasma' ocupadas sin cuenta abierta.

## Primeras revisiones

- Health del servicio: `curl http://localhost:3002/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `mesas_queue` y `dlq.mesas_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Handler `handleCuentaCerrada` en logs de mesas.
- Outbox de servicio-cuentas: ¿se publicó `cuenta.cerrada`?

## Acción

- Reinyectar desde `dlq.mesas_queue` ([flujo DLQ](../../flujos/fallo-consumidor-dlq-reinyeccion-parking.md)).
- Remediación puntual mientras tanto: `PATCH /:id/estado` para liberar la mesa afectada (idempotente).

## Escalamiento

1. Guardia salon-team (responsable operativo).
2. `tech-lead-salon` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `operaciones-salon` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

operaciones-salon y soporte; avisar a pedidos (consume `mesa.actualizada`) si hubo corrección masiva de estados.
