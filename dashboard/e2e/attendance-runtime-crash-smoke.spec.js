import { test, expect } from '@playwright/test';

test('attendance route opens without runtime initialization errors', async ({ page }) => {
  test.setTimeout(180000);

  const runtimeErrors = [];
  page.on('pageerror', (err) => runtimeErrors.push(`pageerror: ${String(err?.message || err)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtimeErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Attendance' }).click();
  await expect(page.getByRole('heading', { name: 'Attendance Overview' })).toBeVisible({ timeout: 60000 });

  // Let deferred hooks/render settle so init-order exceptions surface.
  await page.waitForTimeout(3000);

  const initErrors = runtimeErrors.filter((line) =>
    /before initialization|ReferenceError|Cannot access/i.test(line),
  );
  expect(initErrors, `Runtime initialization errors found:\n${initErrors.join('\n')}`).toEqual([]);
});

