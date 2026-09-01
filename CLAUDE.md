@AGENTS.md

# Poker Party — Texas Hold'em — session handoff & architecture notes

Link-based multiplayer Texas Hold'em (PokerNow-style) built July 2026. Fully working and **deployed to production**. This file is the context a future session needs to continue the work.

## Next session pickup (2026-09-01)

**iPhone app is the current product track.** Follow [docs/iphone-app-plan.md](docs/iphone-app-plan.md) — do not improvise a React Native rewrite or start dealer’s-choice iOS. Engine CRAP/mutation extract **done**; remaining `engine.ts` survivors are mostly equivalent fail-message strings — do not reopen a kill-every-mutant campaign.

**Git**
- Branch: **`iphone-app`** (pushed). Do **not** merge to `master` until Harry asks.
- **`master` is still the Git production branch** (vercel[bot] on push). The **live site is currently `iphone-app`**, shipped with `vercel deploy --prod`. **Do not push `master`** unless Harry wants to revert the alias to the old website.
- Capacitor Path A stays on this branch. Working tree should be clean when switching to `master`.
- Public lobby stays deferred.

**Live site (beta):** https://home-game-poker-kappa.vercel.app — play-money copy, `/privacy`, table-fit lock, last-table resume, engine extract. Same Redis as before.

**Next engineering action:** Phase 3 — APNs turn-push. Phases 0–2 are **done** (2026-09-01): Developer Program, table fit, force-quit cookie proof. Capacitor WebView loads production. Do not create the App Store Connect listing yet.

**Parked:** Next stay on `16.2.12` until **16.3.3**; mutation Phase 3 (kill every engine survivor) skipped.

**Mental model:** Capacitor WKWebView loads **production** (`capacitor.config.ts`). Testers and the device app hit the same alias. See [iPhone](#iphone-capacitor-path-a--in-progress).

## Audits

- [2026-08-24 code, security & mobile-readiness audit](docs/audits/2026-08-24-code-security-mobile-audit.md) — code-structure/complexity, security findings (ranked), coverage + mutation-testing (CRAP-style) risk read, and the iPhone-app gap analysis. Includes a reusable methodology section for re-running the same three-pronged audit on another repo.

## Deployment (live)

- **Production alias:** https://home-game-poker-kappa.vercel.app — **as of 2026-08-31 this is `iphone-app` via `vercel deploy --prod`**, not a Git deploy from `master`. Pushing `master` would overwrite the beta. Further `iphone-app` website drops: `vercel deploy --prod` from this branch (Git does not promote `iphone-app`).
- Vercel project `home-game-poker` under team `hgardnerivs-projects`. GitHub is connected: pushing **`master`** still triggers a production Git deploy. Run tests before pushing. Do **not** also run `vercel deploy --prod` after a `master` Git deploy unless that Git deploy failed.
- Storage: Upstash Redis via Vercel Marketplace, resource `home-game-poker-redis`, **free plan** — upgrade to pay-as-you-go if game nights hit command limits (each SSE-connected client polls the version key every 500ms server-side).
- Env vars (values live in Vercel, never in the repo): `SESSION_SECRET` (prod + preview), `KV_REST_API_URL`, `KV_REST_API_TOKEN`. ⚠️ The Marketplace names Redis vars `KV_REST_API_*`, NOT `UPSTASH_REDIS_REST_*` — `src/server/kv.ts` accepts both.
- Preview deployments sit behind Vercel Authentication (not shareable with friends) — share/test on production.
- Local dev without Redis env uses an in-memory KV automatically (single-process only). `vercel env pull .env.local` for real Redis locally.

## Architecture (all decisions were deliberate — see rationale inline in code)

- **Pure engine** (`src/engine/`): deterministic state machine, zero deps, no `Date.now()`/RNG inside — both injected via `ctx = { now, randInt }`. `applyAction(state, action, ctx)` never mutates its input (structuredClone at entry) and is a **thin switch** to per-action handlers (`applyTimeout`, `applyTopUp`, `applyPlayAgain`, …). Hand loop helpers: `postBlind`, `runOutBoard`, `openNextStreet`, `markBusts`, `parkAfterHand`, `foldOutOfLiveHand`. `getLegalActions` is shared by server validation AND the client ActionBar so they can never disagree. Hand-rolled 7-card evaluator (best-of-21, packed integer scores).
  - Rules covered & tested: heads-up blinds (button = SB, acts first preflop / last postflop), BB option, min-raise = last full raise size, short all-ins don't reopen betting (cumulative shorts do), layered side pots + uncalled-bet refunds, dead-button rotation (`computePositions` in `seating.ts`), blind-arc exclusion for mid-orbit joiners, showdown order + auto-muck, odd chip to first winner left of button.
  - **Top-ups (rebuys)**: busted players re-buy on a decaying schedule — `topUpAmount` in `src/engine/topup.ts` (pure, shared by engine/sweep/client like `getLegalActions`): first = 60% of buy-in, each next shrinks by `config.topUpDecayPct`, amounts < 1 BB never offered. Config `topUps` (default 0 / off, host can raise it; 0 disables) + `topUpDecayPct` (default 50) are host-form settable; **quick play forces `topUps: 0`** at the create route (`app/api/games/route.ts`). A game-deciding bust holds `hand-over` open ~20s (`settleOrHold` in engine.ts) so the loser can re-enter; busted bots auto-rebuy via the sweep after a think delay (`player.topUpAt`). `Player.totalBuyIn` drives game-over net math and the fuzz conservation invariant (Σ totalBuyIn). Legacy KV states work via nullish defaults. User confirmed the dead-button rule stays as-is (button may sit on an empty/busted seat for one hand — intentional).
- **Bots** (`src/engine/bot.ts`): a bot is a Player with `isBot` + personality `{tightness, aggression, bluffFreq}`. Decides from a narrow `BotView` built from redacted data (can't cheat by construction). Defense curve: `required = min(0.72, 0.18 + potOdds*0.45 + tightness*0.1)`; flush/open-ended draw awareness on flop/turn; probabilistic bluff-catching. Tuning these constants is how you make bots looser/tighter.
- **Storage** (`src/server/kv.ts`, `store.ts`): two Redis keys per game (`g:{id}:v` version, `g:{id}:s` state JSON, 24h TTL). ALL mutations flow through `withGame()` → read → sweep → user action → Lua-CAS write → retry (max 4). Version is monotonic; clients drop stale frames. Production without Redis creds throws unless `ALLOW_MEMORY_KV=1` (Playwright `next start` only).
- **Rate limits** (`src/server/ratelimit.ts`): Upstash fixed-window on create (10/hour/IP), join (20/min/IP), action/host/seats (30/min/player), SSE **connection opens** (30/min/IP) — not the 500ms poll. No Redis → no-op (local/e2e). **`NODE_ENV === 'development'` also no-ops** so `.env.local` Redis does not share the production 10/hour create bucket with the sim. 429 JSON `{ error: { code: 'rate-limited' } }`.
- **Serverless timing** (`src/server/sweep.ts`): no background processes. Every state read runs the sweep: busted bot's `topUpAt` due → auto rebuy (checked first and re-validated in the sweep so a rejected due-action can never wedge the loop — `store.ts` breaks on the first failed sweep action); expired turn → timeout action (time bank once, then auto check/fold + away); bot's `botActAt` due → `decideForBot`; `nextHandAt` due → next hand. SSE ticks make these fire within ~1s. If no client is connected the game freezes until someone returns — intentional.
- **Realtime**: SSE (`stream/route.ts`) — polls the version key every 500ms, pushes full redacted state with `id:<version>`, heartbeat 15s, self-closes at 240s (EventSource auto-reconnects with Last-Event-ID). WebSockets were deliberately rejected (no Upstash pub/sub over REST → WS would still poll). Client (`useGame.ts`): SSE + 10s safety poll + visibilitychange resync. ⚠️ A stream opened before the player joined is authenticated as nobody — after `join()` the client MUST reconnect the stream, and `applyState` refuses to let an anonymous frame downgrade an identified session (this fixed a nasty "guest bounced to join screen" bug).
- **Identity** (`src/server/identity.ts`): per-game httpOnly cookie `hg_{gameId}` = `{playerId}.{HMAC-SHA256(playerId:gameId, SESSION_SECRET)}`. No accounts; refresh restores the seat.
- **Redaction** (`src/server/redact.ts`): `ClientGameState` is a DISTINCT type from `GameState` so the compiler prevents ever serializing the deck / others' hole cards. Keep it that way.
- **UI**: `GameRoom` → mode switch (join / waiting / left-kicked farewell / game-over standings / table). Table seats absolutely positioned from two coordinate maps (portrait/landscape via `useOrientation`), view rotated so YOUR seat is bottom-center. Motion animations; events ring buffer (cap 100) drives history + toasts. Numeric form fields keep raw strings while editing (mobile clear-field bug) — parse on submit.
- **Visual design** (Sept 2026 Poker Party pass — iterate locally before prod): mahogany wood rail (layered CSS gradients), punchier emerald felt with gold wash + four-suit + confetti tile (static data-URI SVG in `Table.tsx` — no filter/blur), double gold pinstripe, gold "POKER PARTY / TEXAS HOLD'EM" marquee with radial glow. Logo / house-and-glyph icon still to follow. Cards are responsive SVG (`SIZE_CLASSES` in `PlayingCard.tsx`, bigger on `sm:`), ivory faces with mirrored corner indexes + ghost pip, navy lattice back with gold spade medallion. Face-up cards sit clear of nameplates (`showCards` margin in `Seat.tsx`); face-down backs tuck behind. Hero seat gets a gold-trimmed plaque.
- **Play-test UX (July 2026)**: live made-hand label floats on the felt above the cards (`src/engine/hand-label.ts`, pure + client-safe, hold'em card counts 2/5/6/7 only — preflop is just the pocket-pair check; rendered in `Seat.tsx`, emerald = live vs amber = showdown result; same placement/size as dealer's choice). Last-used name prefills create/join via `useRememberedName` (localStorage `hg:playerName`, `useSyncExternalStore` for clean hydration).
- ⚠️ **iOS GPU constraint**: NEVER add `backdrop-filter`/CSS `filter` to animated or frequently-repainting table elements, and animate transforms, not layout properties (the timer bar uses `scaleX`). A per-seat backdrop-blur + `width` animation combo caused full-device black-screen GPU hangs on an iPhone 14 (older iOS 16 WebKit). Static background gradients/data-URI SVGs are fine (rasterized once). Audio: one shared `AudioContext` unlocked on first `pointerdown` (`GameRoom.tsx`) — never create per-event contexts (they start suspended on iOS and leak).

## Testing

`npm test` — 358 Vitest tests (engine/server + HTTP acceptance). The engine suite is the correctness spine (every rule edge above has a scenario test), plus **fuzz**: 150 seeded complete games mixing bot and random-legal actors with invariants (chip conservation vs Σ totalBuyIn, top-up schedule adherence, no negative stacks, termination) checked after every action; the fuzz harness randomly injects top-ups. `Table` harness in `src/engine/test-utils.ts` (zeroRand → deterministic button at seat 0; `rig()` to plant hole/board cards; `topUp()`). Server CAS concurrency tests use `MemoryKV`. HTTP black-box tests in `src/app/api/games/http.acceptance.test.ts` call the exported route handlers (cookies, redaction, 429s). When touching engine logic, add a scenario test first; the fuzz will catch conservation breaks.

`npm run coverage` — `@vitest/coverage-v8` over `src/engine`, `src/server`, `src/app/api` (UI is Playwright, not line coverage). Floors: statements 93 / branches 82 / functions 90 / lines 94. 2026-08-31 after quality pass: **96.87% / 90.79% / 97.90% / 98.03%**.

`npm run test:e2e` — Playwright against `next start` on port 3100 with `SESSION_SECRET` + `ALLOW_MEMORY_KV=1` (in-memory store even if `.env.local` has Redis). Journeys in `e2e/journeys.spec.ts`.

**Mutation testing** (added July 2026): `npx stryker run` — config in `stryker.conf.json` (mutates `src/engine` + `src/server`; `bot.ts` and `demo-hands.ts` excluded — personality constants and screenshot fixtures are not spec). Uses `vitest.stryker.config.ts`, which excludes the fuzz suite and HTTP acceptance (SSE reads) from mutant checking. Fresh **2026-08-31** after `applyAction` extract: **90.36% overall / engine 91.54%** (`engine.ts` **86** survivors + 1 no-cov — mostly `StringLiteral` on `fail()` messages; tests assert `code`). Cache-bust with `rm -rf reports .stryker-tmp`. Full run ≈ 40s.

Browser-automation caveat: an occluded Chrome window gets no rAF, so Motion animations freeze at initial values in screenshots — that's the tool environment, not a bug.

CI: `.github/workflows/ci.yml` runs `tsc --noEmit`, lint, coverage (with floors), and Playwright on PRs and `master`.

## Conventions & gotchas

- Bet/raise amounts are **"raise TO" street totals**, not increments.
- `globalThis.__gameKV` singleton survives dev HMR — after editing `kv.ts`, restart `next dev`.
- `next.config.ts` pins `turbopack.root` (stray lockfile in $HOME confuses inference).
- All API routes are `dynamic = 'force-dynamic'`, Node runtime (never edge). Stream route sets `maxDuration = 300`.
- Git-triggered production deploys on push to **`master` only**. The 2026-08-31 friend beta is a CLI prod deploy from `iphone-app`. Run tests before pushing; `vercel deploy --prod` from `iphone-app` to refresh that beta. Do not push `master` during the beta unless reverting.
- Next stay on `16.2.12` until the **16.3.3** security release (scheduled 2026-08-26); do not bump mid-cycle.
- `.claude/settings.local.json` is gitignored (personal permissions). `.env.local` / `.vercel` never committed.

## Roadmap (user-confirmed direction)

0. **iPhone app (Capacitor Path A)** — current track. Plan: [docs/iphone-app-plan.md](docs/iphone-app-plan.md). Poker first; dealer’s choice iOS only after poker is submitted or in review.
1. **Public lobby with matchmaking** — architecture is ready: rooms are self-contained under `g:{id}:*`; a lobby is an index (e.g. `lobby:open` sorted set) + a browse page + a create-path flag. Bots need zero changes. The game-over screen's "Play again" is where "Back to lobby" will live.
2. Possible smaller items: escalating blinds option, run-it-twice, four-color deck, sounds toggle, bot difficulty setting, dimmed "dead button" visual hint when the button sits on an empty/busted seat (user declined for now but may revisit if friends find it confusing). (Top-ups/rebuys: DONE July 2026.)
   **Bot-game auto-end (2026-08-01, user-requested, ported from home-game-dealers-choice)**: when bots are seated and no human can play another hand (every human busted with no rebuy left — instant in quick play's `topUps: 0`), `finishHand` ends the game with `endedReason: 'humansOut'` and crowns the chip-leader bot, instead of making the human watch bots finish. A human with a top-up remaining still holds the table open. Engine `humansAreDone()` + GameOverScreen "Out of chips — game over" copy; tests in `topup-flow.test.ts`.
3. User play-tests with real friends and reports tweaks — expect rapid small iterations (bot tuning constants, UX affordances). After engine changes, consider a `/mutate`-style hardening pass (see Testing) to keep the kill rate up.

## iPhone (Capacitor Path A — in progress)

Native shell loads **`https://home-game-poker-kappa.vercel.app`** (`capacitor.config.ts`) so a physical iPhone can reach the live site. `@capacitor/*` is dynamically imported from [`src/hooks/native.ts`](src/hooks/native.ts) and no-ops in the browser.

- `useGame` resyncs on Capacitor `appStateChange` (iOS background kills SSE) as well as `visibilitychange`.
- Invite uses the native share sheet when present; your-turn also fires a haptic.
- In-app copy: "Play money only — chips have no cash value." Privacy: `/privacy`.
- Phase 1 simulator smoke **done** (2026-08-29). Table header uses `safe-area-inset-top` + `viewport-fit=cover`. Engine extract + store-shell **done** 2026-08-31.
- Phase 2 cookie proof **done** (2026-09-01). App icon is the house/spade family. Still needed before App Store: Phases 3–4 (APNs, screenshots).
- `npm run ios` / `npm run ios:sync`. Do not treat a naked WebView as shippable (Guideline 4.2) until push is in.
- Xcode — simulator runtime target **iOS 26.5** (not watch/tv/vision).
