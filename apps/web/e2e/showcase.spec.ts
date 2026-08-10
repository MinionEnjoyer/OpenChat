import { expect, test } from '@playwright/test';

test('public server showcase receives its deterministic realtime update', async ({ page }) => {
  await page.goto('/showcase.html?scenario=public-server');
  await expect(page.getByRole('heading', { name: 'Welcome to #general' })).toBeVisible();
  await expect(page.getByText('Upload received. The preview and shared link both render inline.')).toBeVisible();
  await expect(page.getByText('Sky is typing…')).toBeVisible();
});

test('private call, synchronized watch party, and multi-window sharing render in Chromium', async ({ page }) => {
  await page.goto('/showcase.html?scenario=private-call');
  await expect(page.getByText('Private call · encrypted transport')).toBeVisible();
  await expect(page.getByRole('button', { name: /Disconnect/i })).toBeVisible();

  await page.getByRole('link', { name: 'Watch party' }).click();
  await expect(page.getByText('Watch party · 4 viewers synchronized')).toBeVisible();
  await expect(page.getByText('OpenChat Release Night')).toBeVisible();

  await page.getByRole('link', { name: 'Screen sharing' }).click();
  await expect(page.getByText('alex is sharing 2 windows')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(2);
});

test('showcase remains horizontally contained on mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only layout assertion');
  await page.goto('/showcase.html?scenario=watch-party');
  await expect(page.getByText('Watch party · 4 viewers synchronized')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
