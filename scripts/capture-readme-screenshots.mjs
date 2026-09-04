/**
 * Capture phone-portrait README shots of named demo hands.
 *
 *   ALLOW_TABLE_RIG=1 npm run dev -- -p 3010
 *   node scripts/capture-readme-screenshots.mjs
 *
 * Needs Playwright (this repo or ../home-game-dealers-choice).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadPlaywright() {
  const paths = [
    join(root, 'node_modules/playwright'),
    join(root, '../home-game-dealers-choice/node_modules/playwright'),
  ];
  for (const p of paths) {
    try {
      return require(p);
    } catch {
      /* try next */
    }
  }
  throw new Error('Install playwright (or run from a machine that has home-game-dealers-choice).');
}

const { chromium } = loadPlaywright();
const BASE = process.env.SHOT_BASE ?? 'http://localhost:3001';
const OUT = join(root, 'docs');

const SETUPS = [
  { setup: 'pair-twos', label: 'Pair of Twos', file: 'gameplay.png', closeup: 'hand-label-closeup.png' },
  { setup: 'trips-kings', label: 'Three of a Kind, Kings', file: 'hand-three-kings.png' },
  { setup: 'full-house', label: 'Full House, Aces over Kings', file: 'hand-full-house.png' },
];

async function createAndRig(page, setup) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const created = await page.evaluate(async () => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Harry', quickPlay: true }),
    });
    return res.json();
  });
  if (!created.gameId) throw new Error(`create failed: ${JSON.stringify(created)}`);

  await page.goto(`${BASE}/game/${created.gameId}`, { waitUntil: 'networkidle' });
  await page.getByText('Poker Party', { exact: false }).first().waitFor({ timeout: 15_000 });

  const rigged = await page.evaluate(async ({ gameId, setup }) => {
    const res = await fetch(`/api/games/${gameId}/rig`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setup }),
    });
    return { status: res.status, body: await res.json() };
  }, { gameId: created.gameId, setup });
  if (rigged.status !== 200) {
    throw new Error(`rig ${setup} failed (${rigged.status}): ${JSON.stringify(rigged.body)}`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  // Next.js 16 paints a floating "N" badge over the action bar in `next dev`.
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

  for (const shot of SETUPS) {
    await createAndRig(page, shot.setup);
    await page.getByText(shot.label).waitFor({ timeout: 10_000 });
    // Let Motion settle; screenshot() then freezes remaining WAAPI/CSS.
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(OUT, shot.file),
      animations: 'disabled',
    });
    console.log('wrote', shot.file);

    if (shot.closeup) {
      const box = await page.getByTestId('hero-seat').boundingBox();
      if (!box) throw new Error('hero-seat not found');
      const vp = page.viewportSize();
      const x = Math.max(0, box.x - 12);
      const y = Math.max(0, box.y - 52);
      await page.screenshot({
        path: join(OUT, shot.closeup),
        animations: 'disabled',
        clip: {
          x,
          y,
          width: Math.min((vp?.width ?? 390) - x, box.width + 80),
          height: box.height + 60,
        },
      });
      console.log('wrote', shot.closeup);
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
