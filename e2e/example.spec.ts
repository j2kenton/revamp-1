import { test, expect } from '@playwright/test';

/**
 * Example end-to-end test.
 * This demonstrates basic Playwright testing patterns.
 */
test.describe('Homepage', () => {
  test('should display the homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that the page loaded successfully
    await expect(page).toHaveTitle(/CR Project App/);
  });
});

/**
 * Example authentication test.
 * Uncomment and modify once authentication is fully set up.
 */
// test.describe('Authentication', () => {
//   test('should navigate to login page', async ({ page }) => {
//     await page.goto('/');
//     await page.click('text=Login');
//     await expect(page).toHaveURL('/login');
//   });
// });
