import { test, expect, type Page } from '@playwright/test';
import { loginAsTestUser } from './utils/testAuth';

// Every project shares one dev server, one mock Redis, and one test identity,
// so this file also declares serial mode locally (playwright.config pins
// workers to 1): concurrent sends would trip the shared per-identity rate
// limits and interleave conversations in the shared sidebar list.
test.describe.configure({ mode: 'serial' });

// Accessible names come from STRINGS (lib/constants/strings.ts): the composer
// textarea is labelled "Message input", the send button "Send message", and
// each message renders role="article" labelled "<role>, <relative time>".
const messageInput = (page: Page) =>
  page.getByRole('textbox', { name: 'Message input', exact: true });

const sendButton = (page: Page) =>
  page.getByRole('button', { name: 'Send message', exact: true });

const userMessages = (page: Page) =>
  page.getByRole('article', { name: /^You,/ });

const assistantMessages = (page: Page) =>
  page.getByRole('article', { name: /^Assistant,/ });

// Next.js mounts a persistent (usually empty) route-announcer div with
// role="alert", so alert assertions must filter by the expected text to
// resolve to the app's own error banner.
const alertWithText = (page: Page, pattern: RegExp) =>
  page.getByRole('alert').filter({ hasText: pattern });

const sendMessage = async (page: Page, content: string): Promise<void> => {
  await messageInput(page).fill(content);
  await page.keyboard.press('Enter');
};

// Messages are sent to /api/chat/stream (see useStreamingResponse.ts) — route
// interceptions must target that endpoint, not /api/chat.
const STREAM_ENDPOINT_GLOB = '**/api/chat/stream';
const SEND_AND_REPLY_TIMEOUT_MS = 30_000;

test.describe('Chat Functionality E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('complete chat flow - send message and receive response', async ({
    page,
  }) => {
    // Check accessibility
    await expect(messageInput(page)).toBeVisible();
    await expect(sendButton(page)).toBeVisible();

    // Send a message
    await sendMessage(page, 'Hello AI assistant');

    // The optimistic echo renders immediately; the assistant reply follows.
    await expect(userMessages(page).first()).toContainText(
      'Hello AI assistant',
    );
    await expect(assistantMessages(page).last()).toBeVisible({
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });

    // By now the URL has adopted the server-assigned chat id
    // (history.replaceState in AuthenticatedChat), so a reload restores the
    // same conversation from the server.
    await page.reload();
    await expect(userMessages(page).first()).toContainText(
      'Hello AI assistant',
      { timeout: SEND_AND_REPLY_TIMEOUT_MS },
    );
  });

  test('handles network errors gracefully', async ({ page }) => {
    // Simulate the stream endpoint being unreachable.
    await page.route(STREAM_ENDPOINT_GLOB, (route) => route.abort());

    await sendMessage(page, 'Test message');

    // The hook surfaces the transport failure as an alert above the input
    // ("Failed to fetch" / "NetworkError…" / "Load failed", per browser).
    await expect(alertWithText(page, /failed|error/i)).toBeVisible({
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });
  });

  test('supports keyboard navigation', async ({ page }) => {
    // Focus the composer directly — the global tab order legitimately starts
    // at the skip link and header controls, which is not what this test is
    // about. The behaviour under test is keyboard-only compose + send.
    await messageInput(page).focus();
    await page.keyboard.type('Keyboard test');
    await page.keyboard.press('Enter');

    await expect(userMessages(page).first()).toContainText('Keyboard test');
  });

  test('prevents XSS attacks', async ({ page }) => {
    const xssPayload = '<img src=x onerror="alert(\'XSS\')">';
    await sendMessage(page, xssPayload);

    // The user's message renders (as inert text — React escapes it, and the
    // server strips all HTML tags before persisting).
    await expect(userMessages(page).first()).toBeVisible();

    // The real security property: no element from the payload ever enters the
    // DOM and no dialog fires. (Matching the payload as *text* would race the
    // optimistic echo against the server's sanitized copy.)
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('streaming responses display progressively', async ({ page }) => {
    await sendMessage(page, 'Stream test');

    // The streaming assistant message exposes its progress through the
    // accessible message article rather than a CSS-only indicator.
    const streamingReply = assistantMessages(page).last();
    await expect(streamingReply).toBeVisible({
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });

    // While streaming, the article carries a "Loading..." status label; once
    // the stream completes the label is gone and the content remains.
    await expect(streamingReply).not.toContainText(/Loading/, {
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });
    await expect(assistantMessages(page).last()).not.toBeEmpty();
  });

  test('chat history persists across sessions', async ({ page }) => {
    // Send first message
    await sendMessage(page, 'First message');

    // The assistant replies and the URL adopts the server-assigned chat id
    // (history.replaceState in AuthenticatedChat.handleMessageCreated).
    await expect(assistantMessages(page).last()).toBeVisible({
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);

    // Reload the conversation URL — the message history must be restored.
    await page.reload();
    await expect(userMessages(page).first()).toContainText('First message', {
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });

    // The conversation (titled from the first message) appears in the
    // sidebar's previous-conversations list. Other tests (and other browser
    // projects) also create chats titled "First message" against the shared
    // mock store, so assert on the one unambiguous row: the active
    // conversation, marked aria-current by ChatListItem.
    const sidebar = page.getByRole('complementary', {
      name: 'Previous conversations',
    });
    const activeRow = sidebar.locator('button[aria-current="true"]');
    await expect(activeRow).toHaveCount(1, {
      timeout: SEND_AND_REPLY_TIMEOUT_MS,
    });
    await expect(activeRow).toContainText('First message');
  });

  test('respects rate limiting', async ({ page }) => {
    // Drive the UI's 429 path deterministically: stub the stream endpoint to
    // reject with the server's rate-limit response shape. Saturating the real
    // limiter would leak 429s into other tests sharing this identity (the
    // server-side limiter itself is covered by unit tests).
    await page.route(STREAM_ENDPOINT_GLOB, (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '30' },
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Too many requests. Please try again in 30 seconds.',
            details: { retryAfter: 30 },
          },
        }),
      }),
    );

    await sendMessage(page, 'Rate limit probe');

    // The rate-limit rejection is surfaced as an alert above the input.
    await expect(alertWithText(page, /too many|rate limit/i)).toBeVisible();
  });

  test('mobile responsiveness', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/chat');

    // Check that interface is still functional (the sidebar hides below md)
    await expect(messageInput(page)).toBeVisible();
    await expect(sendButton(page)).toBeVisible();

    // Send message on mobile
    await messageInput(page).fill('Mobile test');
    await sendButton(page).click();

    await expect(userMessages(page).first()).toContainText('Mobile test');
  });

  test('dark mode support', async ({ page }) => {
    // Open the theme selector popover and pick Dark. The option locator is
    // scoped to the popover's dialog: earlier runs of this very test persist a
    // conversation titled "Dark mode test" into the shared sidebar list, whose
    // row also matches /Dark/.
    await page
      .getByRole('button', { name: 'Theme selector', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Dark/ })
      .click();

    // Check dark mode classes
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Verify chat is still functional
    await sendMessage(page, 'Dark mode test');

    await expect(userMessages(page).first()).toContainText('Dark mode test');
  });
});

