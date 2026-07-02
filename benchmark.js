const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const startTime = Date.now();
  
  // Go to the page and wait for network idle
  await page.goto('http://localhost:4200', { waitUntil: 'networkidle' });
  
  const loadTime = Date.now() - startTime;
  
  // Get performance metrics from the page
  const perfData = await page.evaluate(() => {
    const perf = window.performance.getEntriesByType('navigation')[0];
    const paint = window.performance.getEntriesByType('paint');
    
    let fcp = 0;
    const fcpEntry = paint.find(p => p.name === 'first-contentful-paint');
    if (fcpEntry) {
      fcp = fcpEntry.startTime;
    }

    const resources = window.performance.getEntriesByType('resource');
    let totalTransfer = 0;
    resources.forEach(r => {
      totalTransfer += r.transferSize || 0;
    });

    return {
      ttfb: perf ? perf.responseStart - perf.requestStart : 0,
      domInteractive: perf ? perf.domInteractive - perf.startTime : 0,
      domComplete: perf ? perf.domComplete - perf.startTime : 0,
      fcp: fcp,
      totalRequests: resources.length,
      totalTransfer: totalTransfer
    };
  });

  const report = {
    url: 'http://localhost:4200',
    loadTimeMs: loadTime,
    ...perfData
  };

  fs.writeFileSync('benchmark_results.json', JSON.stringify(report, null, 2));
  console.log('Benchmark completed successfully:', report);
  await browser.close();
})();
