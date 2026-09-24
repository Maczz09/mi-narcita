import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PWA_E2E_PORT ?? 4200);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PWA_BASE_URL ?? baseURL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.PWA_BASE_URL ? undefined : {
    command: `node ../../node_modules/vite/bin/vite.js --config vite.config.e2e.ts --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL: '',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
