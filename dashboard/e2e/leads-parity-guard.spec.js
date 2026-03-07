import { test, expect } from '@playwright/test';

test('leads parity guard panel renders with warning-safe states', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leads' }).click();

  // The parity/audit guard content lives in the expandable data explorer section.
  const explorerToggle = page.getByText('Detailed Data Explorer').first();
  await expect(explorerToggle).toBeVisible({ timeout: 30000 });
  await explorerToggle.click();

  const showSignoffButton = page.locator('button:visible', { hasText: 'Show Signoff' });
  if ((await showSignoffButton.count()) > 0) {
    await showSignoffButton.first().click();
  }

  const signoffHeading = page.locator('p:visible', { hasText: 'Weekly Signoff (Decision Gate)' }).first();
  await expect(signoffHeading).toBeVisible({ timeout: 45000 });

  // Summary badges/cards should render in the parity guard section.
  await expect(page.locator('p:visible', { hasText: 'Campaign CPA Scope' }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('p:visible', { hasText: 'Ideal Member Metric' }).first()).toBeVisible({ timeout: 30000 });
  const auditSummary = page.locator('p:visible', { hasText: /\bpass\b[\s\S]*\bwarn\b[\s\S]*\bfail\b/i }).first();
  await expect(auditSummary).toBeVisible({ timeout: 30000 });

  // Expand checks, then verify we have at least one row or a fallback state.
  const toggleAuditChecks = page.locator('button:visible', { hasText: /View Audit Checks|Hide Audit Checks/i }).first();
  await expect(toggleAuditChecks).toBeVisible({ timeout: 30000 });
  await toggleAuditChecks.click();

  const checkRows = page.locator('tbody tr:visible');
  const fallbackState = page.getByText(/No signoff available|No audit checks/i);
  const hasRows = (await checkRows.count()) > 0;
  const hasFallback = (await fallbackState.count()) > 0;
  expect(hasRows || hasFallback, 'Expected at least one audit row or fallback state in parity guard panel').toBeTruthy();

  // Guard against accidental object rendering anywhere on the page.
  await expect(page.locator('body')).not.toContainText('[object Object]');

  // If warning/fail states exist, a warning indicator should be visible.
  const auditSummaryText = (await auditSummary.textContent()) || '';
  const match = auditSummaryText.match(/(\d+)\s*pass[\s\S]*?(\d+)\s*warn[\s\S]*?(\d+)\s*fail/i);
  const warnCount = match ? Number(match[2]) : 0;
  const failCount = match ? Number(match[3]) : 0;
  const hasWarnOrFailCounts = Number.isFinite(warnCount) && Number.isFinite(failCount) && (warnCount > 0 || failCount > 0);

  const warningIndicators = page.locator('span:visible, p:visible', { hasText: /Top warning:|Warning|Alert|Block/i });
  if (hasWarnOrFailCounts) {
    await expect(warningIndicators.first()).toBeVisible({ timeout: 30000 });
  }
});
