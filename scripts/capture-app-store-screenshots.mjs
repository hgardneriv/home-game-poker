/**
 * App Store Connect iPhone 6.5" portraits (1284×2778).
 *
 *   SESSION_SECRET=dev ALLOW_MEMORY_KV=1 ALLOW_TABLE_RIG=1 npm run dev -- -p 3011
 *   SHOT_BASE=http://localhost:3011 node scripts/capture-app-store-screenshots.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(join(root, 'node_modules/playwright'));

const BASE = process.env.SHOT_BASE ?? 'http://localhost:3011';
const OUT = join(root, 'docs/app-store');

/** iPhone 12/13/14 Pro Max logical size ×3 = Connect 6.5" 1284×2778 */
const VIEW = { width: 428, height: 926, deviceScaleFactor: 3 };

async function hideNextBadge(page) {
  await page.addInitScript(() => {
    const hide = () => {
      document.querySelectorAll('nextjs-portal, [data-next-badge-root]').forEach((el) => {
        el.setAttribute('hidden', '');
      });
    };
    const start = () => {
      hide();
      new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
}

async function shot(page, file) {
  await page.waitForTimeout(800);
  const path = join(OUT, file);
  await page.screenshot({ path, animations: 'disabled', fullPage: false });
  console.log('wrote', file);
}

async function createGame(page, body) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const created = await page.evaluate(async (payload) => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: await res.json() };
  }, body);
  if (!created.body.gameId) {
    throw new Error(`create failed: ${JSON.stringify(created)}`);
  }
  return created.body.gameId;
}

async function rig(page, gameId, setup) {
  const rigged = await page.evaluate(async ({ gameId, setup }) => {
    const res = await fetch(`/api/games/${gameId}/rig`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setup }),
    });
    return { status: res.status, body: await res.json() };
  }, { gameId, setup });
  if (rigged.status !== 200) {
    throw new Error(`rig ${setup} failed (${rigged.status}): ${JSON.stringify(rigged.body)}`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VIEW.width, height: VIEW.height },
    deviceScaleFactor: VIEW.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await hideNextBadge(page);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Your name').fill('Harry');
  await page.getByText('Play money only', { exact: false }).waitFor();
  await shot(page, '01-home.png');

  const flopId = await createGame(page, { name: 'Harry', quickPlay: true });
  await page.goto(`${BASE}/game/${flopId}`, { waitUntil: 'networkidle' });
  await page.getByText('Poker Party', { exact: false }).first().waitFor({ timeout: 15_000 });
  await rig(page, flopId, 'pair-twos');
  await page.getByText('Pair of Twos').waitFor({ timeout: 10_000 });
  await shot(page, '02-table-flop.png');

  const actionId = await createGame(page, { name: 'Harry', quickPlay: true });
  await page.goto(`${BASE}/game/${actionId}`, { waitUntil: 'networkidle' });
  await page.getByText('Poker Party', { exact: false }).first().waitFor({ timeout: 15_000 });
  await rig(page, actionId, 'full-house');
  await page.getByText('Full House').waitFor({ timeout: 10_000 });
  await shot(page, '03-made-hand.png');

  const hostId = await createGame(page, {
    name: 'Harry',
    bots: 0,
    config: { startingStack: 20, smallBlind: 1, bigBlind: 2, topUps: 0, topUpDecayPct: 50 },
  });
  await page.goto(`${BASE}/game/${hostId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /invite/i }).waitFor({ timeout: 15_000 });
  await shot(page, '04-invite.png');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
