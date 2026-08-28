import { test, expect, type Page } from '@playwright/test';

async function fillName(page: Page, name: string) {
  await page.getByPlaceholder('Your name').fill(name);
}

test('responses include baseline security headers', async ({ request }) => {
  const res = await request.get('/');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(res.headers()['content-security-policy']).toBe("frame-ancestors 'none'");
});

test('unknown game shows the not-found copy', async ({ page }) => {
  await page.goto('/game/does-not-exist');
  await expect(page.getByText(/Game not found/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Start a new game/i })).toBeVisible();
});

test('quick play lands at a live table', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home Game Poker' })).toBeVisible();
  await expect(page.getByText(/Play money only/i)).toBeVisible();
  await fillName(page, 'Ada');
  await page.getByRole('button', { name: /Play now/i }).click();
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/, { timeout: 15_000 });
  await expect(page.getByText('🃏 Home Game')).toBeVisible();
  await expect(page.getByText('HOME GAME', { exact: true })).toBeVisible();
  await expect(page.getByText('Ada').first()).toBeVisible();
});

test('hosted two-browser night: join, approve, start, refresh keeps the seat', async ({
  browser,
  page,
}) => {
  await page.goto('/');
  await fillName(page, 'Ada');
  await page.getByRole('button', { name: /Host a game/i }).click();
  await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/, { timeout: 15_000 });
  await expect(page.getByText('🃏 Home Game')).toBeVisible();
  const gameUrl = page.url();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(gameUrl);
  await expect(guest.getByRole('heading', { name: /You're invited/i })).toBeVisible();
  await fillName(guest, 'Pat');
  await guest.getByRole('button', { name: 'Take a seat' }).click();
  await expect(guest.getByText(/Waiting for the host/i)).toBeVisible();

  await expect(page.getByText(/Pat wants to join/i)).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('button', { name: /Start game/i })).toBeEnabled();
  await page.getByRole('button', { name: /Start game/i }).click();

  await expect(page.getByText('HOME GAME', { exact: true })).toBeVisible();
  await expect(guest.getByText('HOME GAME', { exact: true })).toBeVisible();
  await expect(guest.getByText('Pat').first()).toBeVisible();

  await guest.reload();
  await expect(guest.getByRole('heading', { name: /You're invited/i })).toHaveCount(0);
  await expect(guest.getByText('HOME GAME', { exact: true })).toBeVisible();
  await expect(guest.getByText('Pat').first()).toBeVisible();

  await guestContext.close();
});

test('guest leave shows the farewell; host end shows standings', async ({ browser, page }) => {
  await page.goto('/');
  await fillName(page, 'Ada');
  await page.getByRole('button', { name: /Host a game/i }).click();
  await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/, { timeout: 15_000 });
  const gameUrl = page.url();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(gameUrl);
  await fillName(guest, 'Pat');
  await guest.getByRole('button', { name: 'Take a seat' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(guest.getByText('HOME GAME', { exact: true })).toBeVisible();

  await guest.getByRole('button', { name: 'Leave' }).click();
  await guest.getByRole('button', { name: 'Really leave?' }).click();
  await expect(guest.getByText('You left the game')).toBeVisible();
  await expect(guest.getByRole('link', { name: /Play again/i })).toBeVisible();

  await page.getByRole('button', { name: /more/i }).click();
  await page.getByRole('button', { name: /End game/i }).click();
  await page.getByRole('button', { name: /Really end the game/i }).click();
  await expect(page.getByText('The host ended the game')).toBeVisible();

  await guestContext.close();
});
