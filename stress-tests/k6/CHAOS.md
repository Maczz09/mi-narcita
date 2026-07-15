# Matriz de caos — Fase 4

Complementa `stress-tests/k6/README.md` (carga) y `docs/auditoria-carga.md`
(auditoría). "Dar de baja" = `docker compose stop nachopps-servicio-X`: cada uno
de los 9 servicios es su propio contenedor, no hay killSwitch que implementar.

## Requisitos

Igual que la suite k6: stack levantado, rate-limit de Kong subido. **No** hace
falta subir `JWT_EXPIRES_IN` para los experimentos individuales (20-30 s), sí
para el compuesto "bajo carga" si se alarga.

## 4.1 — Experimentos individuales (uno por servicio)

```powershell
node stress-tests/run-chaos-suite.js --skip-compound      # los 9, sin los 3 compuestos
node stress-tests/run-chaos-db-down.js --db mesas          # uno suelto
```

| Servicio caído | Nivel de carga al que se tumba | Servicios dependientes afectados | Comportamiento ESPERADO | Comportamiento PROHIBIDO |
|---|---|---|---|---|
| identidad | Cualquiera con `auth/me`/login activo (JWT cache de Kong amortigua lecturas ~60s) | Todos (JWT-cache de Kong sigue validando tokens ya cacheados; login nuevo falla) | Tokens ya emitidos siguen validando vía `jwt-cache`; nuevas request de login fallan rápido con 5xx | Que el resto de servicios devuelva 5xx por depender de identidad en caliente (no deberían — validan JWT local) |
| mesas | Escritura de pedidos que consulta mesa (bulkhead pedidos→mesas) | pedidos (bulkhead 503 tras timeout 2.5s) | `bulkhead_rejected_total{dependency="mesas"}` sube; pedidos responde 503 rápido, no cuelga | pedidos colgado >8s por request, o crash |
| **pedidos** | Cualquiera con escritura de pedidos | cuentas, inventario, caja (consumidores de eventos), mesas (bulkhead inverso) | Consumidores dejan de recibir `pedido.*` nuevo; su HTTP propio sigue vivo | 5xx en cuentas/inventario/caja/mesas por la caída de pedidos |
| cuentas | Pagos/cierre de cuenta desde caja (bulkhead caja→cuentas) | caja (bulkhead 503), reportes (consumidor de `cuenta.cerrada`) | `bulkhead_rejected_total{dependency="cuentas"}` sube en caja | caja colgado, reportes crasheando |
| reservas | Creación de reservas | notificaciones (consumidor `reserva.*`) | notificaciones sin eventos nuevos, resto ileso | cualquier 5xx fuera de reservas |
| inventario | Validación de stock al crear pedido (bulkhead pedidos→inventario) | pedidos (bulkhead 503) | Igual patrón que mesas | pedidos colgado o cascada a cuentas/caja |
| notificaciones | — (consumidor puro, nadie depende de él por HTTP) | ninguno | Cola `notificaciones_queue` crece, resto del sistema ileso | cualquier servicio afectado |
| caja | Registro de pagos | reportes (indirecto, vía `cuenta.cerrada` que dispara cuentas, no caja) | Solo caja afectado | cuentas/reportes con 5xx |
| reportes | Consultas de dashboard | ninguno (solo consumidor de `cuenta.cerrada`, nadie llama a reportes) | Cero impacto fuera de reportes | cualquier servicio afectado |

Verificación automatizada por experimento (`run-chaos-db-down.js`, reutilizado
para "servicio caído" vía su BD — apagar la BD es equivalente observable a
apagar el servicio para efectos de disponibilidad de sus datos, y además
ejercita B-1 directamente):
1. El contenedor no crashea ni se reinicia.
2. Falla RÁPIDO (<8s), no se cuelga — valida `connectionTimeoutMillis` (B-1).
3. Servicios sin relación directa no devuelven 5xx.
4. Al reanudar: reconecta solo, sin restart de contenedor.
5. Outbox/DLQ recuperan baseline (`verify-postload.js`).

## 4.2 — Tres experimentos compuestos

### 1. RabbitMQ entero caído, bajo carga real
```powershell
node stress-tests/run-chaos-rabbitmq-bajo-carga.js --vus 200 --load-duration 90s
```
Reutiliza `run-rabbitmq-chaos.js` (ya verificado en runtime) pero con tráfico
k6 de fondo (escenario `mesas`) durante toda la ventana de caída — la única
forma de saber si la caída del broker + carga concurrente satura el pool de
conexiones de forma que no aparece en frío.
- **Duración:** ~2 min (8s calentamiento + kill + 8s + start + hasta 60s
  esperando consumidores + mutación final).
- **Prometheus a observar:** `rabbitmq_up` (cae a 0), `broker_consumer_lag_seconds`
  (salta al reanudar), `dlq_messages_total` (no debe crecer si el timeout de
  8s no agota los 3 reintentos del interceptor).
- **Pass/fail:** exit code del script (9 verificaciones, ver reporte `.md`).

### 2. Una base de datos individual caída (inventario — mayor contención)
```powershell
node stress-tests/run-chaos-db-down.js --db inventario --duration 30
```
- **Duración:** ~30s de caída + hasta 120s de recuperación observada.
- **Prometheus:** `pg_pool_waiting_count{service="servicio-inventario"}` (sube
  durante la caída, cae a 0 al reconectar), `outbox_pending_total{service="servicio-inventario"}`.
- **Pass/fail:** 8 verificaciones (falla rápido, sin crash, sin cascada, reconecta solo, outbox drena).

### 3. Dos servicios a la vez (pedidos + inventario)
```powershell
node stress-tests/run-chaos-double-service-down.js --duration 30
```
- **Duración:** ~30s de caída + hasta 80s de recuperación observada.
- **Prometheus:** `up{job="nestjs-microservices"}` (2 targets down),
  `rabbitmq_queue_messages{queue="pedidos_queue"}` (crece si otros productores
  siguen publicando `mesa.creada`/`stock.insuficiente` hacia pedidos).
- **Pass/fail:** 10 verificaciones (independientes ilesos, dependientes sin 5xx propio, ambos reconectan solos, sin pérdida).

## 4.3 — Guion reproducible (resumen)

| Experimento | Comando exacto | Duración total | Queries clave |
|---|---|---|---|
| Individual ×9 | `node stress-tests/run-chaos-suite.js --skip-compound` | ~5-8 min (9 × ~35s) | `up`, `pg_pool_waiting_count`, `outbox_pending_total` |
| RabbitMQ bajo carga | `node stress-tests/run-chaos-rabbitmq-bajo-carga.js` | ~2 min | `rabbitmq_up`, `broker_consumer_lag_seconds`, `dlq_messages_total` |
| BD individual (inventario) | `node stress-tests/run-chaos-db-down.js --db inventario --duration 30` | ~2.5 min | `pg_pool_waiting_count`, `outbox_pending_total` |
| Doble servicio | `node stress-tests/run-chaos-double-service-down.js --duration 30` | ~1.5 min | `up`, `rabbitmq_queue_messages{queue="pedidos_queue"}` |
| **Todo junto** | `node stress-tests/run-chaos-suite.js` | ~12-15 min | — |

## 4.4 — Verificación de recuperación (N minutos por servicio)

Todos los scripts llaman a `verify-postload.js` al final con un timeout
explícito como criterio de "vuelve a línea base":

| Servicio | N (minutos) | Por qué |
|---|---|---|
| pedidos, cuentas, caja, mesas, inventario, identidad, reservas (productores) | 2 min (120s) | outbox drena a ~`OUTBOX_BATCH_SIZE`/s (default 50 ev/s); backlog de una caída de 20-30s se vacía en segundos, el margen cubre reconexión de pg.Pool |
| RabbitMQ (compuesto 1) | 2 min | reconexión de `amqp-connection-manager` (automática) + drenado de colas represadas durante el kill |
| Doble servicio (compuesto 3) | 3 min (180s) | dos productores reconectando + posible backlog cruzado en `pedidos_queue` |

Si `verify-postload.js` no cierra en el timeout, el experimento se marca ❌ y
el detalle indica cuántos eventos seguían pendientes — ver el reporte `.md`
correspondiente en `stress-tests/reports/`.
