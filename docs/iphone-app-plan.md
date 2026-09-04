# Poker Party — iPhone app plan

Living plan for the Capacitor iOS app. Work stays on branch `iphone-app` until a slice is ready for review. **Do not merge to `master` until Harry asks.** **`master` is still the Git production branch**; the **live alias is currently this branch** (CLI `vercel deploy --prod`, 2026-08-31 friend beta). **Do not push `master`** during the beta. **Merge gate:** `capacitor.config.ts` already points at production (no `cleartext` / no `loggingBehavior: 'none'`). Do not ship a localhost WebView. Still **do not merge to `master` until Harry asks.**

**Sequencing (locked):** ship this app for `home-game-poker` first. `home-game-dealers-choice` is out of scope until poker is submitted (or clearly in App Store review). Copy the proven shell later (separate bundle id, listing, and `dc:` Redis prefix).

Related background: [2026-08-24 audit §4](audits/2026-08-24-code-security-mobile-audit.md#4-iphone-app-gap-analysis).

---

## Decisions (do not reopen unless blocked)

| Decision | Choice |
|---|---|
| Architecture | **Path A** — Capacitor WKWebView wrapping the Next site. Not a React Native rewrite. **Official host:** `https://holdem.pokerparty.app`. The `kappa` Vercel alias still works. Localhost was simulator-only (Phase 1). |
| Bundle id | **Locked:** `app.pokerparty.holdem` (Hold’em) / `app.pokerparty.dealerschoice` (Dealer’s Choice). Reverse-DNS of `{game}.pokerparty.app`. Do not change a bundle id after the first App Store Connect record. |
| Web vs native | Same Next bundle. `@capacitor/*` is dynamically imported from `src/hooks/native.ts` and **no-ops in the browser**. |
| Native value for App Store 4.2 | Turn-push (APNs) is required. Share sheet + haptic already exist; they are not enough alone. |
| Money | Play-money only. Keep that copy in-app and in the store listing (Guideline 5.3 / simulated gambling). |
| Public lobby | Still deferred. Not part of v1 iPhone. |
| Brand / domains | **Poker Party** family. One domain: `pokerparty.app`. Hold’em web **live:** `https://holdem.pokerparty.app` (confirmed 2026-09-04). Dealer’s Choice host reserved: `dealerschoice.pokerparty.app`. Home-screen icon is the brand; the SpringBoard label is the game. |
| App names | Hold’em: App Store **Poker Party - Texas Hold’em**; SpringBoard label **Texas Hold’em**; icon wordmark **POKER PARTY**. Dealer’s Choice sibling: label **Dealer’s Choice** (not shipped). |

**Mental model:** Friends beta-test on **production**. The Capacitor WebView loads `https://holdem.pokerparty.app` (`capacitor.config.ts`). `npx next dev` is still the website for browser work. Engine/server changes for push must stay web-safe.

**Felt / chrome:** party felt + gold serif wordmark (Harry signed off 2026-09-01). **Icon (2026-09-04):** black spade on felt, gold frame, white **POKER PARTY** wordmark. SpringBoard label is **Texas Hold’em**. Dealer’s Choice uses the same chrome + wordmark with a chip (source only). House glyph retired.

---

## Already done (on `iphone-app`)

- Capacitor 8 iOS project (`ios/`, `capacitor.config.ts`, `npm run ios` / `ios:sync`)
- Native config points at **`https://holdem.pokerparty.app`** (official host; kappa alias remains)
- Table shell is locked to the visual viewport (`h-dvh overflow-hidden`); Capacitor `ios.scrollEnabled: false` so the phone cannot pan a canvas larger than the screen
- `useGame` resync on Capacitor `appStateChange` (iOS kills SSE in background)
- Native share on invite; haptic on your-turn
- In-app copy: “Play money only — chips have no cash value.”
- Web tests still pass with native bridges no-op’ing (`src/hooks/native.test.ts`)
- `next dev` skips Upstash rate limits so `.env.local` Redis does not share the production create bucket (`src/server/ratelimit.ts`; 10 creates/hour)
- Privacy policy at `/privacy` (home footer; contact `homegamesupport@gmail.com`). Listing draft: [app-store-listing.md](app-store-listing.md)
- Info.plist `ITSAppUsesNonExemptEncryption` = false (HTTPS + HMAC cookie only)
- **Engine extract (2026-08-31):** `applyAction` is a thin switch; per-action handlers + hand-loop helpers. Harry signed off on web regression. Stryker after extract: 90.36% overall / engine 91.54% / `engine.ts` 86 survivors (mostly fail-message strings). Hardening pass **stopped** — do not chase remaining StringLiteral mutants.

---

## Phases

Check off in this file as work completes. Each phase has a **done when**. Stop at the end of a phase rather than starting the next one in the same breath unless Harry says continue.

### Phase 0 — Apple Developer (Harry, parallel / later)

**Done (2026-09-01).** Individual membership Active; Harry can sign in to App Store Connect and sees Add App. **Do not create the Connect listing yet** — wait for Phase 3 APNs. Team ID stays local (not in git).

### Phase 1 — Simulator smoke

**Done (2026-08-29).** iPhone 17 Pro, iOS 26.5 simulator. Path A loaded production (`⚡️ Loading app at https://home-game-poker-kappa.vercel.app…`; WKWebView URL confirmed). Quick-play table seated as **iPhone**; a full hand reached showdown (Lucky Lou, straight ace-high). Backgrounded ~10s via Settings, resumed same PID — live table, same seat/stack/hole cards. Native share sheet opened on Invite (“Poker night!” → production host).

1. ~~Confirm iOS simulator runtime is installed (Xcode → Settings → Platforms). Target was **iOS 26.5** (not watch/tv/vision).~~ Installed (`iphonesimulator26.5` / runtime 23F77).
2. ~~`npm install` on `iphone-app`, then `npm run ios` (`npx cap open ios`).~~
3. ~~Run on an iPhone simulator. The WebView must load **production**, not localhost.~~
4. ~~Play: home → name → Play now (or host) → sit at a table. Background the app ~10s, resume — table should resync (not a dead SSE).~~
5. Play-money copy: **on this branch and on the live alias** (`src/app/page.tsx`). `master` still lacks it until merge. Invite share: **works** in sim. Haptic: sim has no Taptic Engine — code path not felt.

**GPU / layout notes (not blockers for this phase):**
- No black-screen / GPU hang on the felt, cards, or showdown labels.
- Table header (`GameRoom`) now pads `env(safe-area-inset-top)` (plus `viewport-fit=cover` in `layout.tsx`) so Invite / history sit below the Dynamic Island. Desktop unchanged (`env()` is 0). Verify in the sim against localhost (not production) while this lives only on `iphone-app`.
- Capacitor logs a benign `JS Eval error` on first load; WebView still loaded production.

**Done when:** one complete quick-play (or hosted) hand in the simulator, plus a background/resume that still shows the live table. Note any GPU/layout bugs. Do not start APNs in this phase.

### Phase 2 — Real-device cookie proof

Needs a physical iPhone. Simulator cookie jars do not prove store-ready identity.

Identity is an httpOnly cookie `hg_{gameId}`. If WKWebView drops it on force-quit, the player loses their seat.

**Done (2026-09-01).** Harry: force-quit → reopen returns to the same table while a hand is live **and** after the hand has ended before Results. Cookie + `hg:lastGameId` resume. Optional phone-reboot pass not required. No native session fallback.

### Phase 3 — APNs turn-push

This is the critical path (gameplay + Guideline 4.2). Needs an active Developer Program membership for a production push key.

Sketch (refine when implementing; do not invent a second identity system):

- Capacitor Push Notifications plugin; request permission in-app.
- Register device token tied to `playerId` + `gameId` (cookie already identifies the player).
- Server sends a push when it becomes that player’s turn (and they are not the connected/foreground client, if we can tell).
- APNs token auth (.p8) via env on Vercel — never commit the key.
- Handle token invalidation; no push for bots.

**Done when:** with the app backgrounded or killed, a human at a live production table gets a “your turn” notification, taps it, and returns to the correct table. Web players are unchanged (no permission prompt in Safari).

### Phase 4 — Store-ready shell

Upload and screenshots still wait for Phases 2–3. Draft artifacts started **2026-08-31** so Apple has a privacy URL and listing copy ready; **do not claim turn-push in Connect until Phase 3**.

- Privacy policy URL (required): **live** at `https://holdem.pokerparty.app/privacy` (kappa alias also serves `/privacy`).
- Listing / 5.3 / 4.2 review-notes draft: [app-store-listing.md](app-store-listing.md) (no push claim).
- `ITSAppUsesNonExemptEncryption` = false in `ios/App/App/Info.plist`.
- **Replace before submit:** ~~Capacitor default App Icon~~ **done** (black spade + white Poker Party wordmark on felt + gold frame in `brand/`; iOS `AppIcon` + splash + `src/app/icon.png`; SpringBoard name **Texas Hold’em**). Dealer’s Choice chip sibling is the same chrome, not shipped here. Screenshots at Apple’s required sizes — not started.
- Screenshots from a device or sim at required sizes — not started.
- 4.2 in review notes: share + haptic today; add APNs only after Phase 3.

**Done when:** a signed build is uploaded to App Store Connect and Harry is ready to submit. Submission waits for his go-ahead. Still **not submittable** until Phase 3 push. Capacitor already points at production.

### Phase 5 — Submit and review

Harry submits. Possible extra questions because it looks like poker. If rejected on 4.2 or 5.3, fix copy / native value — do not rewrite as React Native.

**Done when:** Ready for Sale, or Harry parks the listing.

---

## Out of scope (v1)

- Dealer’s choice iOS app
- Public lobby / matchmaking
- Android
- Offline play
- Paid app / IAP / real-money anything
- Universal Links / custom URL scheme beyond what Capacitor already has
- Push for chat or “game started” unless turn-push is done first

---

## Estimate

| Phase | Focused work | Typical wait |
|---|---|---|
| 0 Enrollment | 30–60 min of Harry’s time | 24–48h+ Apple approval |
| 1 Simulator | half a day | — |
| 2 Device cookies | half a day | signing / cable |
| 3 APNs | 3–6 days | portal + first token debug |
| 4 Listing | 1–2 days | assets |
| 5 Review | — | 1–7 days (poker-shaped apps can take longer) |

Calendar: **~1.5–3 weeks** if enrollment and a phone are ready and sessions stay focused; **3–6 weeks** if APNs or review bounces.

---

## Quality pass + store shell (2026-08-31)

Not a substitute for App Store review. Apple scores Guideline **4.2** / **5.3**, not Stryker.

**Still not submittable:** no turn-push (4.2). Phase 2 cookie proof **done**. Capacitor points at production. Play-money copy **is** on the live alias (CLI prod from this branch).

**Coverage** (`npm test` 358 passed after extract; `npm run coverage` at quality-pass start): statements **96.87** / branches **90.79** / functions **97.90** / lines **98.03** (floors 93 / 82 / 90 / 94).

**CRAP** (`comp² × (1−stmtCov)³ + comp`, bar ≤ 6) on touched product TS:

| Area | Result |
|---|---|
| `ratelimit.ts` | All named fns ≤ 6 after a Redis-limiter unit test. `built` = **6.00** at 100% stmt coverage. |
| `native.ts` | Not in the Vitest coverage *include* (hooks are Playwright-owned). One-off include: **100%** stmts/branches/fns; CRAP = complexity only (`isNative` 2, `onNativeAppActive` 4, `nativeShare` 3, `nativeTurnHaptic` 3). Extra native-path tests added. |
| `useGame.ts` / `GameRoom.tsx` / `InviteButton.tsx` / `layout.tsx` / `page.tsx` | **0% Vitest** by design. `useGame` is the client hotspot (complexity ~21 → CRAP ~462 at 0% unit coverage). No RTL suite this pass. |
| `engine.ts` | **Extracted 2026-08-31** (`applyAction` dispatcher + lifecycle helpers). Pre-extract: `applyAction` CRAP ~109. Post-extract Stryker: **86** survivors (mostly `StringLiteral` fail messages). No allowlist file; do not chase remaining equivalents. |

**Stryker** after extract (cache-busted `npx stryker run`): **90.36%** overall / engine **91.54%** vs quality-pass-start 89.23% / 90.10% and 2026-08-24 ~89.4% / 90.1%. `engine.ts` **86** survivors + 1 no-cov (was 106 + 7). `kv.ts` still weak (16 no-cov) — untouched.

**Store-prep:** `/privacy` live (contact `homegamesupport@gmail.com`) + home footer; [app-store-listing.md](app-store-listing.md); encryption exemption in Info.plist; **app icon + splash** are the black-spade-on-felt family (`brand/`).

**Friend beta:** production alias is this branch (`vercel deploy --prod`). Git production branch remains `master` — do not push it during the beta.

**Harry-parallel blockers:** Phases 0–2 **done**. Next: APNs turn-push (Phase 3). Do not create the App Store Connect listing until Phase 3.

---

## Next session

**Mobile TODOs (Harry, 2026-09-04):**
1. ~~**Official URL**~~ **done** (PR #6). Capacitor loads `https://holdem.pokerparty.app`. Harry still rebuilds on device (`npx cap sync ios` → Xcode Play). Seat cookies on the old `kappa` host will not follow.
2. ~~**iPhone home-screen icon tweaks**~~ **done** (this session). White **POKER PARTY** on the icon; SpringBoard label **Texas Hold’em**. Privacy uses **Close** in the native app (hard nav to `/`) because the old Home link sat under the status bar and Next.js soft-nav was a no-op in WKWebView.
3. **Phase 3 APNs** — still the App Store 4.2 path. Do not start until Harry says continue.
4. **Rebuild on device** — icon + label are native; pull this branch, `npx cap sync ios`, Xcode → Play on Harry’s iPhone. Privacy Close is a website change — it also needs a production deploy of this branch (`vercel deploy --prod` from `iphone-app` after merge) before the installed app will show it.

Do not reopen engine mutation hunting. Do not push `master` while the live site is the `iphone-app` CLI beta. Do not create the App Store Connect listing until Phase 3 lands. **Docs-only: push `iphone-app` directly — no PR.**
