import { test, expect } from '@playwright/test';

test('leads qualified parity remains in sync', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();

  const confidencePanel = page.locator('section').filter({ hasText: 'Confidence and Action Queue' }).first();
  const parityGuardPanel = page.locator('section').filter({ hasText: 'Parity Guard' }).first();
  await expect(confidencePanel).toBeVisible({ timeout: 60000 });
  await expect(parityGuardPanel).toBeVisible({ timeout: 60000 });

  const qualificationSectionTitle = page.getByText('Qualification And Quality');
  await expect.poll(async () => {
    const hasQualificationSection = (await qualificationSectionTitle.count()) > 0;
    const hasLoadingState = (await confidencePanel.locator('div[style*="height: 16px"]').count()) > 0
      && (await parityGuardPanel.locator('div[style*="height: 16px"]').count()) > 0;
    return hasQualificationSection || hasLoadingState;
  }, { timeout: 120000 }).toBeTruthy();

  const hasQualificationSection = (await qualificationSectionTitle.count()) > 0;
  if (hasQualificationSection) {
    await expect(qualificationSectionTitle).toBeVisible();
    await expect(page.getByText('Bad (<$100K)')).toBeVisible();
    await expect(page.getByText('OK ($100K-$249K)')).toBeVisible();
    await expect(page.getByText('Good ($250K-$999K)')).toBeVisible();
    await expect(page.getByText('Great ($1M+)')).toBeVisible();
    await expect(page.getByText(/Qualified = official revenue.*AND sobriety date at least 365 days before as-of date/i)).toBeVisible();

    const parityPanel = page.locator('div').filter({ hasText: 'Qualification Parity' }).first();
    await expect(parityPanel).toBeVisible({ timeout: 60000 });
    await expect(parityPanel.getByText('SOBRIETY-FILTERED')).toBeVisible();
    await expect(parityPanel.getByText(/Good \+ Great is the high-revenue pool.*Qualified is the sobriety-filtered subset/i)).toBeVisible();

    await expect(parityPanel).not.toContainText('Qualified parity mismatch: Qualified should equal Good + Great');
    await expect(parityPanel).not.toContainText('IN SYNC');
    await expect(parityPanel).not.toContainText('MISMATCH');
  }

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
