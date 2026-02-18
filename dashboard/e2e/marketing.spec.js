import { test, expect } from '@playwright/test';

test('marketing section loads correctly', async ({ page }) => {
  // Navigate to the dashboard
  await page.goto('/');

  // Find and click the Marketing link in the sidebar
  // We can use the text "Marketing" which should be in the sidebar button
  await page.getByRole('button', { name: 'Marketing' }).click();

  // Verify that the Marketing Dashboard is displayed
  // We check for a unique element or text on that page, e.g., "Marketing Insight"
  await expect(page.getByText('Marketing Insight')).toBeVisible();
  
  // Also check for "Engagement Trends"
  await expect(page.getByText('Engagement Trends')).toBeVisible();

  // Take a screenshot of the Marketing section
  await page.screenshot({ path: 'e2e/screenshots/marketing.png' });
});
