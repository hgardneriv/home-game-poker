import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const e2eEnv = {
  ...process.env,
  SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-secret-not-for-production',
  ALLOW_MEMORY_KV: '1',
  // Force the in-memory store even if the developer has Redis in .env.local.
  KV_REST_API_URL: '',
  KV_REST_API_TOKEN: '',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: e2eEnv,
  },
});
