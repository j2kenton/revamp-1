import type { APIResponse, Page } from '@playwright/test';

const STORAGE_KEY = 'test-auth-bypass';
const MESSAGE_INPUT_SELECTOR = 'textarea[aria-label="Message input"]';
const CHAT_READY_TIMEOUT_MS = 50_000;
const AUTH_MAX_ATTEMPTS = 6;
const AUTH_RETRY_DELAY_MS = 500;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function loginAsTestUser(page: Page): Promise<void> {
  // Seed the bypass flag before any page scripts execute.
  await page.addInitScript((key: string) => {
    try {
      window.localStorage.setItem(key, 'true');
    } catch {
      // Storage may be unavailable in some contexts; ignore failures.
    }
    window.__BYPASS_AUTH__ = true;
  }, STORAGE_KEY);

  let authResponse: APIResponse | null = null;
  for (let attempt = 0; attempt < AUTH_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await page.request.post('/api/test-support/auth');
      if (response.ok()) {
        authResponse = response;
        break;
      }
    } catch {
      // swallow and retry after short delay
    }
    await sleep(AUTH_RETRY_DELAY_MS * (attempt + 1));
  }

  if (!authResponse) {
    throw new Error('Failed to initialize test authentication');
  }

  // Give this test a fresh rate-limit budget: every test shares one identity
  // on one mock Redis, and the app issues several rate-limited requests per
  // action, so without a reset the shared per-identity windows fill up after
  // a few tests and unrelated tests start receiving 429s.
  try {
    await page.request.post('/api/test-support/rate-limits');
  } catch {
    // Best-effort: a failed reset falls back to the shared budget.
  }

  await page.goto('/chat', { waitUntil: 'domcontentloaded' });

  // Do NOT wait for `networkidle` here: the signed-in chat page keeps
  // background requests in flight (React Query refetches, dev-server
  // resources), so network idle never settles and the wait times out. The
  // message textarea becoming visible is the real readiness signal — it only
  // renders once auth resolution and hydration have completed.
  await page.waitForSelector(MESSAGE_INPUT_SELECTOR, {
    timeout: CHAT_READY_TIMEOUT_MS,
    state: 'visible',
  });
}
