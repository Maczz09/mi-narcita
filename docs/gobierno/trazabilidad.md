---
tipo: gobierno
tema: trazabilidad
revisado: 2026-07-07
---

# Trazabilidad documental

Cadena por servicio: **problema de negocio → capacidad → servicio → contrato → eventos →
decisión (ADR) → evidencia → operación**. Si un servicio no puede trazarse hasta un
problema de negocio, está documentando ruido. Cada eslabón es un link a un artefacto
versionado del repo.

Leyenda de eslabones comunes: contrato = `ficha.yaml` + `openapi.json` del servicio;
operación = runbook en `docs/operacion/runbooks/`; evidencia base =
[stress-tests/reports/BASELINE.md](../../stress-tests/reports/BASELINE.md) y los tests
unitarios/e2e de cada app.

## servicio-caja

| Eslabón | Artefacto |
|---|---|
| Problema | Cobrar la venta sin pagos duplicados ni descuadres de caja |
| Capacidad | Cobro y control de turnos (pagos mixtos, arqueo, cierre Z) |
| Servicio | [ficha](../servicios/servicio-caja/ficha.yaml) · [índice](../servicios/servicio-caja/_indice.md) |
| Contrato | `POST /pagos` — [openapi](../servicios/servicio-caja/openapi.json) |
| Eventos | Publica [pago.registrado](../eventos/pago.registrado.md); consume cuenta.abierta/cerrada |
| Decisión | [ADR-002 outbox](../decisiones/ADR-002-transactional-outbox.md) · [ADR-003 proyecciones](../decisiones/ADR-003-eventos-proyecciones-locales.md) |
| Evidencia | Invariante [turno-caja-abierto-unico](../invariantes/turno-caja-abierto-unico.md) · [fase-1 cierre único por pago](../operacion/fase-1-cierre-unico-por-pago.md) |
| Operación | [runbook](../operacion/runbooks/servicio-caja.md) |

## servicio-cuentas

| Eslabón | Artefacto |
|---|---|
| Problema | Saber cuánto consume cada mesa y cerrar la cuenta al cobrar |
| Capacidad | Cuenta de consumo por mesa (apertura, división, cierre, ticket) |
| Servicio | [ficha](../servicios/servicio-cuentas/ficha.yaml) · [índice](../servicios/servicio-cuentas/_indice.md) |
| Contrato | `POST /:id/cerrar` y resto — [openapi](../servicios/servicio-cuentas/openapi.json) |
| Eventos | Publica cuenta.abierta, [cuenta.cerrada](../eventos/cuenta.cerrada.md), ticket.generado |
| Decisión | [ADR-002 outbox](../decisiones/ADR-002-transactional-outbox.md) |
| Evidencia | Flujos [apertura-cuenta-ocupa-mesa](../flujos/apertura-cuenta-ocupa-mesa.md) y [pago-cierra-cuenta-libera-mesa](../flujos/pago-cierra-cuenta-libera-mesa.md) · [backfill cuentas abiertas](../operacion/backfill-cuentas-abiertas.md) |
| Operación | [runbook](../operacion/runbooks/servicio-cuentas.md) |

## servicio-pedidos

| Eslabón | Artefacto |
|---|---|
| Problema | Tomar el pedido en mesa y comandarlo a cocina sin vender sin stock |
| Capacidad | Pedidos e ítems, comandero |
| Servicio | [ficha](../servicios/servicio-pedidos/ficha.yaml) · [índice](../servicios/servicio-pedidos/_indice.md) |
| Contrato | `POST /` y estados — [openapi](../servicios/servicio-pedidos/openapi.json) |
| Eventos | Publica [pedido.creado](../eventos/pedido.creado.md), pedido.listo, pedido.actualizado |
| Decisión | [ADR-003 proyecciones locales](../decisiones/ADR-003-eventos-proyecciones-locales.md) (MesaLocal/ProductoLocal) |
| Evidencia | Flujo [crear-pedido-descuenta-stock](../flujos/crear-pedido-descuenta-stock.md) · invariante [no-oversell](../invariantes/no-oversell.md) |
| Operación | [runbook](../operacion/runbooks/servicio-pedidos.md) |

## servicio-inventario

| Eslabón | Artefacto |
|---|---|
| Problema | No vender productos sin stock (oversell) ni corromper stock con reintentos |
| Capacidad | Productos, categorías y stock idempotente |
| Servicio | [ficha](../servicios/servicio-inventario/ficha.yaml) · [índice](../servicios/servicio-inventario/_indice.md) |
| Contrato | `PATCH /productos/:id/stock` y resto — [openapi](../servicios/servicio-inventario/openapi.json) |
| Eventos | Publica producto.creado/actualizado; consume [pedido.creado](../eventos/pedido.creado.md) |
| Decisión | [ADR-004 decremento atómico](../decisiones/ADR-004-decremento-atomico-condicional.md) · [ADR-006 reposición como delta](../decisiones/ADR-006-reposicion-como-delta.md) |
| Evidencia | Invariantes [no-oversell](../invariantes/no-oversell.md), [idempotencia-directa](../invariantes/idempotencia-directa.md), [reposicion-como-delta](../invariantes/reposicion-como-delta.md) · reports `stock-idempotency-dlq-*` en stress-tests/reports/ |
| Operación | [runbook](../operacion/runbooks/servicio-inventario.md) |

## servicio-mesas

| Eslabón | Artefacto |
|---|---|
| Problema | Saber qué mesas están libres/ocupadas en tiempo real |
| Capacidad | Estado de mesas del salón |
| Servicio | [ficha](../servicios/servicio-mesas/ficha.yaml) · [índice](../servicios/servicio-mesas/_indice.md) |
| Contrato | `PATCH /:id/estado` y resto — [openapi](../servicios/servicio-mesas/openapi.json) |
| Eventos | Publica mesa.creada/actualizada; consume cuenta.abierta/cerrada |
| Decisión | [ADR-002 outbox](../decisiones/ADR-002-transactional-outbox.md) |
| Evidencia | Flujos [apertura-cuenta-ocupa-mesa](../flujos/apertura-cuenta-ocupa-mesa.md) y [pago-cierra-cuenta-libera-mesa](../flujos/pago-cierra-cuenta-libera-mesa.md) |
| Operación | [runbook](../operacion/runbooks/servicio-mesas.md) |

## servicio-reservas

| Eslabón | Artefacto |
|---|---|
| Problema | Reservar mesas sin doble booking del mismo slot |
| Capacidad | Reservas con anti-doble-booking |
| Servicio | [ficha](../servicios/servicio-reservas/ficha.yaml) · [índice](../servicios/servicio-reservas/_indice.md) |
| Contrato | `POST /`, `GET /disponibilidad` — [openapi](../servicios/servicio-reservas/openapi.json) |
| Eventos | Publica [reserva.creada](../eventos/reserva.creada.md), reserva.cancelada |
| Decisión | [ADR-005 slot único](../decisiones/ADR-005-reserva-slot-unico.md) · [ADR-010 granularidad](../decisiones/ADR-010-granularidad-anti-doble-booking.md) |
| Evidencia | Invariantes [slot-reserva-activo-unico](../invariantes/slot-reserva-activo-unico.md), [exactamente-un-exito-bajo-carrera](../invariantes/exactamente-un-exito-bajo-carrera.md) · flujo [reserva-crear-cancelar-notificar](../flujos/reserva-crear-cancelar-notificar.md) |
| Operación | [runbook](../operacion/runbooks/servicio-reservas.md) |

## servicio-identidad

| Eslabón | Artefacto |
|---|---|
| Problema | Solo personal autorizado opera el sistema, con roles diferenciados |
| Capacidad | Autenticación JWT y gestión de usuarios/roles |
| Servicio | [ficha](../servicios/servicio-identidad/ficha.yaml) · [índice](../servicios/servicio-identidad/_indice.md) |
| Contrato | `POST /auth/login` y resto — [openapi](../servicios/servicio-identidad/openapi.json) |
| Eventos | No publica ni consume (outbox disponible sin uso) |
| Decisión | [ADR-001 database-per-service](../decisiones/ADR-001-database-per-service.md) · [jwt-rs256](../operacion/jwt-rs256.md) |
| Evidencia | Reports `security-limits-*` en stress-tests/reports/ · [seguridad OWASP Top 10](../seguridad-owasp-top10.md) |
| Operación | [runbook](../operacion/runbooks/servicio-identidad.md) · [jwt-cache-degraded](../operacion/jwt-cache-degraded.md) |

## servicio-notificaciones

| Eslabón | Artefacto |
|---|---|
| Problema | El salón y el cliente deben enterarse de los cambios sin refrescar |
| Capacidad | Push en tiempo real (WebSocket) de eventos de dominio |
| Servicio | [ficha](../servicios/servicio-notificaciones/ficha.yaml) · [índice](../servicios/servicio-notificaciones/_indice.md) |
| Contrato | WS socket.io (rooms en `libs/contracts/src/events/ws-rooms.ts`) — [openapi](../servicios/servicio-notificaciones/openapi.json) |
| Eventos | Consume 7 eventos de dominio (ver ficha) |
| Decisión | [ADR-007 ack/nack](../decisiones/ADR-007-ack-nack-rmq.md) · [ADR-008 DLQ](../decisiones/ADR-008-dlq-parking-reinyeccion.md) |
| Evidencia | Flujo [reserva-crear-cancelar-notificar](../flujos/reserva-crear-cancelar-notificar.md) · invariante [colas-limpias-happy-path](../invariantes/colas-limpias-happy-path.md) |
| Operación | [runbook](../operacion/runbooks/servicio-notificaciones.md) |

## servicio-reportes

| Eslabón | Artefacto |
|---|---|
| Problema | Gerencia necesita ver ventas del día sin consultar cada servicio |
| Capacidad | Proyección de ventas diarias |
| Servicio | [ficha](../servicios/servicio-reportes/ficha.yaml) · [índice](../servicios/servicio-reportes/_indice.md) |
| Contrato | `GET /resumen` — [openapi](../servicios/servicio-reportes/openapi.json) |
| Eventos | Consume [cuenta.cerrada](../eventos/cuenta.cerrada.md) |
| Decisión | [ADR-003 proyecciones locales](../decisiones/ADR-003-eventos-proyecciones-locales.md) |
| Evidencia | Invariante [retencion-idempotency-keys](../invariantes/retencion-idempotency-keys.md) |
| Operación | [runbook](../operacion/runbooks/servicio-reportes.md) |
