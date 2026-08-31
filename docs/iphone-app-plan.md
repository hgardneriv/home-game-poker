# Home Game Poker — iPhone app plan

Living plan for the Capacitor iOS app. Work stays on branch `iphone-app` until a slice is ready for review. **Do not merge to `master` until Harry asks.** `master` remains the production website. **Merge gate:** restore `capacitor.config.ts` `server.url` to production (drop `cleartext`) — do not ship a localhost WebView.

**Sequencing (locked):** ship this app for `home-game-poker` first. `home-game-dealers-choice` is out of scope until poker is submitted (or clearly in App Store review). Copy the proven shell later (separate bundle id, listing, and `dc:` Redis prefix).

Related background: [2026-08-24 audit §4](audits/2026-08-24-code-security-mobile-audit.md#4-iphone-app-gap-analysis).

---

## Decisions (do not reopen unless blocked)

| Decision | Choice |
|---|---|
| Architecture | **Path A** — Capacitor WKWebView wrapping the Next site. Not a React Native rewrite. **On `iphone-app`:** `http://localhost:3020` (verify branch UI). **Before merge to `master`:** restore production `https://home-game-poker-kappa.vercel.app`. |
| Bundle id | `com.homegame.poker` |
| Web vs native | Same Next bundle. `@capacitor/*` is dynamically imported from `src/hooks/native.ts` and **no-ops in the browser**. |
| Native value for App Store 4.2 | Turn-push (APNs) is required. Share sheet + haptic already exist; they are not enough alone. |
| Money | Play-money only. Keep that copy in-app and in the store listing (Guideline 5.3 / simulated gambling). |
| Public lobby | Still deferred. Not part of v1 iPhone. |

**Mental model:** `npx next dev -p 3020` is the website **and** (on this branch) the sim WebView. Browser and simulator must both hit localhost until this branch is merged; then point Capacitor back at production. Engine/server changes for push will land on this branch and must stay web-safe.

---

## Already done (on `iphone-app`)

- Capacitor 8 iOS project (`ios/`, `capacitor.config.ts`, `npm run ios` / `ios:sync`)
- Native config currently **localhost:3020** for branch testing; restore production URL before merge
- `useGame` resync on Capacitor `appStateChange` (iOS kills SSE in background)
- Native share on invite; haptic on your-turn
- In-app copy: “Play money only — chips have no cash value.”
- Web tests still pass with native bridges no-op’ing (`src/hooks/native.test.ts`)
- `next dev` skips Upstash rate limits so `.env.local` Redis does not share the production create bucket (`src/server/ratelimit.ts`)
- Privacy policy at `/privacy` (home footer). Listing draft: [app-store-listing.md](app-store-listing.md)
- Info.plist `ITSAppUsesNonExemptEncryption` = false (HTTPS + HMAC cookie only)

---

## Phases

Check off in this file as work completes. Each phase has a **done when**. Stop at the end of a phase rather than starting the next one in the same breath unless Harry says continue.

### Phase 0 — Apple Developer (Harry, parallel / later)

Not a code blocker for Phase 1 (simulator). Needed before a real device with a stable signing team, APNs keys, and App Store Connect.

Enroll as **Individual** in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) (~$99/year) when ready. Skip detailed portal work until Phase 2/3 needs signing + push.

**Done when:** membership is Active and Harry can open App Store Connect. Record Team ID somewhere local (not in git).

### Phase 1 — Simulator smoke

**Done (2026-08-29).** iPhone 17 Pro, iOS 26.5 simulator. Path A loaded production (`⚡️ Loading app at https://home-game-poker-kappa.vercel.app…`; WKWebView URL confirmed). Quick-play table seated as **iPhone**; a full hand reached showdown (Lucky Lou, straight ace-high). Backgrounded ~10s via Settings, resumed same PID — live table, same seat/stack/hole cards. Native share sheet opened on Invite (“Poker night!” → production host).

1. ~~Confirm iOS simulator runtime is installed (Xcode → Settings → Platforms). Target was **iOS 26.5** (not watch/tv/vision).~~ Installed (`iphonesimulator26.5` / runtime 23F77).
2. ~~`npm install` on `iphone-app`, then `npm run ios` (`npx cap open ios`).~~
3. ~~Run on an iPhone simulator. The WebView must load **production**, not localhost.~~
4. ~~Play: home → name → Play now (or host) → sit at a table. Background the app ~10s, resume — table should resync (not a dead SSE).~~
5. Play-money copy: **on this branch only** (`src/app/page.tsx`). Production `master` does not ship it yet, so Path A’s home screen correctly lacks it until Harry merges. Invite share: **works** in sim. Haptic: sim has no Taptic Engine — code path not felt.

**GPU / layout notes (not blockers for this phase):**
- No black-screen / GPU hang on the felt, cards, or showdown labels.
- Table header (`GameRoom`) now pads `env(safe-area-inset-top)` (plus `viewport-fit=cover` in `layout.tsx`) so Invite / history sit below the Dynamic Island. Desktop unchanged (`env()` is 0). Verify in the sim against localhost (not production) while this lives only on `iphone-app`.
- Capacitor logs a benign `JS Eval error` on first load; WebView still loaded production.

**Done when:** one complete quick-play (or hosted) hand in the simulator, plus a background/resume that still shows the live table. Note any GPU/layout bugs. Do not start APNs in this phase.

### Phase 2 — Real-device cookie proof

Needs a physical iPhone. Simulator cookie jars do not prove store-ready identity.

Identity is an httpOnly cookie `hg_{gameId}`. If WKWebView drops it on force-quit, the player loses their seat.

1. Sign the iOS app for Harry’s device (Automatic Signing in Xcode once a team exists; free personal team is OK for this proof if Program enrollment is still pending).
2. Install on device. Join or host a production table.
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

- Privacy policy URL (required): `/privacy` on this branch. After merge: `https://home-game-poker-kappa.vercel.app/privacy`.
- Listing / 5.3 / 4.2 review-notes draft: [app-store-listing.md](app-store-listing.md) (no push claim).
- `ITSAppUsesNonExemptEncryption` = false in `ios/App/App/Info.plist`.
- **Replace before submit:** Capacitor default App Icon (`AppIcon-512@2x.png` is the stock “C”) and splash PNGs in `ios/App/App/Assets.xcassets`.
- Screenshots from a device or sim at required sizes — not started.
- 4.2 in review notes: share + haptic today; add APNs only after Phase 3.

**Done when:** a signed build is uploaded to App Store Connect and Harry is ready to submit. Submission waits for his go-ahead. Still **not submittable** until Phase 2 cookie proof, Phase 3 push, production Capacitor URL, and play-money copy on `master`.

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

**Still not submittable:** no turn-push (4.2); play-money line is on this branch only; Capacitor still points at localhost; Phase 2 needs a physical iPhone.

**Coverage** (`npm test` 356 passed; `npm run coverage`): statements **96.87** / branches **90.79** / functions **97.90** / lines **98.03** (floors 93 / 82 / 90 / 94).

**CRAP** (`comp² × (1−stmtCov)³ + comp`, bar ≤ 6) on touched product TS:

| Area | Result |
|---|---|
| `ratelimit.ts` | All named fns ≤ 6 after a Redis-limiter unit test. `built` = **6.00** at 100% stmt coverage. |
| `native.ts` | Not in the Vitest coverage *include* (hooks are Playwright-owned). One-off include: **100%** stmts/branches/fns; CRAP = complexity only (`isNative` 2, `onNativeAppActive` 4, `nativeShare` 3, `nativeTurnHaptic` 3). Extra native-path tests added. |
| `useGame.ts` / `GameRoom.tsx` / `InviteButton.tsx` / `layout.tsx` / `page.tsx` | **0% Vitest** by design. `useGame` is the client hotspot (complexity ~21 → CRAP ~462 at 0% unit coverage). No RTL suite this pass. |
| `engine.ts` | Still the danger zone: `applyAction` complexity ~109, ~99% stmts, CRAP **~109**. `startHand` / `advance` / `finishHand` / `removePlayer` sit at 9–13 because complexity, not missing lines. No allowlist file; mutation Phase 3 stays parked. |

**Stryker** (cache-busted `npx stryker run`): **89.23%** overall / engine **90.10%** vs 2026-08-24 ~**89.4% / 90.1%**. Not materially worse. `engine.ts` still **106** survivors. `ratelimit.ts` scored **56%** on that run (12 no-coverage mutants on the Redis constructor path); the unit test that covers that path landed immediately after and Stryker was not re-run. `kv.ts` still weak (16 no-cov) — untouched this pass.

**Store-prep:** `/privacy` + home footer; [app-store-listing.md](app-store-listing.md); encryption exemption in Info.plist; icon/splash called out as Capacitor defaults.

**Harry-parallel blockers:** Developer Program enrollment → physical iPhone force-quit cookie proof (Phase 2) → APNs (Phase 3). Then restore production `server.url` / logging before any merge to `master`.

---

## Next session

Start at **Phase 2**. Needs Harry’s physical iPhone and a signing team (free personal team is OK if Program enrollment is still pending). Do not implement APNs until Phase 2’s force-quit → same seat result is known. Before any merge: Capacitor `server.url` back to production and drop `loggingBehavior: 'none'`.
