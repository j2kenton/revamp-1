import type { Page } from '@playwright/test';

const STORAGE_KEY = 'test-auth-bypass';

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

  const response = await page.request.post('/api/test-support/auth');
  if (!response.ok()) {
    throw new Error('Failed to initialize test authentication');
  }

  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea[aria-label="Message input"]', {
    timeout: 15000,
  });
}
