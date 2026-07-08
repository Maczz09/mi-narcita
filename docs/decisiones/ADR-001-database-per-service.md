---
tipo: adr
id: ADR-001
estado: aceptada
fecha: 2026-05-30
fuente: [infra/docker-compose.yml:21, package.json:63]
---

# ADR-001 - Database-per-Service

**Contexto.** Nueve microservicios comparten dominio (restobar) pero tienen ciclos de
vida, esquemas y cargas distintas. Una base compartida acoplaria los esquemas: una
migracion de pedidos podria romper a caja, y un pico de reportes degradaria la venta.
[infra/docker-compose.yml:21]

**Decision.** Cada servicio es dueño exclusivo de su base Postgres (9 instancias en
docker-compose, una por servicio, cada una con su `schema.prisma` y migraciones
propias). Ningun servicio consulta la base de otro: los datos ajenos llegan por eventos
(ADR-003) o por HTTP con circuit breaker. [infra/docker-compose.yml:21, package.json:63]

**Alternativas descartadas.**
- *Base unica con esquemas separados*: menos contenedores, pero mantiene el acoplamiento
  de despliegue y el single point of failure; una migracion bloqueante afecta a todos.
- *Base unica con tablas compartidas*: rompe la autonomia de despliegue y permite joins
  entre dominios que fosilizan el esquema.

**Consecuencias.**
- No hay transacciones distribuidas: la consistencia entre servicios es eventual y se
  garantiza con outbox (ADR-002) + idempotencia de consumidores.
- Cada servicio duplica como proyeccion local los datos ajenos que necesita leer
  (ADR-003), aceptando lag de milisegundos.
- El drift check de CI (`scripts/check-migration-drift.sh`) valida esquema↔migraciones
  por cada una de las 9 bases.

**Atomos afectados.** Ver indices de [servicios](../README.md), [eventos](../eventos/_catalogo.md) e [invariantes](../invariantes/_indice.md).
