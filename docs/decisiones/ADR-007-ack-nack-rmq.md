---
tipo: adr
id: ADR-007
estado: aceptada
fecha: 2026-05-30
fuente: [libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts:36, libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts:49]
---

# ADR-007 - ACK/NACK manual RMQ

**Contexto.** Con auto-ack, RabbitMQ da por procesado un mensaje al entregarlo: si el
handler lanza una excepcion (bug, base caida, payload invalido), el evento se pierde y
la proyeccion local queda desincronizada para siempre. Los consumidores de los 9
servicios procesan eventos que mueven dinero y stock; perder mensajes no es aceptable.
[libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts:36]

**Decision.** Todas las colas se consumen con `noAck: false` (bootstrap compartido) y el
`RabbitMQRetryInterceptor` centraliza el ciclo: **ack** solo cuando el handler completa
sin error; ante error, reintento con backoff exponencial (3 reintentos: 1s, 2s, 4s) y,
agotados, **nack sin requeue** que enruta el mensaje a la DLQ del servicio via DLX
(ADR-008). El interceptor ademas expone metricas (`dlq_messages_total`,
`broker_consumer_lag_seconds`) y propaga el contexto de OpenTelemetry.
[libs/resiliencia/src/lib/rabbitmq-retry.interceptor.ts:49]

**Alternativas descartadas.**
- *Auto-ack*: pierde mensajes ante cualquier excepcion del handler.
- *Nack con requeue*: un mensaje venenoso (siempre falla) entra en bucle infinito
  ocupando el consumidor; el requeue solo tiene sentido con limite, que es exactamente
  lo que implementa el retry con backoff + DLQ.
- *Retry en cada handler*: 30+ handlers duplicarian la misma logica; el interceptor la
  aplica uniforme a todo `@EventPattern`.

**Consecuencias.**
- Garantia at-least-once de punta a punta (outbox publica, consumidor no pierde): el
  precio es que puede haber duplicados, absorbidos por la idempotencia
  ([idempotencia-directa](../invariantes/idempotencia-directa.md)).
- Un fallo transitorio (base caida 2s) se recupera solo via backoff, sin intervencion.
- Los mensajes que agotan reintentos quedan auditables en la DLQ
  ([colas-limpias-happy-path](../invariantes/colas-limpias-happy-path.md) verifica que
  en happy path las DLQ quedan vacias).

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
