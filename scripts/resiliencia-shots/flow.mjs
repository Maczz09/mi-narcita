// Ejecuta flujos de negocio desde el contexto autenticado (cookie) de la PWA,
// que es el auth que valida de verdad. Sortea el problema del Bearer por Kong.
//
// Uso: node flow.mjs '<jsonPlan>'
//   jsonPlan = [{ "method":"POST", "path":"/v1/pedidos", "body":{...}, "label":"crear pedido" }, ...]
// Imprime, por paso: label, status, ms y un recorte del body. Los pasos comparten
// el estado (puedes capturar ids de una respuesta y usarlos en la siguiente vía {{prev.campo}}).
import { chromium } from 'playwright';

const plan = JSON.parse(process.argv[2] || '[]');
const BASE = process.env.PWA_URL ?? 'http://localhost:4200';
const EMAIL = process.env.PWA_EMAIL ?? 'admin@nachopps.pe';
const PASSWORD = process.env.PWA_PASSWORD ?? 'nachopps123';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder('tu@nachopps.pe').fill(EMAIL);
await page.getByPlaceholder('••••••••').fill(PASSWORD);
await page.getByRole('button', { name: 'Ingresar' }).click();
await page.getByRole('button', { name: 'Inicio' }).waitFor({ timeout: 12000 }).catch(() => null);

const results = [];
let prev = {};
for (const step of plan) {
  let body = step.body ? JSON.stringify(step.body) : undefined;
  if (body) body = body.replace(/\{\{prev\.([\w]+)\}\}/g, (_, k) => prev[k]);
  const r = await page.evaluate(async ({ base, method, path, body }) => {
    const csrf = (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('nachopps.csrf_token=')) || '').split('=')[1];
    const headers = { 'Content-Type': 'application/json' };
    if (csrf && method !== 'GET') { headers['X-CSRF-Token'] = decodeURIComponent(csrf); headers['Idempotency-Key'] = crypto.randomUUID(); }
    const t0 = performance.now();
    let status = 0, text = '';
    try {
      const res = await fetch(base + path, { method, credentials: 'include', headers, body });
      status = res.status; text = await res.text();
    } catch (e) { text = 'FETCH_ERR ' + e.message; }
    return { status, ms: Math.round(performance.now() - t0), text };
  }, { base: 'http://localhost:8000', method: step.method || 'GET', path: step.path, body });
  let parsed = null;
  try { parsed = JSON.parse(r.text); } catch { /* noop */ }
  if (parsed && typeof parsed === 'object') prev = { ...prev, ...parsed, ...(parsed.pedido || {}), ...(parsed.cuenta || {}), ...(parsed.mesa || {}) };
  results.push({ label: step.label || step.path, status: r.status, ms: r.ms, body: r.text.slice(0, 260) });
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
