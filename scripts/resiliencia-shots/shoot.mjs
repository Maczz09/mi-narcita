// Harness de capturas para el informe de resiliencia.
// Loguea en la PWA, navega a un módulo, registra la red real (status codes) y
// los errores de consola, y guarda una captura PNG + un JSON de evidencia.
//
// Uso:
//   node shoot.mjs <outBase> <navLabel|-> [postClickLabel|-] [waitMs]
//   outBase       ruta sin extensión (crea outBase.png y outBase.net.json)
//   navLabel      texto del botón de navegación (Mesas, Pedidos, Caja, ...) o '-' para quedarse en Inicio
//   postClickLabel  botón a clickear dentro del módulo (o '-')
//   waitMs        espera extra tras navegar (default 3500)
//
// Requiere el stack arriba (PWA :4200 -> Kong :8000).
import { chromium } from 'playwright';

// Con Kong caído, fetches abortados de la PWA rechazan en background; Node v22
// abortaría el proceso. Los tragamos para que la captura siempre se complete.
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

const [, , outBase, navLabelRaw = '-', postClickRaw = '-', waitMsRaw = '3500'] = process.argv;
if (!outBase) {
  console.error('falta outBase');
  process.exit(2);
}
const navLabel = navLabelRaw === '-' ? null : navLabelRaw;
const postClick = postClickRaw === '-' ? null : postClickRaw;
const waitMs = Number(waitMsRaw) || 3500;

const BASE = process.env.PWA_URL ?? 'http://localhost:4200';
const EMAIL = process.env.PWA_EMAIL ?? 'admin@nachopps.pe';
const PASSWORD = process.env.PWA_PASSWORD ?? 'nachopps123';

const net = [];       // { method, url, status, ok } por respuesta a la API
const consoleErrors = [];

const LOAD_STATE = process.env.LOAD_STATE || null;   // carga cookies de sesión y salta login
const SAVE_STATE = process.env.SAVE_STATE || null;   // guarda cookies tras login

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  ...(LOAD_STATE ? { storageState: LOAD_STATE } : {}),
});
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('response', (r) => {
  const u = r.url();
  if (u.includes(':8000') || u.includes('/v1/') || u.includes('/api/')) {
    net.push({ method: r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status() });
  }
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.includes(':8000') || u.includes('/v1/') || u.includes('/api/')) {
    net.push({ method: r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, ''), status: 0, failure: r.failure()?.errorText });
  }
});

async function login() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('tu@nachopps.pe').fill(EMAIL);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }).catch(() => null),
    page.getByRole('button', { name: 'Ingresar' }).click(),
  ]);
  // esperar el shell (aparece el botón Inicio) o quedarse en login si identidad cayó
  await page.getByRole('button', { name: 'Inicio' }).waitFor({ timeout: 12000 }).catch(() => null);
}

const loginNet = [];
if (LOAD_STATE) {
  // sesión ya autenticada (cookies cargadas): solo entra a la app, sin login
  await page.goto(BASE + '/app/inicio', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Inicio' }).waitFor({ timeout: 12000 }).catch(() => null);
  await page.waitForTimeout(1500);
} else {
  try {
    await login();
  } catch (e) {
    consoleErrors.push('login-throw: ' + e.message);
  }
  if (SAVE_STATE) await ctx.storageState({ path: SAVE_STATE });
}
// separa la evidencia de login de la del módulo
loginNet.push(...net.splice(0));

let bodyText = '';
try {
  if (navLabel) {
    await page.getByRole('button', { name: navLabel }).click().catch((e) => consoleErrors.push('nav-throw: ' + e.message));
    await page.waitForTimeout(waitMs);
  }
  if (postClick) {
    await page.getByRole('button', { name: postClick }).first().click().catch((e) => consoleErrors.push('postclick-throw: ' + e.message));
    await page.waitForTimeout(waitMs);
  }
  if (!navLabel && !postClick) await page.waitForTimeout(waitMs);
  bodyText = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
} catch (e) {
  consoleErrors.push('capture-throw: ' + e.message);
}

const fs = await import('fs');
try { await page.screenshot({ path: outBase + '.png' }); } catch (e) { consoleErrors.push('shot-throw: ' + e.message); }
fs.writeFileSync(
  outBase + '.net.json',
  JSON.stringify({ outBase, navLabel, postClick, loginNet, moduleNet: net, consoleErrors, bodyText }, null, 2),
);
console.log(JSON.stringify({ png: outBase + '.png', moduleReqs: net.length, errs: consoleErrors.length }, null, 0));

await browser.close();
