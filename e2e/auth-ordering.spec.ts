/**
 * Google-primary sign-in ordering (unauthenticated, real page render).
 *
 * Verifies acceptance criterion 1 against the actual deployed DOM rather
 * than a component test: on both sign-in surfaces, the Google option is
 * present before the Microsoft option in DOM order, and positioned above it
 * once the options stack vertically. Does not exercise a real Google OAuth
 * round trip (no Google test IDP is available to this suite) — that gap is
 * tracked in the staging smoke checklist (docs/authentication.md).
 */
import { test, expect } from '@playwright/test';

async function expectGoogleBeforeMicrosoft(page: import('@playwright/test').Page) {
  const microsoft = page.getByRole('button', { name: /microsoft/i });
  await expect(microsoft).toBeVisible();

  // The Google container is always attached — rendered regardless of
  // whether the GIS script itself finishes loading (this suite has no
  // guaranteed network path to accounts.google.com), so we assert on
  // attachment/order/position rather than requiring the GIS-rendered
  // button's async iframe content to be visible.
  const google = page.locator(
    '[data-testid="google-signin-button"], [data-testid="google-signin-placeholder"]',
  );
  await expect(google).toHaveCount(1);

  // DOM order: Google's element must precede Microsoft's in document order.
  const order = await page.evaluate(() => {
    const g = document.querySelector(
      '[data-testid="google-signin-button"], [data-testid="google-signin-placeholder"]',
    );
    const buttons = Array.from(document.querySelectorAll('button'));
    const m = buttons.find((b) => /microsoft/i.test(b.textContent ?? ''));
    if (!g || !m) return null;
    // Node.compareDocumentPosition: bit 4 (0x04) means `m` follows `g`.
    return Boolean(g.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);

  // Visual order when stacked: Google's top edge sits above Microsoft's.
  const positions = await page.evaluate(() => {
    const g = document.querySelector(
      '[data-testid="google-signin-button"], [data-testid="google-signin-placeholder"]',
    );
    const buttons = Array.from(document.querySelectorAll('button'));
    const m = buttons.find((b) => /microsoft/i.test(b.textContent ?? ''));
    if (!g || !m) return null;
    return { googleTop: g.getBoundingClientRect().top, microsoftTop: m.getBoundingClientRect().top };
  });
  expect(positions).not.toBeNull();
  if (positions) {
    expect(positions.googleTop).toBeLessThan(positions.microsoftTop);
  }
}

test.describe('Google-first sign-in ordering', () => {
  test('landing page shows Google above Microsoft', async ({ page }) => {
    await page.goto('/');
    await expectGoogleBeforeMicrosoft(page);
  });

  test('chat sign-in gate shows Google above Microsoft', async ({ page }) => {
    await page.goto('/chat');
    await expectGoogleBeforeMicrosoft(page);
  });
});
