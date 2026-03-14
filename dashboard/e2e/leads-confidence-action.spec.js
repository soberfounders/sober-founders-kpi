import { test, expect } from '@playwright/test';

test('leads confidence panel and action queues render safely', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();
  await expect(page.getByRole('heading', { name: 'Leads Overview' })).toBeVisible({ timeout: 60000 });

  const missingEnv = page.getByText('Supabase Environment Variables Missing');
  const confidencePanel = page.locator('section').filter({ hasText: 'Data Integrity and Action Queue' }).first();
  await expect(confidencePanel.or(missingEnv).first()).toBeVisible({ timeout: 60000 });
  if ((await missingEnv.count()) > 0) {
    await expect(page.getByText('Configuration Required')).toBeVisible();
    await expect(page.locator('main')).toContainText('VITE_SUPABASE_URL');
    await expect(page.locator('body')).not.toContainText('[object Object]');
    return;
  }

  await expect(confidencePanel.getByText('Data Integrity and Action Queue')).toBeVisible({ timeout: 60000 });
  await expect(confidencePanel.getByText('HubSpot parity and sync status')).toBeVisible({ timeout: 60000 });

  await expect.poll(async () => {
    const hasFull = (await confidencePanel.getByText('Top blockers').count()) > 0;
    const hasFallback = (await confidencePanel.getByText(/No action-queue payload is available yet/i).count()) > 0;
    const hasLoading = (await confidencePanel.locator('div[style*="height: 16px"]').count()) >= 1;
    return hasFull || hasFallback || hasLoading;
  }, { timeout: 120000 }).toBeTruthy();

  const hasFull = (await confidencePanel.getByText('Top blockers').count()) > 0;
  if (hasFull) {
    await expect(confidencePanel.getByText('Top blockers')).toBeVisible();
    await expect(confidencePanel.getByText('Autonomous tasks')).toBeVisible();
    await expect(confidencePanel.getByText('Human-required tasks')).toBeVisible();
    await expect(confidencePanel.getByText('Integrity status')).toBeVisible();
  }

  const lowConfidenceWarning = confidencePanel.getByText(/Data-quality warning:/i);
  const fallbackMessage = confidencePanel.getByText(/No action-queue payload is available yet/i);
  const loadingRows = confidencePanel.locator('div[style*="height: 16px"]');
  const hasLowConfidenceWarning = (await lowConfidenceWarning.count()) > 0;
  const hasFallbackMessage = (await fallbackMessage.count()) > 0;
  const hasLoadingRows = (await loadingRows.count()) > 0;
  expect(
    hasLowConfidenceWarning || hasFallbackMessage || hasLoadingRows,
    'Expected data-quality warning, fallback message, or loading state in the leads integrity panel',
  ).toBeTruthy();

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
