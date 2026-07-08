---
tipo: gobierno
tema: checklist
revisado: 2026-07-07
---

# Checklist de gobierno por servicio

Las 8 preguntas del checklist estricto (sesión 31) aplicadas a los 9 servicios.
La versión automatizada corre en CI: `npm run gobierno:check`
([scripts/check-gobierno.mjs](../../scripts/check-gobierno.mjs), fitness functions
FF-GOV-01..07).

## Resultado (2026-07-07)

| Pregunta | caja | cuentas | identidad | inventario | mesas | notificaciones | pedidos | reportes | reservas |
|---|---|---|---|---|---|---|---|---|---|
| ¿Owner funcional y técnico? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿Contrato API/evento documentado? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿Versión vigente y política de cambios? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿Consumidores y dependencias identificados? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿ADR para decisiones relevantes? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿Runbook para incidente principal? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿Trazabilidad problema→capacidad→evidencia? | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ¿Changelog o notas de release? | ✅* | ✅* | ✅* | ✅* | ✅* | ✅* | ✅* | ✅* | ✅* |

**Semáforo: 🟢 Saludable (0 respuestas "No") en los 9 servicios.**

\* El changelog es **central** (`CHANGELOG.md` raíz, Keep a Changelog + SemVer +
Conventional Commits); no hay changelogs por servicio — simplificación deliberada,
el checklist acepta "changelog **o** notas de release" y cada ficha lo enlaza.

## Dónde vive cada evidencia

| Pregunta | Artefacto |
|---|---|
| Owners | [ficha.yaml](../servicios/servicio-caja/ficha.yaml) por servicio + [matriz de ownership](ownership.md) + `CODEOWNERS` |
| Contrato | `docs/servicios/<svc>/openapi.json` (generado: `npm run contratos:openapi`) + tipos en `libs/contracts` + contract tests |
| Versión y política | `apiVersion` en la ficha + [política de versionado](politica-versionado.md) |
| Consumidores/dependencias | [catálogo de eventos](../eventos/_catalogo.md) + `dependencies` de la ficha |
| ADRs | [docs/decisiones/](../decisiones/) (ADR-001..011) |
| Runbooks | [docs/operacion/runbooks/](../operacion/runbooks/) (9 servicios) |
| Trazabilidad | [trazabilidad.md](trazabilidad.md) |
| Changelog | [CHANGELOG.md](../../CHANGELOG.md) |
