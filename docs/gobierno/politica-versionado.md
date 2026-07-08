---
tipo: gobierno
tema: versionado
revisado: 2026-07-07
---

# Política de versionado de contratos

Aplica a los contratos públicos de los 9 microservicios: APIs HTTP expuestas vía Kong
(prefijo `/v1`, alias retrocompatible) y eventos AMQP definidos en
`libs/contracts/src/events/routing-keys.ts`. El objetivo es evolucionar sin romper
consumidores: cada cambio se clasifica ANTES de implementarse.

## Clasificación de cambios

| Cambio | Tipo | Acción |
|---|---|---|
| Agregar campo opcional en response o payload de evento | Compatible | Documentar en CHANGELOG, mantener versión |
| Agregar endpoint o evento nuevo | Compatible | Documentar, registrar en catálogo de eventos y ficha |
| Ampliar enum aceptado en request (acepta más valores) | Compatible | Documentar |
| Renombrar campo | Breaking | Nueva versión o plan de migración |
| Eliminar campo usado por consumidores | Breaking | Deprecación + plan de migración con fecha |
| Cambiar tipo de dato de un campo | Breaking | Nueva versión |
| Agregar campo obligatorio en request | Breaking (si consumidores actuales no lo envían) | Nueva versión o validación transitoria (aceptar ambos) |
| Cambiar semántica de un evento sin cambiar schema | Breaking | Tratar como breaking: nueva versión del evento |

## Proceso ante un cambio de contrato

1. **Evaluar**: ¿impacta el contrato (request/response/schema de evento) o su semántica?
   Si no, es cambio interno y no requiere este proceso.
2. **Clasificar**: compatible o breaking según la tabla anterior.
3. **Notificar**: identificar consumidores afectados en
   [docs/eventos/_catalogo.md](../eventos/_catalogo.md) (eventos, con file:line) y en la
   matriz de [ownership](ownership.md) (APIs HTTP). **Regla: ningún breaking change se
   aprueba sin la lista de consumidores afectados.**
4. **Versionar**: si es breaking, crear versión nueva (evento `nombre.v2` en routing keys;
   API `/v2` en Kong) y mantener la anterior durante la ventana de migración.
5. **Deprecar**: marcar la versión anterior como `deprecated` en la ficha del servicio,
   fijar fecha de retiro y registrar la migración en el CHANGELOG.

## Convenciones vigentes en el repo

- **Eventos**: los routing keys (`pedido.creado`, `pago.registrado`, …) son la versión v1
  implícita de cada evento. Un breaking en el payload exige routing key nuevo con sufijo
  de versión explícito (p. ej. `pago.registrado.v2`); los tipos viven en
  `libs/contracts/src/domains/*.ts` y los contract tests
  (`libs/contracts/src/contract-tests.spec.ts`) fallan si un handler diverge del tipo.
- **APIs HTTP**: el gateway Kong publica `/v1` con alias retrocompatible; `apiVersion` se
  declara en la `ficha.yaml` de cada servicio.
- **Releases**: `CHANGELOG.md` central (Keep a Changelog + SemVer + Conventional Commits)
  registra qué cambió y a quién afecta; los breaking se anotan con la acción requerida
  del consumidor.
- **Compatibilidad temporal**: precedente en `docs/planeamiento/T-48b-pago-registrado-pedido-ids.md`
  (evento `pago.registrado` amplió payload manteniendo compatibilidad con mensajes sin
  `pedidoIds`) — ese es el patrón esperado para cambios que puedan llegar de mensajes
  antiguos encolados.

## Deprecación y retiro

Un contrato `deprecated` se mantiene funcionando durante la ventana de migración
(mínimo: un release). El retiro (`retired`) exige: consumidores migrados verificados en
el catálogo de eventos, entrada en CHANGELOG y actualización de la ficha del servicio.
