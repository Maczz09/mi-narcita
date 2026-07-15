---
tipo: matriz-auditoria
fuente: [apps/servicio-identidad/src/auth/auth.service.ts, libs/resiliencia/src/lib/outbox.processor.ts, docs/eventos/]
revisado: 2026-07-14
sesion: S33 (Despliegue y operación · pág. 18)
---

# Matriz de auditoría técnica — NachoPps

Para cada evento/acción crítica: dónde queda registrado, cómo se correlaciona
(`correlationId`), qué transición de estado captura, quién es el actor y qué
`eventId` lo hace idempotente. Cumple los campos mínimos de auditoría que exige
la sesión 33 (pág. 18: evento crítico, correlationId, estado ant/nuevo, actor,
eventId en webhooks, evidencia de error/compensación).

## Cómo se materializa cada campo

- **correlationId**: es el `traceId` de OpenTelemetry, inyectado en cada log por
  `libs/observabilidad/src/lib/log-trace.format.ts:12` y propagado entre servicios
  vía headers AMQP (`propagation.inject/extract`).
- **eventId**: el outbox fija `payload.eventId ??= event.id`
  (`libs/resiliencia/src/lib/outbox.processor.ts:158`); el consumidor deduplica por él.
- **estado ant/nuevo**: en la máquina de estados de dominio (`PedidoEstado`,
  `CuentaEstado`) y en la auditoría transaccional de identidad.
- **actor**: usuario autenticado (`@UsuarioActual()`) o servicio productor.

## Acciones auditables

| Evento crítico | correlationId | Estado anterior → nuevo | Actor / servicio | eventId | Evidencia (código) |
|----------------|:-------------:|-------------------------|------------------|:-------:|--------------------|
| **LOGIN** | ✅ log | — → sesión activa | usuario | — | `auth.service.ts:117` (`auditoriaLog.create accion:'LOGIN'`) |
| **CAMBIAR_ROL** | ✅ log | rol anterior → nuevo | admin (`por:ejecutadoPor`) | — | `auth.service.ts:370` (auditoría **dentro de la misma `tx`** que el cambio) |
| **PedidoCreado** | ✅ traza | (nuevo) → `PENDIENTE` | pedidos | ✅ | outbox `pedidos`; `app.service.ts:258` |
| **StockInsuficiente** (compensación) | ✅ traza | `PENDIENTE` → `RECHAZADO_SIN_STOCK` | inventario | ✅ (`injectEventId:true`) | `inventario/app.service.ts:307` → `pedidos/events.controller.ts:33` |
| **PagoRegistrado** | ✅ traza | cuenta `ABIERTA` → cobro | caja (cajero) | ✅ | `caja/app.service.ts:110` |
| **CuentaCerrada** | ✅ traza | `ABIERTA` → `CERRADA` | cuentas | ✅ | `cuentas/app.service.ts:287` |
| **Cierre remoto no confirmado** | ✅ traza + métrica | pago OK / cierre `PENDIENTE` | caja | ✅ | `pagos_cierre_remoto_pendiente_total`; degradación `PAGO_SIN_CIERRE_CONFIRMADO` |
| **Evento a DLQ** (fallo definitivo) | ✅ traza | procesando → `DLQ` | consumidor | ✅ | `rabbitmq-retry.interceptor.ts` + `dlq_messages_total`; alerta `outbox-alert.ts` |

## Modelo de auditoría persistente (identidad)

`model AuditoriaLog` — `apps/servicio-identidad/prisma/schema.prisma:39`:

```prisma
model AuditoriaLog {
  id        String   @id @default(uuid())
  accion    String
  usuarioId String
  servicio  String
  ip        String?
  createdAt DateTime @default(now())
  @@index([usuarioId])
}
```

En los demás servicios la traza auditable es el **outbox transaccional**
(`model OutboxEvent`): el evento se persiste en la misma transacción que el
cambio de estado, con `routingKey`, `payload` (incluye `eventId`), `status` y
`createdAt` — evidencia inmutable de qué pasó y cuándo.

Ver también: [catálogo de eventos](eventos/_catalogo.md) ·
[matriz de resiliencia](matriz-resiliencia.md) ·
[trazabilidad documental](gobierno/trazabilidad.md).
