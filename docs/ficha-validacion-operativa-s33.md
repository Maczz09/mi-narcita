---
tipo: ficha-validacion-operativa
sesion: S33 (Despliegue y operación del servicio)
proyecto: NachoPps — plataforma de gestión para restobar
revisado: 2026-07-14
responsable: Marcos
---

# Ficha de Validación Operativa del Entorno — S33

Evidencia operativa de la sesión 33: el proyecto **se levanta, opera, falla de
forma controlada y deja evidencia**. Sustituye al relato por una defensa técnica
verificable. Los gates (G1–G9) y las fitness functions (FF-DEP-01..10) son los
del material S33; el estado es el real de la rama.

---

## 0. Comando reproducible (G1 / FF-DEP-01)

```sh
# Stack completo (9 servicios + PWA + Kong + infra), espera a healthy
docker compose -f infra/docker-compose.yml --profile all up -d --wait --wait-timeout 180

# Semilla de admin y humo de integración
node scripts/seed-admin.js
npm run probar          # → scripts/pruebas-integracion.ts
```

> No es el `docker compose up --build` "pelado" del ejemplo del PDF: requiere
> `-f infra/docker-compose.yml` y `--profile all` (perfiles `infra`/`dev`/`all`).
> Está documentado aquí y en `docs/operacion/levantar-sistema.md`, y CI lo
> ejecuta en cada push (`.github/workflows/integration-docker.yml:59`).

## 1. Levantamiento del entorno (Actividad 1)

| Servicio | Puerto host | Estado esperado | Health check |
|----------|:-----------:|:---------------:|--------------|
| identidad | 3001 | UP | `GET /api/health/live · /ready · /dependencies` |
| mesas | 3002 | UP | idem |
| pedidos | 3004 | UP | idem |
| cuentas | 3005 | UP | idem |
| reservas | 3006 | UP | idem |
| inventario | 3007 | UP | idem |
| notificaciones | 3008 | UP | idem |
| caja | 3009 | UP | idem |
| reportes | 3010 | UP | idem |
| Kong (gateway) | 8000 | UP | `kong health` |
| RabbitMQ | 5672 / 15672 | UP | `rabbitmq-diagnostics check_running` |
| Postgres ×9 | interno | UP | `pg_isready` |

El healthcheck de Docker de cada servicio sondea `/api/health/live`
(`infra/docker-compose.yml`), así que `--wait` no da por sano un contenedor
hasta que su health serio responde.

## 2. Health check serio (G2 / FF-DEP-02)

Reemplazado el `{ "ok": true }` débil por el trío recomendado, compartido en
`libs/observabilidad/src/lib/health.controller.ts` y montado en los 9 servicios
con `HealthModule.forRoot(PrismaService)`:

```jsonc
// GET /api/health/dependencies  (servicio-pedidos)
{
  "status": "DEGRADED",
  "service": "pedidos",
  "version": "0.0.1",
  "dependencies": { "database": "UP", "inventario": "DEGRADED", "mesas": "UP" }
}
```

- `/api/health/live` → proceso arriba (no toca dependencias).
- `/api/health/ready` → **503** si la BD no responde (`SELECT 1`).
- `/api/health/dependencies` → BD + estado de cada circuit breaker (leído del
  gauge `circuit_breaker_state`, sin wiring nuevo por servicio).

## 3. Flujo principal (G3 / FF-DEP-03 · Actividad 2)

Flujo **mesa → pedido → cuenta → pago**:

| Paso | Endpoint / Evento | Estado inicial → final | Evidencia |
|:----:|-------------------|------------------------|-----------|
| 1 | `POST /mesas` | (nueva) → `LIBRE` | 201 + `mesaId` |
| 2 | `POST /pedidos` | mesa `LIBRE` → `OCUPADA`; pedido `PENDIENTE` | 201 + `pedidoId` + `correlationId`; evento `pedido.creado` |
| 3 | (async) `cuenta.abierta` vía outbox→RabbitMQ | — → cuenta `ABIERTA` | proyección en cuentas; WebSocket a notificaciones |
| 4 | `POST /caja/pagos` | cuenta `ABIERTA` → `CERRADA`; mesa → `LIBRE` | 201 + `pago.registrado`; ticket generado |

Implementado y ejecutado en CI: `stress-tests/run-all-stress-tests.js:373`
(`testFullFlowConcurrent`) y las 9 suites `*-e2e`.

## 4. Prueba de resiliencia (G4 / FF-DEP-04 · Actividad 3)

| Falla simulada | Esperado | Obtenido | Script | Brecha |
|----------------|----------|----------|--------|:------:|
| Dependencia (BD) caída | error rápido / eventos en outbox | ✅ | `run-chaos-db-down.js` | — |
| Doble servicio caído | timeout visible / 503 | ✅ | `run-chaos-double-service-down.js` | — |
| 503 temporal | retry con límite → DLQ | ✅ | `run-stock-idempotency-dlq.js` | — |
| Evento duplicado (mismo `eventId`) | no duplica acción | ✅ | `run-stock-idempotency-dlq.js` | — |
| Pago/stock rechazado | compensación (`RECHAZADO_SIN_STOCK`) | ✅ | `run-stock-idempotency-dlq.js` | — |
| 429 rate limit (Kong) | degradación controlada | ✅ | `run-security-limits.js` | — |
| RabbitMQ caído bajo carga | recuperación al volver | ✅ | `run-chaos-rabbitmq-bajo-carga.js` | — |

Detalle en [matriz-resiliencia.md](matriz-resiliencia.md).

## 5. Observabilidad (G5, G6 / FF-DEP-05, FF-DEP-06 · Actividad 4)

| Evidencia | Estado | Dónde se ve |
|-----------|:------:|-------------|
| Log estructurado JSON | ✅ | stdout (Winston + `otelTraceFormat`) → Loki/Promtail |
| `correlationId` (= traceId OTel) | ✅ | en cada log; propagado por AMQP |
| Métrica requests | ✅ | `http_requests_total` en `/api/telemetry/metrics` |
| Métrica errores | ✅ (por label `status_code`) | Prometheus / Grafana |
| Métrica resiliencia | ✅ | `retry_attempts_total`, `dlq_messages_total`, `circuit_breaker_state`, `dependency_timeout_total` |
| Trazas distribuidas | ✅ | Jaeger (OTLP) |
| Dashboard | ✅ | Grafana (`infra/grafana`) |

## 6. Auditoría técnica + gobernanza documental (G7, G8 / FF-DEP-07, FF-DEP-08 · Actividad 5)

| Elemento | Estado | Ubicación |
|----------|:------:|-----------|
| Evento auditable crítico | ✅ | [matriz-auditoria.md](matriz-auditoria.md) |
| Catálogo de servicios | ✅ | [catalogo-servicios.md](catalogo-servicios.md) |
| Contratos API/eventos | ✅ | `libs/contracts`, `docs/servicios/*/openapi.json`, [eventos/_catalogo.md](eventos/_catalogo.md) |
| Matriz de resiliencia | ✅ | [matriz-resiliencia.md](matriz-resiliencia.md) |
| Matriz de auditoría | ✅ | [matriz-auditoria.md](matriz-auditoria.md) |
| Runbook | ✅ | [operacion/runbooks/](operacion/runbooks/) |
| ADR / decisiones | ✅ | [decisiones/](decisiones/) (ADR-001..011) |

## 7. Sin secretos hardcodeados (FF-DEP-09)

`.env.example` declara todas las variables; `docker-compose.prod.yml` usa
`${VAR:?mensaje}` y **falla al arrancar** si falta un secreto; secretos reales
en `infra/secrets/` (git-ignored). CI corre `npm audit --omit=dev --audit-level=high`.

---

## 8. Checklist estricto de aceptación S33

| Gate | Pregunta | Estado |
|:----:|----------|:------:|
| G1 | ¿El entorno se levanta con instrucciones claras? | ✅ Sí |
| G2 | ¿Servicios principales tienen health check? | ✅ Sí (serio: live/ready/dependencies) |
| G3 | ¿Flujo principal se ejecuta o simula técnicamente? | ✅ Sí |
| G4 | ¿Se probó al menos una falla de resiliencia? | ✅ Sí (7 escenarios) |
| G5 | ¿Hay logs estructurados con correlationId? | ✅ Sí |
| G6 | ¿Hay métricas/trazas/dashboard mínimo? | ✅ Sí |
| G7 | ¿Hay evento auditable crítico evidenciado? | ✅ Sí |
| G8 | ¿Documentación coincide con lo desplegado? | ✅ Sí |
| G9 | ¿Brechas críticas tienen responsable? | ✅ Sí (§10) |

## 9. Fitness functions de cierre operativo

| FF | Criterio | Estado |
|----|----------|:------:|
| FF-DEP-01 | Entorno principal con comando reproducible | ✅ |
| FF-DEP-02 | Servicios principales con health check | ✅ |
| FF-DEP-03 | Flujo principal ejecutable o simulado | ✅ |
| FF-DEP-04 | Dependencia puede fallar de forma observable | ✅ |
| FF-DEP-05 | Logs con correlationId en flujo crítico | ✅ |
| FF-DEP-06 | Métricas/trazas/dashboard mínimo | ✅ |
| FF-DEP-07 | Evento auditable crítico con evidencia | ✅ |
| FF-DEP-08 | Documentación coincide con solución | ✅ |
| FF-DEP-09 | Sin secretos hardcodeados | ✅ |
| FF-DEP-10 | Brechas críticas con owner antes de S34 | ✅ |

## 10. Brechas hacia Sesión 34

| Brecha | Impacto | Acción antes de S34 | Responsable |
|--------|:-------:|---------------------|:-----------:|
| Métricas de observabilidad de resiliencia sin nombre canónico del PDF (`webhook_duplicates_total`, `errors_total`, `dependency_errors_total`): la señal existe (dedup por `eventId`, `status_code`, `dependency_timeout_total`) pero no como counter con ese nombre exacto | Bajo | Opcional: añadir counters con alias canónico si el rúbrica lo exige literal | Marcos |
| Comando de arranque no es `docker compose up` pelado (requiere `-f`/`--profile`) | Bajo | Documentado; evaluar `Makefile`/wrapper `npm run up` | Marcos |
| Jaeger no publica `16686` en prod | Bajo | Túnel SSH documentado (`docs/operacion/jaeger-prod.md`) | Marcos |
| Alertmanager sin receiver activo | Medio | Configurar receiver (Slack/email) antes de la defensa | Marcos |
| Módulo Compras/Proveedores es mock (sin backend) | Medio | Declarar explícitamente como fuera de alcance en la defensa | Marcos |

> Regla S33: lo que no se puede mostrar se declara como brecha y se corrige
> antes de la sesión 34. Ninguna brecha de arriba bloquea G1–G8; G9 queda
> cubierto con esta ficha.
