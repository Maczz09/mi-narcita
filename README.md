# NachoPps — Plataforma de gestión para restobar

Monorepo **Nx** con una arquitectura de **microservicios event-driven** (NestJS) y una **PWA** (React + Vite). Cada servicio es dueño de su base de datos (database-per-service) y se comunica de forma asíncrona vía **RabbitMQ** (topic exchange) y, donde hace falta consistencia inmediata, de forma síncrona vía HTTP con circuit breaker. Todo el tráfico del cliente entra por un único **API Gateway (Kong)**.

```
┌──────────────┐      :8000 (Kong)        ┌────────────────────────────────────────┐
│  PWA cliente │ ───────────────────────► │  API Gateway Kong                        │
│ (React/Vite) │   cookie httpOnly JWT     │  jwt · cors · rate-limit · jwt-cache     │
└──────────────┘   + X-CSRF-Token          └───────────────┬──────────────────────────┘
        ▲  WebSocket (/notificaciones/socket.io)            │ /{dominio} → http://servicio:3000/api
        │                                                   ▼
        │                         ┌─────────────────────────────────────────────────┐
        └──── eventos en vivo ────│ identidad · mesas · pedidos · cuentas · reservas │
                                  │ inventario · notificaciones · caja · reportes    │
                                  └───────┬───────────────────────┬──────────────────┘
                                          │ Outbox transaccional  │ Postgres por servicio
                                          ▼
                                   ┌──────────────┐
                                   │  RabbitMQ    │  nachopps_exchange (topic)
                                   └──────────────┘
```

## Estructura

| Carpeta | Contenido |
|---------|-----------|
| `apps/servicio-*` | 9 microservicios NestJS + sus suites e2e (`*-e2e`) |
| `apps/pwa-cliente` | Frontend PWA (React 19, Vite, React Query, React Router v7) |
| `libs/contracts` | Contratos compartidos: comandos/queries por dominio, routing keys, envelope de eventos |
| `libs/shared-auth` | Guard JWT + estrategia Passport + validación CSRF (double-submit) |
| `libs/shared-prisma` | `PrismaService` con hooks de apagado |
| `libs/shared-rabbitmq` | Publicador AMQP (fail-fast si falta `RABBITMQ_URI`) |
| `libs/resiliencia` | `@CircuitBreaker` (opossum) y `RabbitMQRetryInterceptor` |
| `libs/observabilidad` | `initTracing` (OpenTelemetry) |
| `infra` | `docker-compose.yml` (dev), `docker-compose.prod.yml`, Kong, Prometheus |

## Servicios y dominios

| Servicio | Puerto host (dev) | Responsabilidad | Eventos que consume |
|----------|------------------|-----------------|---------------------|
| identidad | 3001 | Auth JWT, usuarios, roles | — |
| mesas | 3002 | Mesas y su estado | CuentaAbierta, CuentaCerrada |
| pedidos | 3004 | Pedidos e ítems, comandero | Mesa*, Producto*, PagoRegistrado |
| cuentas | 3005 | Cuentas, tickets | PedidoCreado/Actualizado, PagoRegistrado |
| reservas | 3006 | Reservas con anti-doble-booking | — |
| inventario | 3007 | Productos y stock | PedidoCreado (descuento idempotente) |
| notificaciones | 3008 | WebSocket en vivo (socket.io) | la mayoría de eventos de dominio |
| caja | 3009 | Turnos, pagos, arqueo, cierre Z | CuentaAbierta, CuentaCerrada |
| reportes | 3010 | Reportes de ventas | CuentaCerrada |

> **Frontend ↔ backend:** todos los módulos de la PWA consumen el backend real a través de Kong (`:8000`). **Excepción:** el módulo **Compras** es actualmente **mock** (`apps/pwa-cliente/src/data/compras.mock.ts`), sin microservicio asociado — alcance pendiente.

## Patrones clave

- **Transactional Outbox** en los 9 servicios: el evento se persiste en la misma transacción que el cambio de estado y un `OutboxProcessor` (cron 1s) lo publica con reintentos (5 → `FAILED`), purga e idempotencia.
- **Idempotencia de consumidores:** claim atómico de `idempotencyKey` (p.ej. por `pedido.id`) antes de procesar.
- **Resiliencia:** retry interceptor en consumidores + circuit breaker en llamadas síncronas (pedidos→mesas, pedidos→inventario, caja→cuentas).
- **Seguridad:** JWT en cookie `httpOnly`, CSRF double-submit (`X-CSRF-Token`), `helmet`, CORS restrictivo, `ValidationPipe` whitelist, `GlobalExceptionFilter`, Swagger solo fuera de producción, fail-fast sin `RABBITMQ_URI`/`CORS_ORIGIN` en prod, graceful shutdown.

## Desarrollo

```sh
# Infra (RabbitMQ, Postgres x9, Kong, Jaeger, Prometheus, Grafana)
docker compose -f infra/docker-compose.yml --profile infra up -d

# Servicio individual
npm exec nx serve servicio-pedidos
npm exec nx serve pwa-cliente

# Calidad (lo que valida CI)
npm exec nx run-many -- --target=lint --all
npm exec nx run-many -- --target=typecheck --all
npm exec nx run-many -- --target=build --all
npm exec nx run @org/source:test   # vitest raíz: recoge *.spec de servicios + pwa + shared-auth
npm exec nx run-many -- --target=e2e --all --parallel=1   # contra stack Docker/Kong levantado
```

> `build` empaqueta artefactos, pero no reemplaza `typecheck`. CI ejecuta `typecheck build test`; localmente corre ambos antes de cerrar cambios.
> Los e2e locales validan la pila Docker/Kong existente; levanta primero `docker compose -f infra/docker-compose.yml --profile infra up -d`.

> **Estado actual de Calidad:** 100% de tests exitosos en backend y PWA. Quality Gate de SonarQube certificado en **Excellence** (0 bugs, 0 code smells, 81% de cobertura). La cobertura tiene **pisos anti-regresión** en `vitest.config.mts` (objetivo: mantener sobre 80%).

## Despliegue (producción)

1. Copiar `.env.example` → `.env` y rellenar **todas** las variables obligatorias. El compose de prod usa `${VAR:?}` y **falla rápido** si faltan secretos.
2. Variables clave: `DB_PASS`, `RABBITMQ_PASS`, las claves JWT RS256 (`JWT_PRIVATE_KEY` solo en identidad, `JWT_PUBLIC_KEY` + `KONG_JWT_PUBLIC_KEY` en todos), `SERVICE_JWT_SECRET` (tokens S2S), `CORS_ORIGIN` y `KONG_CORS_ORIGINS` (dominio https real de la PWA). Genera el par con `node scripts/generate-jwt-keys.mjs`.
3. En `apps/pwa-cliente/.env.production`, fijar `VITE_API_BASE_URL` al **dominio https real** (con `secure:true` la cookie no viaja sobre http).
4. Las migraciones se aplican solas al arrancar cada contenedor vía `prisma migrate deploy` (ver `infra/entrypoint.sh`). **Nunca** usar `db push --accept-data-loss` en prod.

```sh
docker compose -f infra/docker-compose.prod.yml up -d
```

### Escalado horizontal del outbox
El `OutboxProcessor` (en `libs/resiliencia`) reclama cada lote con un `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` que marca los eventos como `PUBLISHING`: **varias réplicas por microservicio son seguras** — cada una salta las filas bloqueadas por las demás, sin publicar duplicados en el happy path (T-08). Un cron de rescate devuelve a `PENDING` los `PUBLISHING` huérfanos (réplica caída a mitad de lote) tras 60s, preservando la entrega at-least-once. Configurar `terminationGracePeriodSeconds` ≥ 30s para el apagado graceful.

## Observabilidad
Jaeger (trazas OTEL), Prometheus (métricas en `/api/telemetry/metrics`) y Grafana. Todos los servicios exportan a `OTEL_EXPORTER_OTLP_ENDPOINT`. En producción Jaeger no publica `16686`; usar túnel SSH/red interna (`docs/operacion/jaeger-prod.md`).

## Desarrollo local solamente
`infra/docker-compose.yml` y `scripts/poblar-datos.ts` son solo para desarrollo: contienen credenciales demo y datos de prueba. Producción usa `infra/docker-compose.prod.yml` con `.env` real.

## Documentación
- `docs/production-audit-report.md` — auditoría de producción y correcciones aplicadas.
- `docs/operacion/` — levantar el sistema, base de datos, RabbitMQ, resiliencia.
- `docs/decisiones/` — ADRs.
