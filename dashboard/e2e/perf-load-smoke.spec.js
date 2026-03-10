import { test, expect } from '@playwright/test';

const DASHBOARD_MAX_RENDER_MS = 45000;
const LEADS_MAX_RENDER_MS = 60000;
const ATTENDANCE_MAX_RENDER_MS = 60000;

async function openModule(page, { navButton, heading, readinessLocator, maxRenderMs }) {
  const startedAt = Date.now();

  await page.getByRole('button', { name: navButton }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: maxRenderMs });

  const missingEnv = page.getByText('Supabase Environment Variables Missing');
  await expect(readinessLocator.or(missingEnv).first()).toBeVisible({ timeout: maxRenderMs });

  const renderMs = Date.now() - startedAt;
  expect(renderMs).toBeLessThanOrEqual(maxRenderMs);

  if ((await missingEnv.count()) > 0) {
    await expect(page.getByText('Configuration Required')).toBeVisible();
    await expect(page.locator('main')).toContainText('VITE_SUPABASE_URL');
    return { usedEnvFallback: true, renderMs };
  }

  return { usedEnvFallback: false, renderMs };
}

test('dashboard/leads/attendance load smoke remains usable and crash-safe', async ({ page }) => {
  test.setTimeout(240000);

  await page.goto('/');

  const dashboardReady = page.getByText('Section 1 - Free Group Funnel', { exact: true }).first();
  const dashboardResult = await openModule(page, {
    navButton: 'Dashboard',
    heading: 'Dashboard Overview',
    readinessLocator: dashboardReady,
    maxRenderMs: DASHBOARD_MAX_RENDER_MS,
  });
  if (!dashboardResult.usedEnvFallback) {
    await expect(page.getByText('Section 2 - Phoenix Forum Funnel', { exact: true })).toBeVisible();
    await expect(page.getByText('AI Summary', { exact: true })).toBeVisible();
  }
  await expect(page.locator('body')).not.toContainText('[object Object]');

  const leadsReady = page.locator('section').filter({ hasText: 'Experiment Quality Analyzer' }).first();
  await openModule(page, {
    navButton: 'Leads',
    heading: 'Leads Overview',
    readinessLocator: leadsReady,
    maxRenderMs: LEADS_MAX_RENDER_MS,
  });
  await expect(page.locator('body')).not.toContainText('[object Object]');

  const attendanceReady = page.getByText('Unique Tue', { exact: true }).first();
  const attendanceResult = await openModule(page, {
    navButton: 'Attendance',
    heading: 'Attendance Overview',
    readinessLocator: attendanceReady,
    maxRenderMs: ATTENDANCE_MAX_RENDER_MS,
  });
  if (!attendanceResult.usedEnvFallback) {
    await expect(page.getByText('Unique Thu', { exact: true })).toBeVisible();
    await expect(page.getByText('Repeat Rate Tue', { exact: true })).toBeVisible();
    await expect(page.getByText('Repeat Rate Thu', { exact: true })).toBeVisible();
  }
  await expect(page.locator('body')).not.toContainText('[object Object]');
});
