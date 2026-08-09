# Contexto de sesión — `servicio-facturacion` (boletas/facturas SUNAT)

Nota de traspaso, sesión Claude Code del 2026-08-08, para seguir trabajando
desde otra cuenta/sesión de Claude Code en este mismo repo.

## Contexto del proyecto

- Repo: `sistema-para-restaurantes` (github.com/Maczz09/sistema-para-restaurantes).
- Monorepo Nx, marca en código todavía **"NachoPps"** (no renombrado — ver
  "Dudas abiertas" al final).
- Dueño real: dos empresas, **La Barra del Ceviche 1** y **La Barra del
  Ceviche 2**, cada una con su propio RUC. Deben operar como emisores SUNAT
  independientes — nunca cruzar certificado ni numeración entre ambas.

## 1. Ya hecho y verificado esta sesión

### 1.1 CI/CD — cerrado, no requiere más trabajo

Causa raíz: `.github/workflows/deploy.yml` pusheaba a `ghcr.io/marcos7py/...`
(dueño original del fork); `Maczz09` no tiene permiso de escritura ahí.
Arreglado en 3 archivos (solo el owner, nada más):

| Archivo | Cambio |
|---|---|
| `.github/workflows/deploy.yml:10` | `ghcr.io/${{ github.repository_owner }}/nachoppssoa` |
| `.env.example` (raíz):9 | `ghcr.io/Maczz09/nachoppssoa` |
| `infra/docker-compose.prod.yml:430` | ídem (fallback de `${REGISTRY:-...}`) |

Verificado con `git diff --stat`: exactamente esos 3 archivos, 1 línea c/u.

### 1.2 `servicio-facturacion` — esqueleto completo, compila/lint/test en verde

Comandos corridos y resultado real (no supuesto):

```sh
npx prisma generate --schema=./apps/servicio-facturacion/prisma/schema.prisma  # OK
npx nx build servicio-facturacion   # OK, 0 errores tsc
npx nx lint servicio-facturacion    # OK
npx nx test servicio-facturacion    # 7/7 tests OK (igv.spec.ts, ubl.builder.spec.ts)
npx nx build servicio-cuentas servicio-caja servicio-reportes  # OK
# ↑ confirma que tocar libs/contracts no rompió los otros 9 servicios
npm install  # (root) regeneró package-lock.json con node-forge, xml-crypto, soap,
             # archiver + @types — sin esto `npm ci` rompe TODO el monorepo en
             # CI/Docker, no solo este servicio. Ya hecho, no repetir salvo que
             # agregues una dependencia nueva.
```

### Diseño (aclarado a mitad de sesión — importante para no revertirlo sin querer)

Existe un "comprobante de pago" **interno** (gestión, ticket UUID en
`apps/servicio-cuentas`, campo `Cuenta.ticket`) que es **distinto** del
comprobante SUNAT. `servicio-facturacion` **no emite automático** al cerrar
cuenta — solo guarda un read-model local (`ComprobantePago`, vía evento
`cuenta.cerrada`, mismo patrón que `VentaDiaria` en `servicio-reportes`).
Caja/admin eligen **después**, a mano, qué comprobante de pago sube como
boleta o factura y con qué RUC emisor:

```
GET  /facturacion/comprobantes-pago              → listado para elegir
POST /facturacion/comprobantes/:cuentaId/emitir
     body: { tipoComprobante: BOLETA|FACTURA, empresaRuc,
             clienteRuc?, clienteRazonSocial?, clienteDni?, clienteNombre? }
     → arma UBL, saca correlativo atómico, firma XMLDSig, guarda FIRMADO
```

`EnvioProcessor` (cron 30s, `src/sunat/envio.processor.ts`) envía a SUNAT lo
`FIRMADO` y publica el evento `comprobante.emitido` cuando llega el CDR de
aceptación (routing key nueva en `libs/contracts`).

**Trigger de emisión: `cuenta.cerrada`, no `pago.registrado`** — un pago puede
dividirse en varios `PagoRegistrado` (efectivo + tarjeta) para una misma
cuenta; `cuenta.cerrada` dispara una sola vez.

**Envío a SUNAT:** `sendBill` individual para ambos tipos por ahora (MVP). La
mejora natural para boletas de alto volumen es agrupar en `sendSummary`
(resumen diario) — documentado como pendiente en `envio.processor.ts`, no
implementado.

### Firma XMLDSig

Spec de SUNAT confirmada cruzando 2 fuentes de Greenter (la referencia de
facto en Perú) — **no** exclusive-c14n ni SHA-256, pese a que otra fuente
(llama.pe) lo sugería; esa fuente se descartó:

```
CanonicalizationMethod: http://www.w3.org/TR/2001/REC-xml-c14n-20010315
SignatureMethod:        http://www.w3.org/2000/09/xmldsig#rsa-sha1
DigestMethod:           http://www.w3.org/2000/09/xmldsig#sha1
```

Implementado en `src/sunat/firma.ts` con `xml-crypto` v6 (API actual:
`new SignedXml({ privateKey, publicCert, ... })`, `addReference` con
`isEmptyUri: true` — no la API vieja de `keyInfoProvider`).

### Archivos nuevos (27) bajo `apps/servicio-facturacion/`

```
package.json, tsconfig.{json,app.json,spec.json}, jest.config.ts, .env.example
prisma/schema.prisma        → Empresa, ComprobantePago, Comprobante, OutboxEvent,
                               IdempotencyKey (SIN migración generada, ver Pendientes)
src/main.ts
src/prisma/{prisma.module,prisma.service}.ts
src/app/{app.module,app.controller,app.service}.ts       → consumer cuenta.cerrada
src/app/{emision.controller,emision.service}.ts          → endpoint HTTP de emisión
src/app/dto/emitir-comprobante.dto.ts
src/sunat/certificado.ts (+ .service.ts)   → pfx→pem con node-forge
src/sunat/firma.ts                         → firma XMLDSig (ver arriba)
src/sunat/ubl.builder.ts (+ .spec.ts)      → arma el XML UBL 2.1 (boleta=03, factura=01)
src/sunat/igv.ts (+ .spec.ts)              → desglose IGV 18%, redondeo half-up
src/sunat/correlativo.service.ts           → UPDATE...RETURNING atómico por empresa+tipo
src/sunat/sunat-soap.client.ts             → cliente SOAP billService (sendBill/sendSummary/getStatus)
src/sunat/sunat-config.service.ts          → credenciales por slot (env directo o _FILE)
src/sunat/envio.processor.ts               → cron que envía FIRMADO→SUNAT
```

### Wiring de infraestructura ya editado (verificado con `git status --short`)

| Archivo | Cambio |
|---|---|
| `libs/contracts/src/events/routing-keys.ts` | + `ComprobanteEmitido: 'comprobante.emitido'` |
| `tsconfig.json` (raíz) | + referencia a `apps/servicio-facturacion` |
| `.github/workflows/ci.yml` | + `DATABASE_URL_SERVICIO_FACTURACION` + `prisma generate` |
| `.github/workflows/integration-docker.yml` | + `servicio-facturacion` al array de build |
| `.github/workflows/deploy.yml` | + matrix entry (push a GHCR) |
| `infra/docker-compose.yml` (dev) | + `db-facturacion` (5442) + `servicio-facturacion` (3011) |
| `infra/docker-compose.prod.yml` | ídem, `SUNAT_*` con `${VAR:-}` (no `:?` — no bloquea el deploy) |
| `infra/docker-compose.secrets.yml` | + 9 secrets (db + pfx×2 + pass×2 + sol_user×2 + sol_pass×2) |
| `infra/kong/kong.yml.template` | + ruta `/facturacion`, `/v1/facturacion` |
| `infra/secrets/README.md`, `.env.example` (raíz), `README.md` | documentados/actualizados |

> **Nota:** `libs/contracts/src/domains/cuentas.ts` se editó y se **revirtió**
> en la misma sesión (se había agregado `tipoComprobante`/`clienteRuc` al
> payload de `CuentaCerradaPayload` antes de la aclaración del diseño de
> arriba). El archivo quedó exactamente como estaba — `git status` no lo
> marca modificado. No hace falta tocar `servicio-cuentas` para nada de esto.

## 2. Pendiente / próximos pasos

1. **Certificados + SOL de ambas empresas** — el usuario dijo que aún los está
   tramitando. No bloquea nada: `SunatConfigService` detecta "no configurado"
   y el comprobante queda `FIRMADO` sin gastar intentos. Rellenar en
   `apps/servicio-facturacion/.env` cuando los tenga.
2. **Sembrar las 2 filas de `Empresa`** (RUC real, no está disponible):
   ```sh
   npx prisma studio --schema=./apps/servicio-facturacion/prisma/schema.prisma
   # o un script con prisma.empresa.create({ data: { slot: 1, ruc: '...', razonSocial: '...' } })
   ```
3. **Migración Prisma** — no generada (necesita Postgres vivo). Correr una vez:
   ```sh
   docker compose -f infra/docker-compose.yml --profile infra up -d
   cd apps/servicio-facturacion && npx prisma migrate dev --name init
   ```
4. **Pantalla en `apps/pwa-cliente`** — no existe todavía. El backend
   (`POST /facturacion/comprobantes/:cuentaId/emitir`) funciona pero hoy solo
   es invocable por API directa (curl/Postman) — falta el selector de
   comprobantes + botón "emitir boleta/factura" para que caja/admin lo usen
   sin tocar código.
5. **Cliente SOAP** (`sunat-soap.client.ts`) sin ejercitar contra el WSDL
   real — nombres de parámetro (`fileName`/`contentFile`/`ticket`) son
   "correctos por documentación", falta validar en beta con credenciales reales.
6. **`servicio-facturacion-e2e`** — no se creó (necesita el stack Docker
   levantado para tener sentido). Decisión consciente de alcance, no olvido.
7. **`sendSummary`** (resumen diario de boletas) documentado como mejora
   futura, no implementado — hoy usa `sendBill` individual para boleta y factura.

## Dudas abiertas (sin resolver con el usuario)

El código sigue con marca **"NachoPps"** en README/`.env.example`/nombres de
contenedor. Se interpretó que el rename ya lo hizo el usuario (repo/GitHub),
no que me lo pidiera a mí — quedó como pregunta abierta, no se tocó.

## Variables de entorno

Las variables reales del servicio están en `apps/servicio-facturacion/.env`
(gitignorado — no viaja con git). Ya rellenas: `PORT`, `DATABASE_URL`,
`SUNAT_WSDL_URL` (beta). Vacías a propósito (pendiente de trámite): las 8
`SUNAT_*_EMPRESA_<1|2>_*`.
