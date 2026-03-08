import { test, expect } from '@playwright/test';

async function sectionCard(panel, title) {
  const titleNode = panel.getByText(title, { exact: true }).first();
  await expect(titleNode).toBeVisible();
  return titleNode.locator('xpath=ancestor::div[1]');
}

test('leads manager insights and experiment analyzer render safely', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();
  await expect(page.getByRole('heading', { name: 'Leads Overview' })).toBeVisible({ timeout: 60000 });

  const missingEnv = page.getByText('Supabase Environment Variables Missing');
  const managerPanel = page.locator('section').filter({ hasText: 'Leads Manager Insights' }).first();
  await expect(managerPanel.or(missingEnv).first()).toBeVisible({ timeout: 60000 });

  if ((await missingEnv.count()) > 0) {
    await expect(page.getByText('Configuration Required')).toBeVisible();
    await expect(page.locator('main')).toContainText('VITE_SUPABASE_URL');
    await expect(page.locator('body')).not.toContainText('[object Object]');
    return;
  }

  await expect(managerPanel.getByText('Actionable manager queue')).toBeVisible();

  const trendingInsightsCard = await sectionCard(managerPanel, 'Trending Insights');
  await expect.poll(async () => (await trendingInsightsCard.locator('li').count()) > 0, { timeout: 120000 }).toBeTruthy();

  const autonomousActionsCard = await sectionCard(managerPanel, 'Top 3 Autonomous Actions');
  await expect.poll(async () => (await autonomousActionsCard.getByText('CPL:').count()) > 0, { timeout: 120000 }).toBeTruthy();
  await expect(autonomousActionsCard).toContainText('CPL:');
  await expect(autonomousActionsCard).toContainText('CPQL:');
  await expect(autonomousActionsCard).toContainText('Qualified%:');

  const impactRows = autonomousActionsCard.locator('div').filter({ hasText: 'Target gap:' });
  await expect.poll(async () => (await impactRows.count()) > 0, { timeout: 120000 }).toBeTruthy();

  let evidenceRows = 0;
  let insufficientRows = 0;
  const impactRowCount = await impactRows.count();
  for (let i = 0; i < impactRowCount; i += 1) {
    const row = impactRows.nth(i);
    const rowText = await row.innerText();

    expect(rowText).toMatch(/Target gap:/i);
    expect(rowText).toMatch(/Baseline:/i);
    expect(rowText).toMatch(/Target:/i);
    expect(rowText).toMatch(/Method:/i);
    expect(rowText).toMatch(/Sample Size:/i);
    expect(rowText).toMatch(/Confidence:/i);

    const targetGapMatch = rowText.match(/Target gap:\s*([^\n]+)/i);
    const targetGapValue = (targetGapMatch?.[1] || '').trim();
    if (/insufficient_evidence/i.test(targetGapValue)) {
      insufficientRows += 1;
      expect(targetGapValue).toBe('insufficient_evidence');
    } else {
      evidenceRows += 1;
      expect(targetGapValue).toMatch(/[+\-]?\d+(\.\d+)?\s*(%|pp)/i);
    }
  }

  expect(evidenceRows + insufficientRows).toBeGreaterThan(0);

  const humanRequiredTitle = managerPanel.getByText(/Human Required( Actions)?/i).first();
  await expect(humanRequiredTitle).toBeVisible();
  const humanRequiredCard = humanRequiredTitle.locator('xpath=ancestor::div[1]');
  await expect(humanRequiredCard).toBeVisible();

  const experimentPanel = page.locator('section').filter({ hasText: 'Experiment Quality Analyzer' }).first();
  await expect(experimentPanel).toBeVisible({ timeout: 60000 });
  await expect(experimentPanel.getByText('Campaign and adset decision table')).toBeVisible();

  const experimentRows = experimentPanel.locator('tbody tr');
  await expect.poll(async () => (await experimentRows.count()) > 0, { timeout: 120000 }).toBeTruthy();

  const decisionChips = experimentRows.locator('td').first().locator('span');
  await expect.poll(async () => {
    const labels = (await decisionChips.allTextContents()).map((value) => value.trim());
    return labels.length > 0 && labels.every((label) => /^(KEEP|ITERATE|KILL|HOLD LOW SAMPLE)$/.test(label));
  }, { timeout: 120000 }).toBeTruthy();

  await expect(experimentPanel.getByText('HOLD LOW SAMPLE')).toBeVisible();

  const rowCount = await experimentRows.count();
  for (let i = 0; i < rowCount; i += 1) {
    const row = experimentRows.nth(i);
    const confidenceLabel = row.locator('td').nth(1).locator('span');
    await expect(confidenceLabel).toBeVisible();
    const confidenceText = (await confidenceLabel.innerText()).trim();
    expect(/^(HIGH|MEDIUM|LOW|LOW SAMPLE)$/.test(confidenceText)).toBeTruthy();

    const reasonText = (await row.locator('td').nth(3).innerText()).trim();
    expect(reasonText.length).toBeGreaterThan(0);
  }

  const lowQualityTrapBadge = experimentPanel.getByText('Low CPL / Weak Quality', { exact: true });
  if ((await lowQualityTrapBadge.count()) > 0) {
    await expect(lowQualityTrapBadge.first()).toBeVisible();
  }

  const organicReferralInsightsCard = await sectionCard(experimentPanel, 'Organic and Referral Improvement Insights');
  await expect.poll(async () => (await organicReferralInsightsCard.locator('li').count()) > 0, { timeout: 120000 }).toBeTruthy();

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
