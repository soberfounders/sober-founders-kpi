import { test, expect } from '@playwright/test';

test('marketing section loads correctly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Marketing' }).click();

  await expect(page.getByRole('heading', { name: 'Marketing Overview' })).toBeVisible();

  const insight = page.getByText('Marketing Insight');
  const missingEnv = page.getByText('Supabase Environment Variables Missing');
  await expect(insight.or(missingEnv).first()).toBeVisible();
});
