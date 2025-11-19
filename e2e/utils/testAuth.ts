import type { Page } from '@playwright/test';

const STORAGE_KEY = 'test-auth-bypass';
const MESSAGE_INPUT_SELECTOR = 'textarea[aria-label="Message input"]';
const CHAT_READY_TIMEOUT_MS = 45_000;
const AUTH_MAX_ATTEMPTS = 6;
const AUTH_RETRY_DELAY_MS = 500;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function loginAsTestUser(page: Page): Promise<void> {
  // Seed the bypass flag before any page scripts execute.
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, 'true');
    } catch {
      // Storage may be unavailable in some contexts; ignore failures.
    }
    window.__BYPASS_AUTH__ = true;
  }, STORAGE_KEY);

  let authResponse: Response | null = null;
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

  await page.goto('/chat', { waitUntil: 'domcontentloaded' });

  await page.waitForSelector(MESSAGE_INPUT_SELECTOR, {
    timeout: CHAT_READY_TIMEOUT_MS,
  });
}
