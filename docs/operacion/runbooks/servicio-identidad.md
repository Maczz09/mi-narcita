---
tipo: runbook
servicio: servicio-identidad
owner: plataforma-team
revisado: 2026-07-07
---

# Runbook: servicio-identidad

Escalamiento y roles según la [matriz de ownership](../../gobierno/ownership.md).
Ficha del servicio: [ficha.yaml](../../servicios/servicio-identidad/ficha.yaml).

## Incidente cubierto

Login caído o JWT inválidos tras una rotación de claves RS256: nadie puede operar el sistema. Incidente P1 transversal (todos los servicios validan JWT).

## Detección

- 401 masivos en Kong (todas las rutas autenticadas fallan).
- Alerta del jwt-cache de Kong en `degraded_mode` ([runbook](../jwt-cache-degraded.md)).
- Usuarios reportan expulsión simultánea de la PWA.

## Primeras revisiones

- Health del servicio: `curl http://localhost:3001/api` (dev) o dashboard de Grafana.
- RabbitMQ management (`http://localhost:15672`): el servicio no consume cola propia; revisar solo su outbox como productor.
- Logs estructurados por `correlationId` (Loki/Grafana o `docker logs`), y traza en Jaeger.
- Health de servicio-identidad y logs de `POST /auth/login`.
- Paridad de claves: la pública que valida Kong/servicios debe corresponder a la privada que firma ([jwt-rs256](../jwt-rs256.md)).
- Secrets montados ([gestión de secrets](../secrets.md)): ¿rotación a medias?

## Acción

- Completar/revertir la rotación de claves según [jwt-rs256](../jwt-rs256.md) (en dev: `npm run dev:keys`).
- Purgar el jwt-cache de Kong y salir de `degraded_mode` según su [runbook](../jwt-cache-degraded.md).
- Reiniciar identidad solo si las claves ya son consistentes.

## Escalamiento

1. Guardia plataforma-team (responsable operativo).
2. `tech-lead-plataforma` (owner técnico del servicio).
3. `tech-lead-plataforma` si la causa es infra compartida (RabbitMQ, Postgres, Kong, observabilidad).
4. `gerencia-ti` (owner de negocio) si hay impacto en la operación del local.

## Comunicación

TODOS los equipos (afecta a todo el sistema), gerencia-ti y soporte. Anunciar inicio y fin del incidente en #incidentes.
