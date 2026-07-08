---
tipo: runbook
servicio: servicio-reservas
owner: salon-team
revisado: 2026-07-07
---

# Runbook: servicio-reservas

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-reservas/ficha.yaml).

## Incidente cubierto

Doble booking: dos reservas activas para el mismo slot (fecha, hora). Por diseño es imposible si el índice único parcial está aplicado; si ocurre, el índice falta o hubo bypass de la base.

## Detección

- Cliente/salón reporta dos reservas para el mismo slot.
- Tasa anómala de 409 en `POST /` (carrera legítima) vs 500 (índice ausente).

## Primeras revisiones

- Health del servicio: `curl http://localhost:3006/api` (dev) o dashboard de Grafana.
- RabbitMQ management (`http://localhost:15672`): el servicio no consume cola propia; revisar solo su outbox como productor.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Verificar que el índice existe: `SELECT indexname FROM pg_indexes WHERE indexname = 'Reserva_fecha_hora_active_unique'`.
- `npm run drift` (check de migración): la migración `20260609010000_slot_unico_index` debe estar aplicada.

## Acción

- Si el índice falta: aplicar migraciones pendientes (`prisma migrate deploy` vía el job dedicado, [procedimiento](../migraciones-job-dedicado.md)).
- Cancelar la reserva duplicada más reciente (mismo criterio que la migración T-26: se conserva la más antigua) y contactar al cliente afectado.

## Escalamiento

1. Guardia salon-team (responsable operativo).
2. `tech-lead-salon` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `operaciones-salon` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

operaciones-salon y el cliente afectado; registrar el caso en el canal #incidentes con el slot y las reservas implicadas.
