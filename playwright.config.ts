import { defineConfig, devices } from '@playwright/test';

const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const PLAYWRIGHT_DIST_DIR =
  process.env.PLAYWRIGHT_DIST_DIR ?? '.next-playwright';
const CI_RETRIES = 2;
const WEB_SERVER_TIMEOUT_MS = 120000;
// Generous because the dev server compiles routes on first hit and the chat
// round-trip waits on a real streaming response.
const TEST_TIMEOUT_MS = 90000;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: TEST_TIMEOUT_MS,
  // The suite runs against a single dev server backed by one mock Redis and
  // one shared test identity. Parallel tests/projects contaminate each other:
  // sends trip the shared per-identity rate-limit windows (429s leaking into
  // unrelated tests) and every conversation lands in the same sidebar list.
  // Run strictly serially so each test sees a deterministic rate budget; the
  // one ambiguous assertion (sidebar rows) is scoped via `aria-current`.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? CI_RETRIES : 0,
  workers: 1,
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
    command: `npx cross-env NEXT_DIST_DIR=${PLAYWRIGHT_DIST_DIR} PORT=${PLAYWRIGHT_PORT} MOCK_REDIS=true TEST_AUTH_MODE=true NEXT_PUBLIC_AZURE_AD_CLIENT_ID=playwright-test-client NEXT_PUBLIC_GOOGLE_CLIENT_ID=playwright-test-google-client next dev`,
    url: `http://localhost:${PLAYWRIGHT_PORT}`,
    reuseExistingServer: false,
    timeout: WEB_SERVER_TIMEOUT_MS,
  },
});
