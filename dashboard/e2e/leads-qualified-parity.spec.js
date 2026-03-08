import { test, expect } from '@playwright/test';

function parseCount(value) {
  const normalized = String(value || '').replace(/,/g, '').trim();
  if (!normalized || normalized === 'N/A') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readMetricValue(panel, label) {
  const labelNode = panel.getByText(label, { exact: true }).first();
  await expect(labelNode).toBeVisible();
  const card = labelNode.locator('xpath=ancestor::div[1]');
  const raw = await card.locator('p').nth(1).innerText();
  return parseCount(raw);
}

test('leads qualified rule check remains consistent', async ({ page }) => {
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
    const parityPanel = page.locator('div').filter({ hasText: 'Qualification Rule Check' }).first();
    await expect(parityPanel).toBeVisible({ timeout: 60000 });

    const isUnavailable = (await parityPanel.getByText('Qualification rule values are not available yet.').count()) > 0;
    if (!isUnavailable) {
      const qualified = await readMetricValue(parityPanel, 'Qualified');
      const good = await readMetricValue(parityPanel, 'Good');
      const great = await readMetricValue(parityPanel, 'Great');
      const revenueEligible = await readMetricValue(parityPanel, 'Revenue Eligible');
      if (qualified !== null && good !== null && great !== null && revenueEligible !== null) {
        expect(revenueEligible).toBe(good + great);
        expect(qualified).toBeLessThanOrEqual(revenueEligible);
      }

      const invalidWarning = parityPanel.getByText('Data anomaly: Qualified exceeds revenue-eligible leads (Good + Great).');
      await expect(invalidWarning).toHaveCount(0);
    }
  }

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
