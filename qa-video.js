/**
 * qa-video.js — Grabación E2E como usuario real
 * Navega login → inicio → mesas → pedidos → carta → caja → reservas
 * Genera un video .webm en ./qa-video/
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8000';
const VIDEO_DIR = path.join(__dirname, 'qa-video');
const EMAIL = 'admin@nachopps.pe';
const PASS  = 'nachopps123';

// Pausa visual entre acciones — para que el video sea legible
const pause = (ms) => new Promise(r => setTimeout(r, ms));

// Escribe en consola con timestamp
const log = (msg) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);

(async () => {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  log('Lanzando Chromium con grabación de video...');
  const browser = await chromium.launch({
    headless: true, // headless para no requerir display, el video igual se genera
    slowMo: 80,     // ralentiza cada acción 80ms → video más legible
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1280, height: 800 },
    },
    viewport: { width: 1280, height: 800 },
    locale: 'es-PE',
  });

  const page = await context.newPage();

  // ── Interceptar errores de red ──────────────────────────────────────
  const errors = [];
  page.on('pageerror', e => errors.push(`[JS ERROR] ${e.message}`));
  page.on('response', res => {
    if (res.status() >= 400
      && !res.url().includes('/auth/me')
      && !res.url().includes('/auth/refresh')) {
      errors.push(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  try {
    // ── 1. LOGIN ──────────────────────────────────────────────────────
    log('→ Pantalla de Login');
    await page.goto(`${BASE}/login`);
    await pause(1200);

    log('  Escribiendo credenciales...');
    await page.fill('input[type="email"]', EMAIL);
    await pause(400);
    await page.fill('input[type="password"]', PASS);
    await pause(600);

    log('  Haciendo click en "Ingresar"...');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app', { timeout: 10000 });
    await pause(2000);
    log('  ✓ Login exitoso — redirigido a /app');

    // ── 2. INICIO / DASHBOARD ─────────────────────────────────────────
    log('→ Pantalla Inicio (Dashboard)');
    await page.waitForSelector('h1', { timeout: 5000 });
    await pause(2500); // deja que carguen las stats

    // ── 3. MESAS ──────────────────────────────────────────────────────
    log('→ Pantalla Mesas');
    await page.goto(`${BASE}/app/mesas`);
    await pause(2500);

    // Intentar ver una mesa si hay alguna cargada
    const mesaCards = await page.$$('[class*="mesa"]');
    if (mesaCards.length > 0) {
      log(`  Haciendo click en primera mesa (${mesaCards.length} visibles)...`);
      await mesaCards[0].click().catch(() => {});
      await pause(1500);
      // cerrar modal si se abrió
      const closeBtn = page.locator('[aria-label="Cerrar"], button:has-text("Cerrar"), button:has-text("×")').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {});
        await pause(800);
      }
    }

    // ── 4. PEDIDOS ────────────────────────────────────────────────────
    log('→ Pantalla Pedidos / Cocina');
    await page.goto(`${BASE}/app/cocina`);
    await pause(2500);

    // ── 5. CARTA ─────────────────────────────────────────────────────
    log('→ Pantalla Carta (Menú)');
    await page.goto(`${BASE}/app/carta`);
    await pause(2500);

    // Intentar filtrar por categoría si hay botones de filtro
    const filterBtns = await page.$$('button[class*="cat"], button[class*="filter"], button[class*="pill"]');
    if (filterBtns.length > 1) {
      log(`  Filtrando por categoría (${filterBtns.length} filtros)...`);
      await filterBtns[1].click().catch(() => {});
      await pause(1000);
      await filterBtns[0].click().catch(() => {}); // volver a "todo"
      await pause(800);
    }

    // ── 6. CAJA ───────────────────────────────────────────────────────
    log('→ Pantalla Caja');
    await page.goto(`${BASE}/app/caja`);
    await pause(2500);

    // ── 7. RESERVAS ───────────────────────────────────────────────────
    log('→ Pantalla Reservas');
    await page.goto(`${BASE}/app/reservas`);
    await pause(2500);

    // ── 8. INVENTARIO ─────────────────────────────────────────────────
    log('→ Pantalla Inventario');
    await page.goto(`${BASE}/app/inventario`);
    await pause(2500);

    // ── 9. VOLVER A INICIO ────────────────────────────────────────────
    log('→ Volver al Dashboard final');
    await page.goto(`${BASE}/app/inicio`);
    await pause(3000);

    log('✓ Recorrido completo terminado.');

  } catch (err) {
    errors.push(`[FALLO CRÍTICO] ${err.message}`);
    log(`✗ Error: ${err.message}`);
  } finally {
    // Cerrar la página PRIMERO para forzar flush del video
    await page.close();
    await context.close();
    await browser.close();
  }

  // ── Buscar el archivo de video generado ───────────────────────────
  const videos = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
  const videoPath = videos.length > 0
    ? path.join(VIDEO_DIR, videos[videos.length - 1])
    : null;

  // ── Resumen ───────────────────────────────────────────────────────
  log('');
  log('═══════════════════════════════════════════');
  log('  RESULTADO QA VIDEO E2E');
  log('═══════════════════════════════════════════');
  if (videoPath) {
    log(`  Video: ${videoPath}`);
  } else {
    log('  ⚠ No se encontró archivo de video.');
  }
  if (errors.length === 0) {
    log('  Errores de red/JS: 0 ✓');
  } else {
    log(`  Errores detectados: ${errors.length}`);
    errors.forEach(e => log(`    ${e}`));
  }
  log('═══════════════════════════════════════════');
})();
