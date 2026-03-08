import { test, expect } from '@playwright/test';

async function readParityValue(panel, label) {
  const labelNode = panel.getByText(label, { exact: true }).first();
  await expect(labelNode).toBeVisible();

  const metricCard = labelNode.locator('xpath=ancestor::div[1]');
  const valueText = (await metricCard.locator('p').nth(1).innerText()).trim();
  const normalized = valueText.replace(/,/g, '');

  expect(normalized, `${label} value should not be N/A`).not.toBe('N/A');
  const parsed = Number(normalized);
  expect(Number.isFinite(parsed), `${label} value should be numeric`).toBeTruthy();
  return parsed;
}

test('leads qualified parity remains in sync', async ({ page }) => {
  test.setTimeout(180000);
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });

  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
      body: '[]',
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();
  await expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(' | ')}`).toEqual([]);

  await expect(page.getByText('Qualification And Quality')).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole('heading', { name: 'Free Group Qualified vs Non-Qualified and quality tiers' })).toBeVisible({ timeout: 120000 });

  const parityPanel = page.locator('div').filter({ hasText: 'Qualification Parity' }).first();
  await expect(parityPanel).toBeVisible({ timeout: 120000 });

  const qualified = await readParityValue(parityPanel, 'Qualified');
  const good = await readParityValue(parityPanel, 'Good');
  const great = await readParityValue(parityPanel, 'Great');

  expect(qualified).toBe(good + great);

  const mismatchWarning = parityPanel.getByText('Qualified parity mismatch: Qualified should equal Good + Great');
  await expect(mismatchWarning).toHaveCount(0);
});
