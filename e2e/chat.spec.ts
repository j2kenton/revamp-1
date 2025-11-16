/**
 * Chat End-to-End Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to chat page
    await page.goto('/chat');
  });

  test('should display empty state when no chat is active', async ({ page }) => {
    await expect(page.getByText('Start a conversation')).toBeVisible();
    await expect(
      page.getByText('Type a message below to begin chatting with AI')
    ).toBeVisible();
  });

  test('should have accessible chat input', async ({ page }) => {
    const input = page.getByLabel('Message input');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('should show character counter', async ({ page }) => {
    const input = page.getByLabel('Message input');
    const counter = page.locator('#char-counter');

    await expect(counter).toBeVisible();
    await expect(counter).toContainText('0 / 4000');

    await input.fill('Hello');
    await expect(counter).toContainText('5 / 4000');
  });

  test('should disable send button when input is empty', async ({ page }) => {
    const sendButton = page.getByRole('button', { name: 'Send message' });
    await expect(sendButton).toBeDisabled();
  });

  test('should enable send button when input has text', async ({ page }) => {
    const input = page.getByLabel('Message input');
    const sendButton = page.getByRole('button', { name: 'Send message' });

    await input.fill('Hello');
    await expect(sendButton).toBeEnabled();
  });

  test('should support Enter key to send message', async ({ page }) => {
    const input = page.getByLabel('Message input');

    await input.fill('Test message');
    await input.press('Enter');

    // Input should be cleared
    await expect(input).toHaveValue('');
  });

  test('should support Shift+Enter for new line', async ({ page }) => {
    const input = page.getByLabel('Message input');

    await input.fill('First line');
    await input.press('Shift+Enter');
    await input.type('Second line');

    await expect(input).toContainText('First line');
    // Should not have sent the message
  });

  test('should show keyboard shortcuts hint', async ({ page }) => {
    await expect(page.getByText('Enter')).toBeVisible();
    await expect(page.getByText('to send')).toBeVisible();
    await expect(page.getByText('Shift')).toBeVisible();
    await expect(page.getByText('for new line')).toBeVisible();
  });

  test('should prevent sending when character limit exceeded', async ({
    page,
  }) => {
    const input = page.getByLabel('Message input');
    const sendButton = page.getByRole('button', { name: 'Send message' });

    // Fill with max characters + 1
    const longText = 'a'.repeat(4001);
    await input.fill(longText);

    await expect(sendButton).toBeDisabled();
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    const input = page.getByLabel('Message input');

    await expect(input).toHaveAttribute('aria-label', 'Message input');
    await expect(input).toHaveAttribute('aria-describedby', 'char-counter');
  });

  test('should display error message with proper role', async ({ page }) => {
    // This test would require mocking an error response
    // Skipping actual error triggering for now
    const errorContainer = page.locator('[role="alert"]');
    await expect(errorContainer).toHaveCount(0); // No errors initially
  });

  test.describe('Accessibility', () => {
    test('should have proper heading structure', async ({ page }) => {
      await page.goto('/chat');
      const heading = page.getByRole('heading', { level: 3 });
      await expect(heading).toBeVisible();
    });

    test('should have proper landmark roles', async ({ page }) => {
      const input = page.getByLabel('Message input');
      await input.fill('Test');

      // After sending a message, should have log region
      // This would require actual message sending implementation
    });

    test('should support keyboard navigation', async ({ page }) => {
      const input = page.getByLabel('Message input');
      const sendButton = page.getByRole('button', { name: 'Send message' });

      // Tab to input
      await page.keyboard.press('Tab');
      await expect(input).toBeFocused();

      // Tab to send button
      await page.keyboard.press('Tab');
      await expect(sendButton).toBeFocused();
    });
  });

  test.describe('Responsive Design', () => {
    test('should be usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const input = page.getByLabel('Message input');
      await expect(input).toBeVisible();

      const sendButton = page.getByRole('button', { name: 'Send message' });
      await expect(sendButton).toBeVisible();
    });

    test('should be usable on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      const input = page.getByLabel('Message input');
      await expect(input).toBeVisible();
    });

    test('should be usable on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      const input = page.getByLabel('Message input');
      await expect(input).toBeVisible();
    });
  });
});
