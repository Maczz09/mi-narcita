# Carga distribuida multi-nodo (k6) — NachoPps

Guía para correr carga desde varios nodos a la vez contra el mismo stack, con
métricas consolidadas en Prometheus. El wrapper por nodo es
[`k6/run-node.sh`](k6/run-node.sh).

## Wrapper por nodo

Cada nodo ejecuta el mismo escenario del sistema, etiquetado con su `NODE_ID`.
Por defecto corre en `LEVEL=CONTINUO` (tráfico sostenido a tasa baja, sin fin
programado salvo `K6_DURATION` — pensado para observar dashboards/trazas en
tiempo real, no para medir capacidad; usa `LEVEL=L2`/`L3` para eso):

```sh
NODE_ID=1 BASE_URL=http://localhost:8000 bash stress-tests/k6/run-node.sh
# tasa/duración del tráfico continuo (defaults: K6_RATE=20, K6_DURATION=15m)
NODE_ID=1 BASE_URL=http://localhost:8000 K6_RATE=30 K6_DURATION=1h bash stress-tests/k6/run-node.sh
```

Para consolidar las series de todos los nodos en el Prometheus del stack
(remote-write), añade `K6_PROMETHEUS_RW_SERVER_URL`:

```sh
NODE_ID=2 BASE_URL=http://localhost:8000 \
  K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  bash stress-tests/k6/run-node.sh
```

Todas las series quedan diferenciadas por el label `node="<id>"`, así que las
métricas de k6 (latencia, RPS, errores) se pueden desglosar por nodo o agregar.

## Presupuesto de rate-limit: un login por nodo

`POST /auth/login` está limitado a **5 intentos/min por IP** en Kong
(`infra/kong/kong.yml.template`, ruta `identidad-login`). Por eso **cada nodo se
autentica UNA vez** y reutiliza el token durante toda la corrida (el escenario
del sistema ya lo hace). Si N nodos comparten una misma IP saliente (NAT), su
presupuesto de login es compartido: escalona los arranques o usa IPs distintas.

## Roles durante el caos

El operador conduce el caos manualmente mientras los nodos sostienen la carga:

| Nodo | Rol | Qué demuestra |
|------|-----|---------------|
| **1** | Sostiene el **flujo completo** (mesa→pedido→cuenta→pago) | El camino de dinero sobrevive al corte: pago 201 degradado y recuperación automática |
| **2** | **Lecturas** sobre servicios no relacionados (mesas/reportes/reservas) | **No-cascada**: los independientes no devuelven 5xx mientras una dependencia está caída |
| **operador** | Ejecuta `docker stop`/`docker start` (o `docker kill`) del servicio bajo prueba | Introduce y retira la falla; observa la recuperación en Grafana/Prometheus |

Los scripts de caos automatizados ([`run-chaos-mid-flow.js`](run-chaos-mid-flow.js),
[`run-chaos-db-down.js`](run-chaos-db-down.js)) reproducen esto de forma
autónoma; la orquestación multi-nodo es para carga sostenida en paralelo.

## Aclaración conceptual: multi-nodo NO "esquiva" el circuit breaker

Un error común es creer que repartir la carga entre varias IPs evita que se
abra el circuit breaker. **No es así**:

- El **circuit breaker vive DENTRO de cada servicio** (opossum, estado por
  dependencia en `libs/resiliencia`). Su estado es global al proceso del
  servicio, no por-IP del cliente: si la dependencia se cae, el breaker abre
  para **todos** los clientes por igual, vengan de una IP o de diez.
- Lo que **sí** es por-IP es el **rate limit de Kong en `/auth/login`** (5/min).
  Repartir logins entre IPs solo cambia el presupuesto de autenticación, nunca
  el comportamiento del breaker.

En resumen: multi-nodo aumenta la carga real y consolida su medición; no altera
las garantías de resiliencia internas.

## Métricas a observar (Prometheus/Grafana)

Ver también [`k6/README.md`](k6/README.md#grafanaprometheus-durante-la-carga).
Durante la corrida distribuida, además de las series de k6 por `node`:

- `circuit_breaker_state` (0 cerrado / 1 abierto) — debe volver a 0 tras el caos.
- `outbox_pending_total`, `outbox_publish_lag_seconds` — backlog de eventos.
- `dlq_messages_total`, `rabbitmq_queue_messages{queue=~"dlq\\..*"}` — sin crecer.
- `kong_http_requests_total{code=~"429|502|503"}` — 429 del login, 502/503 del
  fail-fast del gateway (T-07).
