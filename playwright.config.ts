import { defineConfig, devices } from '@playwright/test';

const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const PLAYWRIGHT_DIST_DIR =
  process.env.PLAYWRIGHT_DIST_DIR ?? '.next-playwright';
const CI_RETRIES = 2;
const CI_WORKERS = 1;
const WEB_SERVER_TIMEOUT_MS = 120000;
const TEST_TIMEOUT_MS = 60000;

export default defineConfig({
  testDir: './e2e',
  timeout: TEST_TIMEOUT_MS,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? CI_RETRIES : 0,
  workers: process.env.CI ? CI_WORKERS : undefined,
  reporter: [['html'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PLAYWRIGHT_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx cross-env NEXT_DIST_DIR=${PLAYWRIGHT_DIST_DIR} PORT=${PLAYWRIGHT_PORT} MOCK_REDIS=true TEST_AUTH_MODE=true NEXT_PUBLIC_TEST_AUTH_MODE=true NEXT_PUBLIC_AZURE_AD_CLIENT_ID=playwright-test-client pnpm dev`,
    url: `http://localhost:${PLAYWRIGHT_PORT}`,
    reuseExistingServer: false,
    timeout: WEB_SERVER_TIMEOUT_MS,
  },
});
