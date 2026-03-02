import { test, expect } from '@playwright/test';

test('dashboard loads and has correct title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Sober Founders KPI Dashboard/);
});
