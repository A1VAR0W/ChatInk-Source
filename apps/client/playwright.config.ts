import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev --prefix ../..',
    url: 'http://127.0.0.1:5173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      TOKEN_SECRET: 'playwright-secret-with-at-least-thirty-two-chars',
      NODE_ENV: 'test',
      ALLOWED_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
