import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8788', headless: true, channel: 'chrome',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    viewport: { width: 1360, height: 900 }
  },
  webServer: {
    command: 'npm start', url: 'http://127.0.0.1:8788/api/health',
    env: { PORT: '8788' }, reuseExistingServer: false
  }
});
