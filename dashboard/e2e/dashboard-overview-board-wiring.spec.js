import { test, expect } from '@playwright/test';

test('dashboard overview board manager wiring remains stable', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Dashboard' }).click();

  const missingEnv = page.getByText('Supabase Environment Variables Missing');
  const boardCard = page.locator('.glass-panel').filter({ hasText: 'Board of Directors AI Manager' }).first();
  await expect(boardCard.or(missingEnv).first()).toBeVisible({ timeout: 60000 });

  if ((await missingEnv.count()) > 0) {
    await expect(page.getByText('Configuration Required')).toBeVisible();
    await expect(page.locator('main')).toContainText('VITE_SUPABASE_URL');
    await expect(page.locator('body')).not.toContainText('[object Object]');
    return;
  }

  await expect(page.getByRole('heading', { name: 'AI Manager Summary by Section' })).toBeVisible();
  await expect(boardCard.getByText('Board of Directors AI Manager', { exact: true })).toBeVisible();
  await expect(boardCard.getByText('Module Summary (AI-Generated)', { exact: true })).toBeVisible();
  await expect(boardCard.getByText('Autonomous Actions', { exact: true })).toBeVisible();
  await expect(boardCard.getByText('For You to Do', { exact: true })).toBeVisible();

  const summaryRows = boardCard.locator('li');
  const summaryFallback = boardCard.getByText('No summary generated yet for this module.');
  expect((await summaryRows.count()) > 0 || (await summaryFallback.count()) > 0).toBeTruthy();

  const doThisButtons = boardCard.getByRole('button', { name: 'Do This' });
  const noAutonomousFallback = boardCard.getByText('No runnable autonomous actions available for this module yet.');
  expect((await doThisButtons.count()) > 0 || (await noAutonomousFallback.count()) > 0).toBeTruthy();

  const humanActionRows = boardCard.locator('div').filter({ hasText: 'Send to Notion' });
  const noHumanFallback = boardCard.getByText('No human-only suggestions generated yet.');
  expect((await humanActionRows.count()) > 0 || (await noHumanFallback.count()) > 0).toBeTruthy();

  const refreshAnalysisButton = boardCard.getByRole('button', { name: 'Refresh Analysis' });
  await expect(refreshAnalysisButton).toBeVisible();
  await refreshAnalysisButton.click();

  await expect.poll(async () => {
    if ((await boardCard.getByText('Analyzing...').count()) > 0) return true;
    if ((await boardCard.getByText('Analysis pending').count()) > 0) return true;
    if ((await boardCard.getByText(/^Updated /).count()) > 0) return true;
    if ((await boardCard.getByText(/Analysis failed:/).count()) > 0) return true;
    return false;
  }, { timeout: 120000 }).toBeTruthy();

  await expect(boardCard.getByText('Module Summary (AI-Generated)', { exact: true })).toBeVisible();
  await expect(boardCard.getByText('Autonomous Actions', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('[object Object]');
});
