---
tipo: runbook
servicio: servicio-notificaciones
owner: plataforma-team
revisado: 2026-07-07
---

# Runbook: servicio-notificaciones

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-notificaciones/ficha.yaml).

## Incidente cubierto

La PWA no recibe actualizaciones en vivo (WebSocket caído o eventos sin consumir). Degradación tolerable: la operación sigue refrescando manualmente, pero se pierde la experiencia en tiempo real.

## Detección

- Alerta `BrokerConsumerLagHigh` o `DLQGrowingFast` sobre `dlq.notificaciones_queue`.
- Usuarios reportan que los estados no cambian sin refrescar.

## Primeras revisiones

- Health del servicio: `curl http://localhost:3008/api` (dev) o dashboard de Grafana.
- Cola y DLQ en RabbitMQ management (`http://localhost:15672`): profundidad de `notificaciones_queue` y `dlq.notificaciones_queue`.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Conexiones socket.io activas (logs del gateway WS) y handshake desde la PWA.
- Los 7 handlers de eventos en logs: ¿consumen y emiten a las rooms correctas (`libs/contracts/src/events/ws-rooms.ts`)?

## Acción

- Reiniciar el servicio (los clientes socket.io reconectan solos).
- Reinyectar DLQ si hay mensajes retenidos ([flujo DLQ](../../flujos/fallo-consumidor-dlq-reinyeccion-parking.md)); las notificaciones viejas duplicadas son inofensivas (idempotencia).

## Escalamiento

1. Guardia plataforma-team (responsable operativo).
2. `tech-lead-plataforma` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `gerencia-ti` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

Soporte (para que indique refrescar manualmente mientras dure) y #incidentes. No requiere aviso a negocio salvo que se prolongue.
