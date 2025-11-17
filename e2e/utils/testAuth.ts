import type { Page } from '@playwright/test';

export async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto('/test-support/login');

  const continueButton = page.getByRole('button', {
    name: /continue to chat/i,
  });

  await continueButton.click();
  await page.waitForURL('**/chat');
  await page.waitForLoadState('networkidle');
}
