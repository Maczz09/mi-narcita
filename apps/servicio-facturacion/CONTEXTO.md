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

## 0.1 Actualización — sesión 2026-08-13: Notas de crédito/débito, validadas contra SUNAT BETA real

Agregadas notas de crédito y débito electrónicas (`ubl.builder.ts` →
`construirXmlNotaCredito`/`construirXmlNotaDebito`, `NotasService`, rutas
`POST /comprobantes/:comprobanteId/nota-{credito,debito}`). Mismo patrón de
dos fases que boleta/factura (firma acá, `EnvioProcessor` la manda a SUNAT).

Numeración: 4 series independientes en `Empresa` (`serieNotaCreditoFactura`
FC01, `serieNotaCreditoBoleta` BC01, `serieNotaDebitoFactura` FD01,
`serieNotaDebitoBoleta` BD01) — SUNAT exige que la serie empiece con F o B
según el tipo de documento afectado, no es una sola numeración por tipo de nota.

**Bug real encontrado probando contra beta** (RUC 10417758432, nota FC01-2
contra la Factura F001-2 del 2026-08-12): `<cac:PaymentTerms>` con
`PaymentMeansID=Contado` — obligatorio en Invoice (sin él, error 3244) —
SUNAT lo RECHAZA en CreditNote/DebitNote con error 3246 ("El tipo de
transaccion... no cumple con el formato esperado"). Quitarlo del bloque
compartido de notas fue el fix; no aparece en ningún schema/tipo, solo se
detectó probando de verdad — mismo patrón que los 3 bugs de la sección 0.

Validado ACEPTADO contra beta real, ambos tipos:
- Nota de crédito FC01-2 (motivo 01, contra F001-2): `ResponseCode 0`, "ha sido aceptada".
- Nota de débito FD01-1 (motivo 01, contra F001-2): `ResponseCode 0`, "ha sido aceptada".

Scripts de prueba: `scripts/probar-beta-nota.ts` / `scripts/probar-beta-nota-debito.ts`
(mismo patrón que `probar-beta.ts` — no tocan DB, correlativo fijo que hay
que subir a mano antes de cada corrida, ver comentario en el propio archivo).

Frontend: botón "nota de crédito/débito" en `FacturacionScreen.tsx`, visible
solo sobre comprobantes `ACEPTADO` — selector de tipo, motivo (catálogo
09/10 SUNAT) y monto, con el ítem de la nota generado como una sola línea
(no hay desglose por ítem del comprobante original disponible — `Comprobante`
solo guarda subtotal/igv/total agregados, no un detalle de líneas).

## 0. Actualización — sesión 2026-08-12: Fase 1 validada contra SUNAT BETA real

El punto 5 de "Pendiente" de abajo ("cliente SOAP sin ejercitar contra el WSDL
real") **quedó resuelto y confirmado**: se generó, firmó y envió una Factura
de prueba (RUC 10417758432, "Salitral 1", serie F001-1) contra el ambiente
BETA real de SUNAT con certificado y usuario SOL reales, y **SUNAT respondió
`ResponseCode 0` — "La Factura numero F001-1, ha sido aceptada"**. Se usó
`apps/servicio-facturacion/scripts/probar-beta.ts` (bypasea DB/Nest, corre
suelto con `npx tsx`) — no se tocó la base de datos real ni el correlativo.

En el camino aparecieron 3 bugs reales que **no se iban a ver sin probar
contra SUNAT de verdad** (ninguno era detectable con schema/tipos/tests
unitarios solos):

1. **`soap.createClientAsync(url)` con la URL viva de SUNAT falla con 401**
   al resolver el import interno del WSDL (`billService?ns1.wsdl`) — el
   stack HTTP de `soap` (axios) lo dispara, pero la MISMA url responde 200
   con `curl` o con `https.get` nativo de Node (confirmado a mano, no es
   problema de red/credenciales). Fix: el WSDL se versiona localmente
   (`src/sunat/wsdl/{billService.wsdl,billService-ns1.wsdl,billService.xsd2.xsd}`,
   el `build` de `package.json` los copia a `dist/`) y `sunat-soap.client.ts`
   apunta ahí; el endpoint real de envío se sigue tomando de
   `SUNAT_WSDL_URL` (sin el `?wsdl`) vía `client.setEndpoint(...)`. El
   contrato SOAP es estático — no depende de beta vs. producción.
2. **`contentFile` (el zip) se mandaba como `Buffer` crudo** — `soap` no lo
   serializa como `xs:base64Binary`, lo serializaba byte a byte
   (`<0>80</0><1>75</1>...`). Fix: `zip.toString('base64')` antes de pasarlo
   a `sendBillAsync`/`sendSummaryAsync`.
3. **`ubl.builder.ts` armaba `AccountingSupplierParty` incompleto** — SUNAT
   rechazó dos veces con errores reales de negocio (no de schema):
   - Error 3030 "código de local anexo del emisor": la dirección del emisor
     NO va en `cac:PostalAddress` como yo asumía — va en
     `cac:PartyLegalEntity/cac:RegistrationAddress`, y el código de
     establecimiento es `cbc:AddressTypeCode` (NO `cbc:ID` — ese es el
     ubigeo). Confirmado contra un XML real generado por Greenter (gist de
     giansalex). `Empresa.codigoEstablecimiento` nuevo en el schema,
     default `'0000'` (matriz).
   - Error 3244 "tipo de transacción del comprobante": faltaba
     `cac:PaymentTerms` (`FormaPago`/`Contado`) — obligatorio siempre en
     este negocio porque no hay ventas al crédito. Se agregó fijo, sin
     condicionar a ningún dato (no existe concepto de crédito en el dominio).

Cobertura nueva en `ubl.builder.spec.ts` para los 3 campos que resultaron
obligatorios en la práctica (`AddressTypeCode`, `ubigeo` opcional,
`PaymentTerms`) — hasta ahora el spec solo cubría estructura genérica, no
estos campos puntuales que SUNAT sí valida.

**Sigue pendiente** (no tocado hoy): sembrar la fila `Empresa` real en la
DB, levantar `db-facturacion` y aplicar las 3 migraciones, rellenar
`apps/servicio-facturacion/.env` con las credenciales reales (hoy solo se
pasaron como env vars sueltas al script de prueba), y recién ahí probar el
flujo completo vía HTTP real (`POST /facturacion/comprobantes/:cuentaId/emitir`
a través de Kong) en vez del script suelto.

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

> **Actualización (2026-08-12):** el owner ya estaba bien (`Maczz09`); lo que
> cambió después fue el nombre del *package* — `nachoppssoa` era branding
> legado (el repo se llamaba así antes de "Mi Narcita"), sin relación con el
> owner. Ahora es `ghcr.io/Maczz09/mi-narcita` en los mismos 3 archivos +
> `docs/guia-despliegue-vps-contabo.md`.

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
5. ~~**Cliente SOAP** sin ejercitar contra el WSDL real~~ — **RESUELTO
   2026-08-12, ver sección 0**: probado contra beta real, SUNAT respondió
   ACEPTADA. 3 bugs reales encontrados y arreglados en el camino (WSDL 401,
   `contentFile` sin base64, `AccountingSupplierParty` incompleto).
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
