# Suite k6 — pruebas de carga L1/L2/L3

Complementa (no reemplaza) los scripts Node de `stress-tests/run-*.js`.
Contexto y justificación de los niveles: `docs/auditoria-carga.md` (§4).

Para carga **distribuida multi-nodo** con métricas consolidadas en Prometheus,
ver [`../run-distributed.md`](../run-distributed.md) y el wrapper por nodo
[`run-node.sh`](run-node.sh).

## Requisitos

1. **k6**: `winget install k6` (o `choco install k6`).
2. **Stack levantado** con imágenes construidas: `docker compose --profile all up -d` (en `infra/`).
3. **Rate-limiting de Kong subido para la sesión de pruebas** (precondición A-1 —
   el default 3000/min es un cubo único de ~50 req/s para todo el sistema):

   ```powershell
   cd infra
   $env:KONG_RATE_LIMIT_MINUTE = '600000'
   $env:KONG_RATE_LIMIT_HOUR   = '36000000'
   docker compose --profile all up -d --force-recreate kong
   ```

   El runner lo comprueba en el preflight (lee `X-RateLimit-Limit-Minute`) y
   aborta con instrucciones si sigue bajo.
4. **JWT**: los escenarios hacen login una vez en `setup()`. Si la meseta
   calibrada deja L3 por encima de ~13 min de ejecución, sube `JWT_EXPIRES_IN`
   (p. ej. `60m`) en el compose para la sesión, o el token caducará a mitad de run.

## Uso

```powershell
node stress-tests/run-k6-suite.js --level L1                 # 1.000 VUs concurrentes reales
node stress-tests/run-k6-suite.js --level L2 --rate 1500     # 500.000 requests totales
node stress-tests/run-k6-suite.js --level L3 --rate 1500     # 1.000.000 requests totales
node stress-tests/run-k6-suite.js --level L1 --services pedidos,reportes
k6 run --env LEVEL=L1 stress-tests/k6/scenarios/pedidos.js   # un escenario suelto

# Tráfico continuo (observabilidad en tiempo real, no medición de capacidad):
k6 run --env LEVEL=CONTINUO --env K6_RATE=20 --env K6_DURATION=30m stress-tests/k6/scenarios/sistema.js
# o desde varios nodos a la vez (LEVEL=CONTINUO es el default): ver run-distributed.md
```

Resultados: `stress-tests/reports/k6-<nivel>-<servicio>-<ts>.json` (métricas por
escenario) + `k6-suite-<nivel>-<ts>.json` (pass/fail consolidado con post-carga).

## Calibrar la meseta (L2/L3) — hacerlo UNA vez antes de la entrega

`--rate` no es un número mágico: es el req/s de meseta que tu host sostiene.
Descúbrelo subiendo `--rate` en corridas cortas de L2 con un servicio de lectura
(p. ej. `--services mesas`) hasta que `errores_inesperados` o `dropped_iterations`
dejen de ser ~0; usa el último valor estable. Documenta el valor medido en el
informe final — ese número ES el resultado de capacidad del sistema.

## Qué hace cada escenario (Fase 3.2)

| Escenario | Lecturas | Escritura → outbox | Idempotencia bajo carga |
|---|---|---|---|
| identidad | `auth/me`, `usuarios` | — (login rate-limited por diseño) | — |
| mesas | `GET /mesas` | `POST /mesas` → `mesa.creada` | — |
| **pedidos** | `GET /pedidos` | `POST /pedidos` → saga + `pedido.creado` | ✅ clave compartida entre VUs → debe devolver SIEMPRE el mismo `pedido.id` |
| cuentas | `GET /cuentas`, `GET mesa/:id` | `POST /cuentas` → `cuenta.abierta` | — (gap B-6 documentado) |
| reservas | `GET /`, `disponibilidad` | `POST /reservas` → `reserva.creada` | — |
| inventario | `GET productos/categorias` | `POST productos` → `producto.creado` | dedupe por eventId en consumidor |
| notificaciones | `GET /notificaciones` | — (consumidor puro; su carga real entra por RabbitMQ) | — |
| caja | resumen de turno, `GET /caja` | `POST movimientos` | cubierta por pedidos + `run-stock-idempotency-dlq.js` |
| reportes | agregaciones (resumen, por-producto, por-turno) | — | — |

**503 en `POST /pedidos` es respuesta pactada**: shed-load deliberado del
bulkhead (10+10 hacia mesas/inventario). Se mide aparte en
`bulkhead_rejected_total`; eliminarlo subiendo el bulkhead falsearía la prueba.

## Thresholds (Fase 3.4)

Por defecto (en `levels.js`): `p(95)<2000`, `p(99)<5000`,
`errores_inesperados rate<0.01` (L1) / `<0.05` (L2/L3), `checks rate>0.99`.
Reportes relaja latencia (`p95<4000`) por ser agregaciones. Los checks de
negocio validan cuerpo (array/ids/campos), no solo el código HTTP.

## Verificación post-carga (Fase 3.6)

Tras cada escenario, el runner consulta Prometheus (`verify-postload.js`):

1. `sum(outbox_pending_total)` → 0 antes del timeout (default 300 s,
   `POSTLOAD_TIMEOUT_SEC`) — el outbox drena a ~50 ev/s por productor.
2. `sum(outbox_failed_total)` sin crecimiento vs baseline pre-carga.
3. `sum(dlq_messages_total)` sin crecimiento vs baseline.

1+2+3 = sin pérdida de mensajes (el outbox es at-least-once). También se puede
correr suelto: `node stress-tests/k6/verify-postload.js --timeout 300`.

## Grafana/Prometheus durante la carga

- Saturación de pool BD: `pg_pool_waiting_count` (nuevo, B-2)
- Event loop: `nodejs_eventloop_lag_seconds`
- Gateway: `kong_http_requests_total{code=~"429|502"}` (nuevo, A-3)
- Colas: `rabbitmq_queue_messages{queue=~"dlq\\..*|.*_queue"}` (nuevo, A-2)
- Backlog outbox: `outbox_pending_total`, `outbox_publish_lag_seconds`
- Shed-load: `bulkhead_rejected_total`, `circuit_breaker_state`
