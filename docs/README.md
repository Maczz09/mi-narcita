# Índice de documentación

## Gobierno de servicios

- [Checklist de gobierno con semáforo](gobierno/checklist-gobierno.md) — verificación automatizada: `npm run gobierno:check`
- [Matriz de ownership](gobierno/ownership.md) (+ `CODEOWNERS` en raíz)
- [Política de versionado de contratos](gobierno/politica-versionado.md)
- [Trazabilidad documental](gobierno/trazabilidad.md)
- Ficha de catálogo por servicio: `servicios/<servicio>/ficha.yaml`
- Contrato OpenAPI por servicio: `servicios/<servicio>/openapi.json` (generado: `npm run contratos:openapi`)

## Servicios

Índice generado por servicio (endpoints, modelos, eventos consumidos):
`servicios/<servicio>/_indice.md` para caja, cuentas, identidad, inventario, mesas,
notificaciones, pedidos, reportes y reservas.

## Decisiones (ADR)

[decisiones/](decisiones/) — ADR-001..011: database-per-service, outbox, proyecciones,
decremento atómico, slot único de reservas, reposición delta, ack/nack, DLQ,
contratos front/back, granularidad anti-doble-booking, alcance compras.

## Eventos, flujos e invariantes

- [Catálogo de eventos](eventos/_catalogo.md) (productores y consumidores con file:line)
- [Flujos de extremo a extremo](flujos/)
- [Invariantes](invariantes/_indice.md)

## Operación

- [Runbooks por servicio](operacion/runbooks/)
- Procedimientos: [levantar sistema](operacion/levantar-sistema.md), [backups](operacion/backups.md),
  [secrets](operacion/secrets.md), [RabbitMQ](operacion/rabbitmq.md),
  [JWT RS256](operacion/jwt-rs256.md), [métricas](operacion/telemetry-metrics.md)
