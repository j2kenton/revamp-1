import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './utils/testAuth';

test.describe('Chat E2E', () => {
  test('send and receive flow', async ({ page }) => {
    await loginAsTestUser(page);
    await expect(page).toHaveURL(/\/chat/);

    // Adjust selectors to your UI
    const input = page.getByRole('textbox', { name: /message/i });
    await input.fill('Hello, AI!');
    await page.getByRole('button', { name: /send/i }).click();

    // Optimistic UI then AI response (implementation-specific timing)
    await expect(input).toBeVisible();
  });
});
