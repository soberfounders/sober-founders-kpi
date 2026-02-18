import { test, expect } from '@playwright/test';

test('dashboard loads and has correct title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Vite \+ React/);

  // Take a screenshot
  await page.screenshot({ path: 'e2e/screenshots/dashboard.png' });
});
