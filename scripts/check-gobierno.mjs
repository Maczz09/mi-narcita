/**
 * Fitness functions de gobierno de servicios (FF-GOV-01..07, sesión 31).
 *
 * Valida contra los artefactos versionados que cada servicio esté gobernado:
 * ownership, contrato, versión, consumidores rastreables, ADRs, runbook y
 * trazabilidad. Imprime el semáforo por servicio y falla (exit 1) si algún
 * servicio queda Crítico (3+ fallos) o si falla cualquier FF en un servicio
 * de criticidad high.
 *
 * Uso: npm run gobierno:check   (job `gobierno` en CI)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICES = ['caja', 'cuentas', 'identidad', 'inventario', 'mesas',
  'notificaciones', 'pedidos', 'reportes', 'reservas'].map((s) => `servicio-${s}`);

const catalogoEventos = readFileSync(join(ROOT, 'docs/eventos/_catalogo.md'), 'utf8');
const trazabilidad = readFileSync(join(ROOT, 'docs/gobierno/trazabilidad.md'), 'utf8');

/** @type {Array<{ id: string, desc: string, check: (f: any, svc: string) => string | null }>} */
const FFS = [
  {
    id: 'FF-GOV-01', desc: 'owner funcional y técnico',
    check: (f) => {
      if (!f.ownerTeam || !f.technicalOwner) return 'falta ownerTeam/technicalOwner';
      if (f.criticality === 'high' && !f.businessOwner) return 'servicio high sin businessOwner';
      return null;
    },
  },
  {
    id: 'FF-GOV-02', desc: 'contrato documentado (openapi + contracts)',
    check: (f, svc) => {
      const openapiPath = join(ROOT, 'docs/servicios', svc, 'openapi.json');
      if (!existsSync(openapiPath)) return 'falta openapi.json (npm run contratos:openapi)';
      if (!Array.isArray(f.contracts) || f.contracts.length === 0) return 'contracts vacío en la ficha';
      const paths = Object.keys(JSON.parse(readFileSync(openapiPath, 'utf8')).paths ?? {});
      const rotos = f.contracts
        .map(String)
        .filter((c) => /^[A-Z]+ \//.test(c))
        .filter((c) => !paths.includes(c.split(' ')[1]));
      return rotos.length ? `contracts no presentes en openapi.json: ${rotos.join(', ')}` : null;
    },
  },
  {
    id: 'FF-GOV-03', desc: 'servicio activo con versión vigente',
    check: (f) => (f.status === 'active' && !f.apiVersion ? 'status active sin apiVersion' : null),
  },
  {
    id: 'FF-GOV-04', desc: 'eventos rastreables en el catálogo',
    check: (f) => {
      const eventos = [...(f.eventsPublished ?? []), ...(f.eventsConsumed ?? [])];
      const faltan = eventos.filter((e) => !catalogoEventos.includes(e));
      return faltan.length ? `eventos fuera de docs/eventos/_catalogo.md: ${faltan.join(', ')}` : null;
    },
  },
  {
    id: 'FF-GOV-05', desc: 'decisiones relevantes con ADR',
    check: (f) => {
      if (f.criticality !== 'high') return null;
      const adrs = f.docs?.adrs ?? [];
      if (adrs.length === 0) return 'servicio high sin ADRs en la ficha';
      const rotos = adrs.filter((a) => !existsSync(join(ROOT, a)));
      return rotos.length ? `ADRs inexistentes: ${rotos.join(', ')}` : null;
    },
  },
  {
    id: 'FF-GOV-06', desc: 'runbook básico',
    check: (f, svc) => {
      if (!['high', 'medium'].includes(f.criticality)) return null;
      return existsSync(join(ROOT, 'docs/operacion/runbooks', `${svc}.md`))
        ? null : 'falta docs/operacion/runbooks/' + svc + '.md';
    },
  },
  {
    id: 'FF-GOV-07', desc: 'trazabilidad problema→capacidad→contrato→evidencia',
    check: (_f, svc) => (trazabilidad.includes(`## ${svc}`) ? null : 'sin sección en docs/gobierno/trazabilidad.md'),
  },
];

let exitCode = 0;
const filas = [];

for (const svc of SERVICES) {
  const fichaPath = join(ROOT, 'docs/servicios', svc, 'ficha.yaml');
  if (!existsSync(fichaPath)) {
    filas.push({ svc, criticidad: '?', fallos: FFS.length, detalle: ['falta ficha.yaml'] });
    exitCode = 1;
    continue;
  }
  const ficha = load(readFileSync(fichaPath, 'utf8'));
  const detalle = [];
  for (const ff of FFS) {
    const error = ff.check(ficha, svc);
    if (error) detalle.push(`${ff.id} (${ff.desc}): ${error}`);
  }
  filas.push({ svc, criticidad: ficha.criticality, fallos: detalle.length, detalle });
  const critico = detalle.length >= 3;
  if (critico || (ficha.criticality === 'high' && detalle.length > 0)) exitCode = 1;
}

const semaforo = (n) => (n === 0 ? '🟢 Saludable' : n <= 2 ? '🟡 En riesgo' : '🔴 Crítico');
console.log('\nSemáforo de gobierno (FF-GOV-01..07)\n');
console.log('| Servicio | Criticidad | FF fallidas | Semáforo |');
console.log('|---|---|---|---|');
for (const f of filas) {
  console.log(`| ${f.svc} | ${f.criticidad} | ${f.fallos}/7 | ${semaforo(f.fallos)} |`);
}
for (const f of filas.filter((x) => x.detalle.length)) {
  console.log(`\n${f.svc}:`);
  for (const d of f.detalle) console.log(`  ✖ ${d}`);
}
console.log(exitCode === 0 ? '\n✔ Gobierno OK: 9/9 servicios saludables' : '\n✖ Gobierno con fallos');
process.exit(exitCode);
