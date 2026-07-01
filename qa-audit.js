const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  console.log('Iniciando auditoría QA granular E2E...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const report = [];
  let errorCount = 0;

  // Escuchar errores de consola y red
  page.on('console', msg => {
    if (msg.type() === 'error') {
      report.push(`[ERROR CONSOLA] ${msg.text()}`);
      errorCount++;
    }
  });
  
  page.on('pageerror', error => {
    report.push(`[EXCEPCIÓN JS] ${error.message}`);
    errorCount++;
  });
  
  page.on('response', response => {
    // Ignore 401 on /auth/me or /auth/refresh because they are expected when session is restored
    if (response.status() === 401 && (response.url().includes('/auth/me') || response.url().includes('/auth/refresh'))) {
      return;
    }
    if (response.status() >= 400) {
      report.push(`[ERROR RED] ${response.status()} en ${response.url()}`);
      errorCount++;
    }
  });

  const baseUrl = 'http://localhost:8000';
  
  try {
    // 1. Navegar a /login
    console.log('Navegando a Login...');
    await page.goto('http://localhost:8000/login');
    
    // Auth flow (asume admin@nachopps.pe / nachopps123 existe en la bd testeada)
    console.log('Realizando login...');
    await page.fill('input[type="email"]', 'admin@nachopps.pe');
    await page.fill('input[type="password"]', 'nachopps123'); // from docker-compose weak credentials
    await page.click('button[type="submit"]');

    console.log('Esperando redirección...');
    await page.waitForURL('**/app');
    
    const cookies = await context.cookies();
    report.push(`[COOKIES LUEGO DE LOGIN] ${cookies.length}`);
    console.log('Login exitoso. Cookies:', cookies.length);
    await page.waitForTimeout(2000); // Wait for auth redirection
    
    // 2. Visitar Inicio
    console.log('Validando pantalla Inicio...');
    // extraemos algunos links/botones para simular navegación
    const actionables = await page.$$eval('button', buttons => buttons.length);
    console.log(`Encontrados ${actionables} botones interactuables.`);
    const links = await page.$$eval('a', anchors => anchors.map(a => a.href).filter(h => h.startsWith('http://localhost:8000') && !h.includes('#')));
    const uniqueLinks = [...new Set(links)];
    console.log(`Encontradas ${uniqueLinks.length} rutas para navegar.`);
    
    for (const link of uniqueLinks) {
      console.log(`Navegando a: ${link}`);
      await page.goto(link);
      await page.waitForTimeout(1000);
      
      // Intentar interactuar con algunos botones principales si los hay
      const buttons = await page.$$('button:visible');
      if (buttons.length > 0) {
         try {
           await buttons[0].click({ timeout: 1000 });
           await page.waitForTimeout(500);
         } catch (e) {
           // ignore non-clickable
         }
      }
    }

  } catch (error) {
    report.push(`[FALLO CRÍTICO DE QA] ${error.message}`);
  } finally {
    await browser.close();
  }
  
  const reportText = [
    '=== REPORTE QA E2E ===',
    `Errores encontrados: ${errorCount}`,
    ...report
  ].join('\n');
  
  fs.writeFileSync('qa-report.txt', reportText);
  console.log('Auditoría terminada. Reporte generado en qa-report.txt.');
})();
