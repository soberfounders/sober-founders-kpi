import { test, expect } from '@playwright/test';

test('leads confidence panel and action queues render safely', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();

  const confidencePanel = page.locator('section').filter({ hasText: 'Confidence and Action Queue' }).first();
  await expect(confidencePanel).toBeVisible({ timeout: 30000 });

  await expect(confidencePanel.getByText('Confidence and Action Queue')).toBeVisible({ timeout: 30000 });
  await expect(confidencePanel.getByText('Lead quality confidence panel')).toBeVisible({ timeout: 30000 });
  await expect(confidencePanel.getByText('Top blockers')).toBeVisible({ timeout: 120000 });
  await expect(confidencePanel.getByText('Autonomous tasks')).toBeVisible({ timeout: 120000 });
  await expect(confidencePanel.getByText('Human-required tasks')).toBeVisible({ timeout: 120000 });
  await expect(confidencePanel.getByText('Confidence score')).toBeVisible({ timeout: 120000 });

  const lowConfidenceWarning = confidencePanel.getByText(/Low confidence warning:/i);
  const fallbackMessage = confidencePanel.getByText(/No confidence queue payload is available yet/i);
  const hasLowConfidenceWarning = (await lowConfidenceWarning.count()) > 0;
  const hasFallbackMessage = (await fallbackMessage.count()) > 0;
  expect(
    hasLowConfidenceWarning || hasFallbackMessage,
    'Expected low-confidence warning or fallback message in the leads confidence panel',
  ).toBeTruthy();

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
