# Home Game Poker — iPhone app plan

Living plan for the Capacitor iOS app. Work stays on branch `iphone-app` until a slice is ready for review. **Do not merge to `master` until Harry asks.** **`master` is still the Git production branch**; the **live alias is currently this branch** (CLI `vercel deploy --prod`, 2026-08-31 friend beta). **Do not push `master`** during the beta. **Merge gate:** `capacitor.config.ts` already points at production (no `cleartext` / no `loggingBehavior: 'none'`). Do not ship a localhost WebView. Still **do not merge to `master` until Harry asks.**

**Sequencing (locked):** ship this app for `home-game-poker` first. `home-game-dealers-choice` is out of scope until poker is submitted (or clearly in App Store review). Copy the proven shell later (separate bundle id, listing, and `dc:` Redis prefix).

Related background: [2026-08-24 audit §4](audits/2026-08-24-code-security-mobile-audit.md#4-iphone-app-gap-analysis).

---

## Decisions (do not reopen unless blocked)

| Decision | Choice |
|---|---|
| Architecture | **Path A** — Capacitor WKWebView wrapping the Next site. Not a React Native rewrite. **On `iphone-app` (Phase 2+):** production `https://home-game-poker-kappa.vercel.app`. Localhost was simulator-only (Phase 1). |
| Bundle id | `com.homegame.poker` |
| Web vs native | Same Next bundle. `@capacitor/*` is dynamically imported from `src/hooks/native.ts` and **no-ops in the browser**. |
| Native value for App Store 4.2 | Turn-push (APNs) is required. Share sheet + haptic already exist; they are not enough alone. |
| Money | Play-money only. Keep that copy in-app and in the store listing (Guideline 5.3 / simulated gambling). |
| Public lobby | Still deferred. Not part of v1 iPhone. |

**Mental model:** Friends beta-test on **production**. The Capacitor WebView now loads that same production URL (needed for a physical iPhone). `npx next dev -p 3020` is still the website for browser/sim work if you temporarily point `server.url` back at localhost. Engine/server changes for push will land on this branch and must stay web-safe.

---

## Already done (on `iphone-app`)

- Capacitor 8 iOS project (`ios/`, `capacitor.config.ts`, `npm run ios` / `ios:sync`)
- Native config points at **production** (`https://home-game-poker-kappa.vercel.app`) for the physical-device cookie proof
- Table shell is locked to the visual viewport (`h-dvh overflow-hidden`); Capacitor `ios.scrollEnabled: false` so the phone cannot pan a canvas larger than the screen
- `useGame` resync on Capacitor `appStateChange` (iOS kills SSE in background)
- Native share on invite; haptic on your-turn
- In-app copy: “Play money only — chips have no cash value.”
- Web tests still pass with native bridges no-op’ing (`src/hooks/native.test.ts`)
- `next dev` skips Upstash rate limits so `.env.local` Redis does not share the production create bucket (`src/server/ratelimit.ts`)
- Privacy policy at `/privacy` (home footer; contact `homegamesupport@gmail.com`). Listing draft: [app-store-listing.md](app-store-listing.md)
- Info.plist `ITSAppUsesNonExemptEncryption` = false (HTTPS + HMAC cookie only)
- **Engine extract (2026-08-31):** `applyAction` is a thin switch; per-action handlers + hand-loop helpers. Harry signed off on web regression. Stryker after extract: 90.36% overall / engine 91.54% / `engine.ts` 86 survivors (mostly fail-message strings). Hardening pass **stopped** — do not chase remaining StringLiteral mutants.

---

## Phases

Check off in this file as work completes. Each phase has a **done when**. Stop at the end of a phase rather than starting the next one in the same breath unless Harry says continue.

### Phase 0 — Apple Developer (Harry, parallel / later)

**Done (2026-09-01).** Individual membership Active; Harry can sign in to App Store Connect and sees Add App. **Do not create the Connect listing yet** — wait for Phase 2 cookie proof and Phase 3 APNs. Team ID stays local (not in git).

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

**Done (2026-09-01, layout).** Harry signed off: table fits the physical iPhone and the website with no page scroll. Capacitor WebView loads production. **Cookie proof still open:** force-quit → reopen → same seat (then reboot if that pass looks good).

Config is ready: WebView loads production.

1. ~~Sign the iOS app for Harry’s device (Automatic Signing; Team = Harry’s Developer team). Bundle ID `com.homegame.poker`.~~
2. ~~Install on device. Join or host a production table.~~ Table fit signed off.
3. Force-quit the app (swipe away). Reopen. **Same seat, same stack.**
4. Repeat after a phone reboot if the first pass looks good.

**Done when:** force-quit → reopen restores the seat on a real device. If it fails, stop and design a native-backed session fallback — do not paper over it and submit.

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

- Privacy policy URL (required): **live** at `https://home-game-poker-kappa.vercel.app/privacy`.
- Listing / 5.3 / 4.2 review-notes draft: [app-store-listing.md](app-store-listing.md) (no push claim).
- `ITSAppUsesNonExemptEncryption` = false in `ios/App/App/Info.plist`.
- **Replace before submit:** Capacitor default App Icon (`AppIcon-512@2x.png` is the stock “C”) and splash PNGs in `ios/App/App/Assets.xcassets`.
- Screenshots from a device or sim at required sizes — not started.
- 4.2 in review notes: share + haptic today; add APNs only after Phase 3.

**Done when:** a signed build is uploaded to App Store Connect and Harry is ready to submit. Submission waits for his go-ahead. Still **not submittable** until Phase 2 cookie proof, Phase 3 push, and Capacitor pointed at production (not localhost).

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

**Still not submittable:** no turn-push (4.2); Phase 2 cookie proof not finished. Capacitor points at production. Play-money copy **is** on the live alias (CLI prod from this branch).

**Coverage** (`npm test` 358 passed after extract; `npm run coverage` at quality-pass start): statements **96.87** / branches **90.79** / functions **97.90** / lines **98.03** (floors 93 / 82 / 90 / 94).

**CRAP** (`comp² × (1−stmtCov)³ + comp`, bar ≤ 6) on touched product TS:

| Area | Result |
|---|---|
| `ratelimit.ts` | All named fns ≤ 6 after a Redis-limiter unit test. `built` = **6.00** at 100% stmt coverage. |
| `native.ts` | Not in the Vitest coverage *include* (hooks are Playwright-owned). One-off include: **100%** stmts/branches/fns; CRAP = complexity only (`isNative` 2, `onNativeAppActive` 4, `nativeShare` 3, `nativeTurnHaptic` 3). Extra native-path tests added. |
| `useGame.ts` / `GameRoom.tsx` / `InviteButton.tsx` / `layout.tsx` / `page.tsx` | **0% Vitest** by design. `useGame` is the client hotspot (complexity ~21 → CRAP ~462 at 0% unit coverage). No RTL suite this pass. |
| `engine.ts` | **Extracted 2026-08-31** (`applyAction` dispatcher + lifecycle helpers). Pre-extract: `applyAction` CRAP ~109. Post-extract Stryker: **86** survivors (mostly `StringLiteral` fail messages). No allowlist file; do not chase remaining equivalents. |

**Stryker** after extract (cache-busted `npx stryker run`): **90.36%** overall / engine **91.54%** vs quality-pass-start 89.23% / 90.10% and 2026-08-24 ~89.4% / 90.1%. `engine.ts` **86** survivors + 1 no-cov (was 106 + 7). `kv.ts` still weak (16 no-cov) — untouched.

**Store-prep:** `/privacy` live (contact `homegamesupport@gmail.com`) + home footer; [app-store-listing.md](app-store-listing.md); encryption exemption in Info.plist; icon/splash still Capacitor defaults.

**Friend beta:** production alias is this branch (`vercel deploy --prod`). Git production branch remains `master` — do not push it during the beta.

**Harry-parallel blockers:** Phase 0 **done**. Table fit **signed off** (2026-09-01). Next: force-quit cookie proof (Phase 2) → APNs (Phase 3).

---

## Next session

**Phase 2 in progress.** Table fit signed off on device + web. Remaining: force-quit → same seat (then reboot). Do not implement APNs until that result is known. Do not reopen engine mutation hunting. Do not push `master` while the live alias is the `iphone-app` CLI beta. Do not create the App Store Connect listing until Phases 2–3 land.
