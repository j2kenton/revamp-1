import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './utils/testAuth';

test.describe('Chat Functionality E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('complete chat flow - send message and receive response', async ({
    page,
  }) => {
    // Check accessibility
    await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible();

    // Send a message
    await page.fill('[aria-label="Chat message input"]', 'Hello AI assistant');
    await page.keyboard.press('Enter');

    // Wait for response
    await expect(page.locator('.message-user')).toContainText(
      'Hello AI assistant',
    );
    await expect(page.locator('.message-assistant')).toBeVisible();

    // Verify message is saved
    await page.reload();
    await expect(page.locator('.message-user')).toContainText(
      'Hello AI assistant',
    );
  });

  test('handles network errors gracefully', async ({ page }) => {
    // Simulate offline mode
    await page.route('**/api/chat', (route) => route.abort());

    await page.fill('[aria-label="Chat message input"]', 'Test message');
    await page.keyboard.press('Enter');

    // Should show error message
    await expect(page.locator('.error-message')).toContainText(/failed|error/i);

    // Should show retry button
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('supports keyboard navigation', async ({ page }) => {
    // Tab through interface
    await page.keyboard.press('Tab');
    await expect(
      page.locator('[aria-label="Chat message input"]'),
    ).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /send/i })).toBeFocused();

    // Send with keyboard
    await page.locator('[aria-label="Chat message input"]').focus();
    await page.keyboard.type('Keyboard test');
    await page.keyboard.press('Enter');

    await expect(page.locator('.message-user')).toContainText('Keyboard test');
  });

  test('prevents XSS attacks', async ({ page }) => {
    const xssPayload = '<img src=x onerror="alert(\'XSS\')">';
    await page.fill('[aria-label="Chat message input"]', xssPayload);
    await page.keyboard.press('Enter');

    // Wait for message to appear
    await page.waitForSelector('.message-user');

    // Check that script is not executed
    const alertDialog = page.locator('dialog');
    await expect(alertDialog).not.toBeVisible();

    // Check that HTML is escaped
    const messageText = await page.locator('.message-user').textContent();
    expect(messageText).not.toContain('<img');
  });

  test('streaming responses display progressively', async ({ page }) => {
    await page.goto('/chat?streaming=true');

    await page.fill('[aria-label="Chat message input"]', 'Stream test');
    await page.keyboard.press('Enter');

    // Check for streaming indicator
    await expect(page.locator('.streaming-indicator')).toBeVisible();

    // Wait for streaming to complete
    await expect(page.locator('.streaming-indicator')).not.toBeVisible({
      timeout: 10000,
    });

    // Verify complete message
    await expect(page.locator('.message-assistant')).not.toBeEmpty();
  });

  test('chat history persists across sessions', async ({ page, context }) => {
    // Send first message
    await page.fill('[aria-label="Chat message input"]', 'First message');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.message-assistant');

    // Open new tab
    const newPage = await context.newPage();
    await newPage.goto('/chat');

    // History should be visible
    await expect(newPage.locator('.message-user')).toContainText(
      'First message',
    );
  });

  test('respects rate limiting', async ({ page }) => {
    // Send multiple messages quickly
    for (let i = 0; i < 10; i++) {
      await page.fill('[aria-label="Chat message input"]', `Message ${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }

    // Should show rate limit message
    await expect(page.locator('.error-message')).toContainText(
      /rate limit|too many/i,
    );
  });

  test('mobile responsiveness', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/chat');

    // Check that interface is still functional
    await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible();

    // Send message on mobile
    await page.fill('[aria-label="Chat message input"]', 'Mobile test');
    await page.click('button[aria-label="Send message"]');

    await expect(page.locator('.message-user')).toContainText('Mobile test');
  });

  test('dark mode support', async ({ page }) => {
    // Toggle dark mode
    await page.click('[aria-label="Toggle theme"]');

    // Check dark mode classes
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Verify chat is still functional
    await page.fill('[aria-label="Chat message input"]', 'Dark mode test');
    await page.keyboard.press('Enter');

    await expect(page.locator('.message-user')).toContainText('Dark mode test');
  });
});
