import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: process.env.CHROME_PATH || (existsSync(systemChrome) ? systemChrome : undefined) },
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'pnpm dev --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
