---
tipo: gobierno
tema: ownership
revisado: 2026-07-07
---

# Matriz de ownership

Ownership explícito por servicio: quién decide (funcional), quién mantiene y responde
técnicamente, quién opera en incidentes y quién consume. "El equipo backend" no es un
owner válido: cada responsabilidad tiene un asignado concreto.

Los equipos y roles se definen por dominio; el detalle por servicio vive también en la
`ficha.yaml` de cada servicio (`docs/servicios/<servicio>/ficha.yaml`).

## Equipos por dominio

| Dominio | ownerTeam | Owner técnico | Owner de negocio |
|---|---|---|---|
| Ventas y cobro | `ventas-team` | `tech-lead-ventas` | `finanzas-restobar` |
| Salón | `salon-team` | `tech-lead-salon` | `operaciones-salon` |
| Plataforma | `plataforma-team` | `tech-lead-plataforma` | `gerencia-ti` |
| Abastecimiento | `abastecimiento-team` | `tech-lead-abastecimiento` | `operaciones-cocina` |

## Matriz por servicio

| Servicio | Owner funcional | Owner técnico | Responsable operativo | Consumidores (código) |
|---|---|---|---|---|
| servicio-caja | finanzas-restobar | tech-lead-ventas | guardia ventas-team | pwa-cliente (vía Kong); eventos: cuentas, pedidos |
| servicio-cuentas | finanzas-restobar | tech-lead-ventas | guardia ventas-team | pwa-cliente; caja (HTTP); eventos: caja, notificaciones, reportes, mesas |
| servicio-pedidos | finanzas-restobar | tech-lead-ventas | guardia ventas-team | pwa-cliente; eventos: cuentas, inventario, notificaciones |
| servicio-mesas | operaciones-salon | tech-lead-salon | guardia salon-team | pwa-cliente; pedidos (HTTP); eventos: pedidos, notificaciones |
| servicio-reservas | operaciones-salon | tech-lead-salon | guardia salon-team | pwa-cliente; eventos: notificaciones |
| servicio-inventario | operaciones-cocina | tech-lead-abastecimiento | guardia abastecimiento-team | pwa-cliente; pedidos (HTTP); eventos: pedidos |
| servicio-identidad | gerencia-ti | tech-lead-plataforma | guardia plataforma-team | pwa-cliente; todos los servicios (validación JWT vía Kong) |
| servicio-notificaciones | gerencia-ti | tech-lead-plataforma | guardia plataforma-team | pwa-cliente (WebSocket) |
| servicio-reportes | gerencia-ti | tech-lead-plataforma | guardia plataforma-team | pwa-cliente |

El mapa exacto de productores/consumidores de eventos (con file:line) está en
[docs/eventos/_catalogo.md](../eventos/_catalogo.md).

## Responsabilidades por rol

| Rol | Decide | Mantiene | Consume | Opera |
|---|---|---|---|---|
| Owner funcional (negocio) | Sí | No | No | No |
| Owner técnico | Sí | Sí | No | Sí |
| Equipo consumidor | No | No | Sí | Reporta |
| Responsable operativo (guardia) | No | No | No | Sí |

## Ownership ante situaciones concretas

| Situación | ¿Quién decide? | ¿Quién ejecuta? | ¿A quién se informa? |
|---|---|---|---|
| Dependencia externa/infra caída (RabbitMQ, Postgres) | tech-lead-plataforma | guardia plataforma-team | Owners técnicos de servicios afectados + negocio |
| Evento duplicado en consumidor (idempotencia falla) | Owner técnico del consumidor | Guardia del equipo consumidor | Owner técnico del productor |
| Evento no entregado (mensaje en DLQ/parking) | Owner técnico del consumidor | Guardia (reinyección según [flujo DLQ](../flujos/fallo-consumidor-dlq-reinyeccion-parking.md)) | Owner técnico del productor + negocio si afecta venta |
| Cambio de contrato (API o evento) | Owner técnico del productor | Equipo productor | Todos los consumidores registrados en el catálogo de eventos, antes de aprobar (ver [política de versionado](politica-versionado.md)) |
| Incidente P1 (venta bloqueada: caja/cuentas/pedidos caídos) | tech-lead-ventas | Guardia ventas-team + guardia plataforma-team | finanzas-restobar, soporte, canal #incidentes |

## Escalamiento

1. Guardia del equipo owner (responsable operativo).
2. Owner técnico del servicio (tech-lead del dominio).
3. tech-lead-plataforma si involucra infra compartida (Kong, RabbitMQ, Postgres, observabilidad).
4. Owner de negocio del dominio si hay impacto en venta u operación del local.

Los runbooks por servicio ([docs/operacion/runbooks/](../operacion/runbooks/)) referencian
esta matriz en sus secciones de escalamiento y comunicación.
