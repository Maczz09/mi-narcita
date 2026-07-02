const { chromium } = require('@playwright/test');

(async () => {
  console.log("Lanzando headless browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log("Entrando a Grafana (http://localhost:3000)...");
  await page.goto('http://localhost:3000/login');
  
  console.log("Iniciando sesión...");
  await page.fill('input[name="user"]', 'admin');
  await page.fill('input[name="password"]', 'admin');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(2000);
  
  // Skip change password prompt if it exists
  try {
    await page.click('button:has-text("Skip")', { timeout: 2000 });
  } catch (e) {}
  
  console.log("Alistando dashboards de negocio y observabilidad...");
  await page.goto('http://localhost:3000/d/nachopps-negocio');
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'grafana-dashboard.png' });
  console.log("Dashboard verificado y screenshot capturado (grafana-dashboard.png)");
  
  await browser.close();
  console.log("Headless browser cerrado exitosamente.");
})();
