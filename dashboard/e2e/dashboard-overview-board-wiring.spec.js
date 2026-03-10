import { test, expect } from '@playwright/test';

test('dashboard overview KPI contract renders and remains stable', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');
  await page.getByRole('button', { name: 'Dashboard' }).click();

  const missingEnv = page.getByText('Supabase Environment Variables Missing');
  const dashboardHeading = page.getByRole('heading', { name: 'Dashboard Overview' });

  await expect(dashboardHeading.or(missingEnv).first()).toBeVisible({ timeout: 60000 });

  if ((await missingEnv.count()) > 0) {
    await expect(page.getByText('Configuration Required')).toBeVisible();
    await expect(page.locator('main')).toContainText('VITE_SUPABASE_URL');
    await expect(page.locator('body')).not.toContainText('[object Object]');
    return;
  }

  await expect(page.getByText('Section 1 - Free Group Funnel', { exact: true })).toBeVisible();
  await expect(page.getByText('Section 2 - Phoenix Forum Funnel', { exact: true })).toBeVisible();
  await expect(page.getByText('Section 3 - Attendance', { exact: true })).toBeVisible();
  await expect(page.getByText('Section 4 - Donations', { exact: true })).toBeVisible();
  await expect(page.getByText('Section 5 - Operations', { exact: true })).toBeVisible();

  await expect(page.getByText('Free Meetings', { exact: true })).toBeVisible();
  await expect(page.getByText('New Qualified Leads', { exact: true })).toBeVisible();
  await expect(page.getByText('Cost Per Qualified Lead (CPQL)', { exact: true })).toBeVisible();
  await expect(page.getByText('Phoenix Forum Leads', { exact: true })).toBeVisible();
  await expect(page.getByText('Phoenix CPQL', { exact: true })).toBeVisible();
  await expect(page.getByText('Net New Attendees (Tuesday)', { exact: true })).toBeVisible();
  await expect(page.getByText('Avg Visits (Thursday)', { exact: true })).toBeVisible();
  await expect(page.getByText('# Donations', { exact: true })).toBeVisible();
  await expect(page.getByText('Completed Items', { exact: true })).toBeVisible();

  await expect(page.getByText('AI Summary', { exact: true })).toBeVisible();
  await expect(page.getByText('Must Do Today', { exact: true })).toBeVisible();
  await expect(page.getByText('Leads (3 Suggestions)', { exact: true })).toBeVisible();
  await expect(page.getByText('Attendance (3 Suggestions)', { exact: true })).toBeVisible();
  await expect(page.getByText('Donations (3 Suggestions)', { exact: true })).toBeVisible();
  await expect(page.getByText('Operations (3 Suggestions)', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished looks like:', { exact: false }).first()).toBeVisible();

  const rangeSelect = page.getByTestId('dashboard-time-range-select');
  await expect(rangeSelect).toBeVisible();
  await rangeSelect.selectOption('last_month');
  await expect(page.locator('main')).toContainText('Current period: Month of');

  await expect(page.getByRole('button', { name: 'approve suggestion' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'reject suggestion' }).first()).toBeVisible();

  const addToNotionButton = page.getByRole('button', { name: 'Add to Notion' }).first();
  await expect(addToNotionButton).toBeVisible();
  await addToNotionButton.click();
  const notionModal = page.getByRole('heading', { name: 'Send to Notion' });
  await expect(notionModal).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.locator('body')).not.toContainText('[object Object]');
});
