---
tipo: adr
id: ADR-009
estado: aceptada
fecha: 2026-06-10
fuente: [libs/contracts/src/index.ts:1]
---

# ADR-009: Contratos front/back desde `@org/contracts`

## Estado

Aceptada.

## Contexto

La PWA mantenia DTOs locales basados en los contratos del backend. Esa duplicacion ya produjo drift, como el caso de `MesaDto.numero` numerico frente a la VM de presentacion.

## Decision

`@org/contracts` es la fuente unica para DTOs, comandos y eventos compartidos entre front y back. La PWA puede mantener tipos ViewModel propios, pero deben derivarse desde DTOs importados del paquete de contratos mediante mappers explicitos.

## Consecuencias

- `pwa-cliente` declara dependencia de workspace hacia `@org/contracts`.
- Los archivos `apps/pwa-cliente/src/types/*.types.ts` solo deben conservar VM o aliases de contratos.
- La identidad de negocio debe venir del backend. En particular, `PedidoItemDto.id` es obligatorio para respuestas de pedidos y no se genera en el cliente.
