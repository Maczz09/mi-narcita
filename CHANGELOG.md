# Changelog

Todas las novedades relevantes de RestoApp.pe. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/). Los commits siguen
[Conventional Commits](https://www.conventionalcommits.org/es/) (ver `CONTRIBUTING.md`).

## [Unreleased]

### Added
- Script one-off `backfill:cuentas-abiertas` para corregir cuentas abiertas con
  total inflado por pedidos no cobrables.
- Runbooks de Jaeger en producción, `jwt-cache` degradado y configuración de
  agentes.
- Compensación de la saga de stock: evento `StockInsuficiente`; Pedidos marca
  ítem/pedido `RECHAZADO_SIN_STOCK` y emite `PedidoActualizado` (plan 1.1).
- Idempotencia HTTP en `POST /pedidos` y `POST /caja/pagos` vía header
  `Idempotency-Key` con *replay* de la respuesta cacheada (plan 1.3).
- Guard de drift de migraciones en CI (`scripts/check-migration-drift.sh`) (plan 1.2).
- Métricas de profundidad del outbox (`outbox_pending_total` / `outbox_failed_total`),
  reglas de Alertmanager y dashboard de Grafana (plan 3.1).
- Endpoint admin `POST /outbox/:id/retry` + `GET /outbox/failed`; alerta de
  `OUTBOX_FAILED` a webhook Slack (`SLACK_WEBHOOK_URL`) (plan 3.3).
- Prueba de caos de RabbitMQ (`npm run probar:caos`) (plan 3.6).
- e2e en CI: los 9 `*-e2e` + Playwright PWA, con trigger `pull_request` (plan 4.1).
- Contract tests entre servicios (`@EventPattern` ↔ `@org/contracts`) (plan 4.3).
- Logs JSON estructurados con `trace_id`/`correlationId`; Loki + Promtail +
  datasource de Grafana (plan 5.1).
- Métricas de negocio (`pedidos_creados_total`, `pagos_registrados_total`,
  `pago_monto_soles`, `outbox_publish_lag_seconds`) + dashboard (plan 5.2).
- Backups de las 9 BDs: `scripts/backup-postgres.sh` + sidecar `db-backup` (plan 3.5).
- Versionado de API `/v1` en el gateway (alias retrocompatible) (plan 6.2).
- Reportes por producto / turno / mesero (`/reportes/por-*`) (plan 6.3).
- Refresh tokens: `POST /auth/refresh` + rotación de cookie httpOnly (plan 1.4).

### Changed
- `procesarPagoRecibido` en pedidos usa un `updateMany` atómico e idempotente y
  no marca `RECHAZADO_SIN_STOCK` como pagado.
- Documentada la salida futura del modo tolerante de `SERVICE_AUD_ENFORCE`.
- JWT de usuario migrado de HS256 compartido a **RS256** (privada solo en
  identidad, pública en servicios + Kong); tokens de servicio en HS256 con
  secreto dedicado (plan 2.1).
- CSP explícita en Helmet en los 9 servicios (plan 2.4).

### Security
- `pedido.total` se recompone al rechazar ítems por falta de stock y cuentas
  excluye pedidos `CANCELADO`/`RECHAZADO_SIN_STOCK` del total cobrable.
- `CORS_ORIGIN` y `GRAFANA_PASS` fallan rápido en producción; Jaeger deja de
  publicar `16686` en el compose productivo.
- Kong Admin API ya no se publica en prod (loopback interno) (plan 2.2).
- Gestor de secretos vía Docker secrets para prod (plan 2.3).

### Tests
- **100% de tests exitosos** en backend y PWA.
- **Quality Gate de SonarQube** certificado en Excellence (0 bugs, 0 code smells, 81% de cobertura).
- Specs de remediación para saga de dinero, cuenta con pedidos no cobrables,
  `PagoRegistrado` idempotente y confusión de algoritmo JWT.
- Cobertura mínima subida en `vitest.config.mts`; specs nuevos para la saga de
  stock, idempotencia, JWT, outbox y reportes (plan 4.2).
