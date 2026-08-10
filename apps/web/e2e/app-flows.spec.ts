import { expect, test } from '@playwright/test';
import { installOpenChatHarness } from './mockOpenChat';

test.beforeEach(async ({ page }) => {
  await installOpenChatHarness(page);
  await page.goto('/');
  await expect(page.getByText('Friends', { exact: true }).first()).toBeVisible();
});

test('switches servers and renders messages, embeds, and selected-server state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Covered by the dedicated mobile-shell flow');
  await page.getByTitle('OpenChat Community').click();
  await expect(page.getByText('# general', { exact: true }).first()).toBeVisible();
  await expect(page.locator('iframe[title="YouTube video"]')).toHaveAttribute('src', /youtube\.com\/embed\/dQw4w9WgXcQ/);
  await expect(page.getByTitle('OpenChat Community')).toHaveAttribute('aria-current', 'page');

  await page.getByTitle('Development Lab').click();
  await expect(page.getByText('Development Lab', { exact: true })).toBeVisible();
  await expect(page.getByText('# general', { exact: true }).first()).toBeVisible();
  await expect(page.getByTitle('Development Lab')).toHaveAttribute('aria-current', 'page');
});

test('restores the visible message after changing channels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Covered by desktop navigation; mobile uses the same history hook');
  await page.getByTitle('OpenChat Community').click();
  const scroller = page.locator('.msg-scroll');
  await expect(page.locator('[data-message-id="general-60"]')).toBeAttached();
  await expect(scroller).toHaveAttribute('data-resume-anchor', 'newest');
  await expect.poll(() => scroller.evaluate((element) => (
    Math.round(element.scrollHeight - element.scrollTop - element.clientHeight)
  ))).toBeLessThanOrEqual(1);
  await scroller.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 1_200);
  });
  let previousHeight = 0;
  let stableHeightSamples = 0;
  await expect.poll(async () => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const height = await scroller.evaluate((element) => element.scrollHeight);
    stableHeightSamples = height === previousHeight ? stableHeightSamples + 1 : 0;
    previousHeight = height;
    return stableHeightSamples;
  }).toBeGreaterThanOrEqual(2);
  await scroller.dispatchEvent('scroll');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('openchat.channelScroll.v1') || '{}').general?.messageId ?? ''))
    .toMatch(/^general-\d+$/);

  await page.getByText('# development', { exact: true }).click();
  await expect(page.locator('[data-message-id="development-45"]')).toBeAttached();
  // Navigation performs one final synchronous capture and storage is intentionally debounced.
  await page.waitForTimeout(180);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('openchat.channelScroll.v1') || '{}').general as { messageId: string; offset: number });
  await page.getByText('# general', { exact: true }).click();
  await expect(scroller).toHaveAttribute('data-resume-anchor', saved.messageId);
  await expect.poll(() => scroller.evaluate((element, position) => {
    const row = element.querySelector<HTMLElement>(`[data-message-id="${position.messageId}"]`)!;
    return Math.abs(Math.round(row.getBoundingClientRect().top - element.getBoundingClientRect().top) - position.offset);
  }, saved)).toBeLessThanOrEqual(1);
});

test('centers search and notification panels and keeps alert badges above their icons', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Mobile centering is covered by the dedicated mobile-shell flow');
  await page.getByTitle('OpenChat Community').click();
  await page.getByTitle('Search messages').click();
  const search = page.getByRole('dialog');
  await expect(search).toBeVisible();
  await expect(search.getByPlaceholder('Search messages or usernames…')).toBeVisible();
  await assertCentered(page, search);
  await search.getByPlaceholder('Search messages or usernames…').fill('morgan');
  await expect(search.getByText('Morgan wrote the searchable release note')).toBeVisible();
  await page.keyboard.press('Escape');

  const notifyButton = page.getByTitle('Notifications');
  const badge = notifyButton.locator('.notification-count-badge');
  await expect(badge).toHaveText('2');
  expect(Number(await badge.evaluate((element) => getComputedStyle(element).zIndex))).toBeGreaterThan(
    Number(await notifyButton.locator('img').evaluate((element) => getComputedStyle(element).zIndex)),
  );
  await notifyButton.click();
  const notifications = page.getByRole('dialog');
  await expect(notifications.getByText('Creator Hub')).toBeVisible();
  await assertCentered(page, notifications);
});

test('uploads a file and opens the sticker picker from the composer tray', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop composer flow; mobile layout is covered separately');
  await page.getByTitle('OpenChat Community').click();
  await page.getByRole('button', { name: 'Chat options' }).click();
  await expect(page.getByRole('menu', { name: 'Chat options' })).toBeVisible();
  await page.locator('.chat-options input[type="file"]').setInputFiles({
    name: 'browser-proof.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('browser proof'),
  });
  await expect(page.getByText('browser-proof.txt')).toBeVisible();

  await page.locator('.chat-options-backdrop').click({ position: { x: 2, y: 2 } });
  await page.getByRole('button', { name: 'Chat options' }).click();
  await page.getByRole('menuitem', { name: /Choose a sticker/ }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a sticker' });
  await expect(picker.getByAltText('Wave')).toBeVisible();
  await assertCentered(page, picker);
  await picker.getByAltText('Wave').click();
  await expect(picker).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const messages = (window as typeof window & { __openChatHarnessWsMessages?: string[] }).__openChatHarnessWsMessages ?? [];
    return messages.some((item) => item.includes('sticker::/api/media/sticker-1/raw'));
  })).toBe(true);
});

test('notification invitations and friend requests use real action paths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop notification action flow');
  await page.getByTitle('Notifications').click();
  const dialog = page.getByRole('dialog');
  const joinRequest = page.waitForRequest((request) => request.url().endsWith('/api/server-invitations/invite-1/accept') && request.method() === 'POST');
  await dialog.getByRole('button', { name: 'Join' }).click();
  await joinRequest;
  await expect(page.getByText('Joined Creator Hub')).toBeVisible();
  const friendRequest = page.waitForRequest((request) => request.url().endsWith('/api/friends/requests/friend-request-1/accept') && request.method() === 'POST');
  await dialog.getByRole('button', { name: 'Accept' }).click();
  await friendRequest;
  await expect(page.getByText('You are now friends with Morgan')).toBeVisible();
});

test('mobile shell stays within the viewport and centered panels remain reachable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only layout assertion');
  await page.locator('.mobile-nav-button').click();
  await page.getByTitle('OpenChat Community').click();
  await page.getByTitle('Search messages').click();
  await assertCentered(page, page.getByRole('dialog'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

async function assertCentered(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((box!.x + box!.width / 2) - viewport!.width / 2)).toBeLessThan(3);
  expect(Math.abs((box!.y + box!.height / 2) - viewport!.height / 2)).toBeLessThan(3);
}
