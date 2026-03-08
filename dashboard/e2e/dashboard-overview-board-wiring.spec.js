import { test, expect } from '@playwright/test';

async function sectionCard(panel, title) {
  const titleNode = panel.getByText(title, { exact: true }).first();
  await expect(titleNode).toBeVisible();
  return titleNode.locator('xpath=ancestor::div[1]');
}

async function assertBoardContractSections(boardCard) {
  const summarySection = await sectionCard(boardCard, 'Module Summary (AI-Generated)');
  const summaryRows = summarySection.locator('li');
  const summaryFallback = summarySection.getByText('No summary generated yet for this module.');
  expect((await summaryRows.count()) > 0 || (await summaryFallback.count()) > 0).toBeTruthy();

  const autonomousSection = await sectionCard(boardCard, 'Autonomous Actions');
  const runnableControls = autonomousSection.getByRole('button', { name: /Do This|Running\.\.\./ });
  const noAutonomousFallback = autonomousSection.getByText('No runnable autonomous actions available for this module yet.');
  expect((await runnableControls.count()) > 0 || (await noAutonomousFallback.count()) > 0).toBeTruthy();

  const humanSection = await sectionCard(boardCard, 'For You to Do');
  const notionButtons = humanSection.getByRole('button', { name: 'Send to Notion' });
  const noHumanFallback = humanSection.getByText('No human-only suggestions generated yet.');
  expect((await notionButtons.count()) > 0 || (await noHumanFallback.count()) > 0).toBeTruthy();
}

async function waitForAnalysisStatus(boardCard) {
  await expect.poll(async () => {
    if ((await boardCard.getByText('Analyzing...').count()) > 0) return true;
    if ((await boardCard.getByText('Analysis pending').count()) > 0) return true;
    if ((await boardCard.getByText(/^Updated /).count()) > 0) return true;
    if ((await boardCard.getByText(/Analysis failed:/).count()) > 0) return true;
    return false;
  }, { timeout: 120000 }).toBeTruthy();
}

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
  await assertBoardContractSections(boardCard);

  // Malformed contract-equivalent response should not break section rendering.
  await page.route('**/functions/v1/ai-module-analysis', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      analysis: {
        summary: { invalid: true },
        autonomous_actions: 'invalid',
        human_actions: { invalid: true },
      },
    }),
  }));
  const refreshAnalysisButton = boardCard.getByRole('button', { name: 'Refresh Analysis' });
  await expect(refreshAnalysisButton).toBeVisible();
  await refreshAnalysisButton.click();
  await waitForAnalysisStatus(boardCard);
  await assertBoardContractSections(boardCard);

  // Remote-unavailable path should also keep contract sections visible.
  await page.unroute('**/functions/v1/ai-module-analysis');
  await page.route('**/functions/v1/ai-module-analysis', (route) => route.abort());
  await refreshAnalysisButton.click();
  await waitForAnalysisStatus(boardCard);
  await assertBoardContractSections(boardCard);
  await page.unroute('**/functions/v1/ai-module-analysis');

  await expect(boardCard.getByText('Module Summary (AI-Generated)', { exact: true })).toBeVisible();
  await expect(boardCard.getByText('Autonomous Actions', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('[object Object]');
});
