import { test, expect } from '@playwright/test';

test('leads parity guard panel renders with warning-safe states', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();

  const parityPanel = page.locator('section').filter({ hasText: 'Parity Guard' }).first();
  await expect(parityPanel).toBeVisible({ timeout: 60000 });
  await expect(parityPanel.getByText('Legacy vs grouped parity status')).toBeVisible({ timeout: 60000 });

  await expect.poll(async () => {
    const hasLoading = (await parityPanel.locator('div[style*="height: 16px"]').count()) >= 1;
    const hasSummaryBadges = (await parityPanel.getByText('Pass', { exact: true }).count()) > 0
      && (await parityPanel.getByText('Warn', { exact: true }).count()) > 0
      && (await parityPanel.getByText('Fail', { exact: true }).count()) > 0;
    return hasLoading || hasSummaryBadges;
  }, { timeout: 120000 }).toBeTruthy();

  const hasLoading = (await parityPanel.locator('div[style*="height: 16px"]').count()) >= 1;
  if (!hasLoading) {
    await expect(parityPanel.getByText('Pass', { exact: true })).toBeVisible();
    await expect(parityPanel.getByText('Warn', { exact: true })).toBeVisible();
    await expect(parityPanel.getByText('Fail', { exact: true })).toBeVisible();
    await expect(parityPanel.getByText('Skip', { exact: true })).toBeVisible();

    const rows = parityPanel.locator('tbody tr');
    const fallbackUnavailable = parityPanel.getByText(/Parity report is unavailable in this environment/i);
    const fallbackClean = parityPanel.getByText(/No failing or warning parity metrics in the latest report/i);
    const hasRows = (await rows.count()) > 0;
    const hasFallback = (await fallbackUnavailable.count()) > 0 || (await fallbackClean.count()) > 0;
    expect(hasRows || hasFallback, 'Expected at least one row or fallback state in parity guard panel').toBeTruthy();

    const panelText = await parityPanel.innerText();
    const warnMatch = panelText.match(/Warn\s+(\d+)/i);
    const failMatch = panelText.match(/Fail\s+(\d+)/i);
    const warnCount = warnMatch ? Number(warnMatch[1]) : 0;
    const failCount = failMatch ? Number(failMatch[1]) : 0;
    if ((warnCount + failCount) > 0) {
      const warningIndicator = parityPanel.locator('span', { hasText: /WARN|FAIL/i }).first();
      await expect(warningIndicator).toBeVisible();
    }
  }

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
