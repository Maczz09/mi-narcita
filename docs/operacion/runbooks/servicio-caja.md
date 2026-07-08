---
tipo: runbook
servicio: servicio-caja
owner: ventas-team
revisado: 2026-07-07
---

# Runbook: servicio-caja

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-caja/ficha.yaml).

## Incidente cubierto

Pago registrado en caja cuya cuenta no se cerró en servicio-cuentas (cierre remoto pendiente) o sospecha de pago duplicado. Es el incidente P1 del dominio: hay dinero cobrado y estado inconsistente entre caja y cuentas.

## Detección

- Alerta `PagoCierrePendienteHigh` (crítica): `pagos_cierre_remoto_pendiente_total` > 5 en 10 min (`infra/prometheus/alert.rules.yml`).
- Soporte reporta cuentas que siguen abiertas después de cobrar.
- Logs de caja con error al llamar `POST /:id/cerrar` de cuentas (circuit breaker caja→cuentas).

## Primeras revisiones

- Health del servicio: `curl http://localhost:3009/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `caja_queue` y `dlq.caja_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Health de servicio-cuentas (dependencia HTTP del cierre) y estado del circuit breaker.
- Tabla `outbox_events` de caja: filas `PENDING`/`FAILED` de `pago.registrado`.
- Proyección `CuentaAbierta` de caja vs cuentas reales abiertas en servicio-cuentas.

## Acción

- Si cuentas volvió: reconciliar según [fase-1-cierre-unico-por-pago](../fase-1-cierre-unico-por-pago.md) (cierre único por pago, idempotente).
- Backfill de la proyección de cuentas abiertas: `npm run backfill:cuentas-abiertas` ([procedimiento](../backfill-cuentas-abiertas.md)).
- Ante pago duplicado: verificar `IdempotencyKey` reclamada; no revertir a mano sin confirmar con finanzas.

## Escalamiento

1. Guardia ventas-team (responsable operativo).
2. `tech-lead-ventas` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `finanzas-restobar` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

finanzas-restobar (impacto en dinero), soporte del local y canal #incidentes. Registrar en el informe del turno los pagos reconciliados.
