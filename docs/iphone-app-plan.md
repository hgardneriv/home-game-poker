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

**Code on `iphone-app` (PR #9 merged 2026-09-04) and on the live site** (Harry: Vercel Production redeploy + CLI deploy). Device proof still needed — do not mark done until Harry sees a live-table notification.

Identity is the existing `hg_{gameId}` cookie. `POST /api/games/:id/push` is `{ token }` to register or `{ active: false }` when the native app backgrounds. No second login.

| Piece | Behavior |
|---|---|
| Native | `@capacitor/push-notifications`. Permission + `register()` only when `isNative()` and the player is seated. Web no-ops (`src/hooks/native.ts`). |
| Token store | Redis (or in-memory) `push:{gameId}:{playerId}`, 24h TTL — same lifetime as the table. |
| Presence | SSE touches `fg:{gameId}:{playerId}` (8s TTL) while the stream is open. Native `appStateChange` closes SSE and POSTs `{ active: false }` so a swipe-away is not treated as “still looking.” |
| Send | After a persist, if `(handNo, street, toAct)` changed, notify that human unless they are still marked foreground. Backgrounding while it is already your turn sends immediately (the ding you hear in-app is haptic, not APNs). Solo vs bots **freezes** with no client — keep a Mac Safari tab on the table so the sweep keeps running. |
| APNs | Token auth (.p8) via Vercel env. Default host is **sandbox** (`APNS_PRODUCTION` unset). Dual-env keys are team-scoped; the server still sends to one host at a time. |
| Tap | Payload includes `gameId`. `NativePushRoot` assigns `/game/{id}` (works from a killed app). |

**Harry — Apple portal (do this, then paste env into Vercel, not git):**

1. **Identifiers → App IDs:** if you only see **XC Wildcard** (`*`), register an **explicit** App ID (Xcode used the wildcard because Push was not on yet). **+** → App IDs → App → Description `Poker Party Holdem`, Bundle ID **Explicit** `app.pokerparty.holdem` → enable **Push Notifications** (leave **Broadcast Capability** unchecked) → Register. Do not try to turn Push on for the wildcard (Apple does not allow it). Do not create the App Store Connect listing.
2. **Keys → + :** only check **Apple Push Notification service (APNs)**. Leave DeviceCheck / Maps / Sign in with Apple / everything else unchecked.
3. Click **Configure** on APNs (required; locked after Save):
   - **Environment:** **Sandbox & Production** — one key covers Xcode Play (sandbox tokens) and later TestFlight / App Store (production tokens). The server picks the host with `APNS_PRODUCTION`.
   - **Key Restriction:** **Team Scoped (All Topics)**. Apple only offers Topic Specific on a single-environment key; dual-env is team-scoped. Fine on this individual team (Hold’em now; Dealer’s Choice later would share the key).
4. **Key Name:** `Poker Party Holdem APNs` (portal forbids `'`, `-`, `.`)
5. **Key Usage Description** (optional): `Turn push for Texas Holdem app.pokerparty.holdem`
6. Save → Continue → Register → **Download the `.p8` once** (Apple will not show it again). Note the **Key ID**. Team ID is in the portal header (keep it out of git).

**Vercel env (Production — never commit):**

| Name | Value |
|---|---|
| `APNS_KEY_ID` | Key ID from the portal |
| `APNS_TEAM_ID` | Team ID from the portal header |
| `APNS_KEY` | Full `.p8` PEM (literal `\n` is OK) |
| `APNS_BUNDLE_ID` | `app.pokerparty.holdem` (optional; this is the default) |
| `APNS_PRODUCTION` | omit / `0` for Xcode Play (sandbox host). Set `1` when the installed build is TestFlight / App Store. Same dual-env key works for both. |

After env is set: `vercel deploy --prod` from `iphone-app` (or this PR once merged). Rebuild the iPhone app (`npx cap sync ios` → Xcode Play). Sit at a production table, allow notifications, background or kill the app, have the other side act until it is your turn, tap the banner.

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

**Still not submittable:** turn-push is implemented but **not device-proven** (4.2). Phase 2 cookie proof **done**. Capacitor points at production. Play-money copy **is** on the live alias (CLI prod from this branch).

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

**Harry-parallel blockers:** Phases 0–2 **done**. Phase 3 code is in; listing waits for a live-table push proof. Do not create the App Store Connect listing until that proof.

---

## Next session

**Mobile TODOs (Harry, 2026-09-04):**
1. ~~**Official URL**~~ **done** (PR #6). Capacitor loads `https://holdem.pokerparty.app`. Harry still rebuilds on device (`npx cap sync ios` → Xcode Play). Seat cookies on the old `kappa` host will not follow.
2. ~~**iPhone home-screen icon tweaks**~~ **done** (this session). White **POKER PARTY** on the icon; SpringBoard label **Texas Hold’em**. Privacy uses **Close** in the native app (hard nav to `/`) because the old Home link sat under the status bar and Next.js soft-nav was a no-op in WKWebView.
3. **Phase 3 APNs** — token + permission work on device. First swipe-away heard the in-app haptic (ding), not a banner: SSE still looked “foreground,” and a solo bot table freezes with no second client. Fix on this PR (clear fg + remind on background). After merge: `vercel deploy --prod` from `iphone-app` (JS-only — no Xcode rebuild). Proof: open the same table in Mac Safari, Allow on the phone, background **on your turn** (banner now) or before your turn (banner when Safari/bots advance). Do not create the Connect listing yet.
4. ~~**Try Simulator first, then the phone**~~ Harry installed the icon + **Texas Hold’em** label on device (2026-09-04). Privacy Close still needs the website on production (`vercel deploy --prod` from `iphone-app`).
5. ~~**README screenshots**~~ **done** (this session). Recaptured `docs/gameplay.png` and the three hand shots against the Poker Party felt. Docs-only; pushed `iphone-app` directly.

Do not reopen engine mutation hunting. Do not push `master` while the live site is the `iphone-app` CLI beta. Do not create the App Store Connect listing until Phase 3 lands. **Docs-only: push `iphone-app` directly — no PR.**
