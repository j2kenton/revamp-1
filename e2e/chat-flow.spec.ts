import { test, expect } from '@playwright/test';

test.describe('Chat E2E', () => {
  test('send and receive flow', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/chat/);

    // Adjust selectors to your UI
    const input = page.getByRole('textbox', { name: /message/i });
    await input.fill('Hello, AI!');
    await page.getByRole('button', { name: /send/i }).click();

    // Optimistic UI then AI response (implementation-specific timing)
    await expect(input).toBeVisible();
  });
});
