---
tipo: runbook
servicio: servicio-reportes
owner: plataforma-team
revisado: 2026-07-07
---

# Runbook: servicio-reportes

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-reportes/ficha.yaml).

## Incidente cubierto

Proyección `VentaDiaria` atrasada o incompleta (`cuenta.cerrada` sin consumir): el resumen gerencial no refleja las ventas reales. No bloquea la venta.

## Detección

- Alerta `BrokerConsumerLagHigh` o mensajes en `dlq.reportes_queue`.
- Gerencia reporta que `GET /resumen` no cuadra con lo cobrado en caja.

## Primeras revisiones

- Health del servicio: `curl http://localhost:3010/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `reportes_queue` y `dlq.reportes_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Handler `handleCuentaCerrada` en logs de reportes.
- Comparar `VentaDiaria` del día vs cuentas cerradas en servicio-cuentas.

## Acción

- Reinyectar desde `dlq.reportes_queue` ([flujo DLQ](../../flujos/fallo-consumidor-dlq-reinyeccion-parking.md)); el claim de `IdempotencyKey` evita contar doble.
- Si la proyección quedó corrupta, reconstruirla reprocesando los eventos del día (reinyección) antes que editarla a mano.

## Escalamiento

1. Guardia plataforma-team (responsable operativo).
2. `tech-lead-plataforma` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `gerencia-ti` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

gerencia-ti (consumidor del reporte) y #incidentes. Prioridad baja salvo cierre contable en curso.
