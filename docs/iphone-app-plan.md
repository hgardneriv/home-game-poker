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

Only after Phases 2–3.

- App icon / splash already in `ios/`; replace with final art if they look like Capacitor defaults.
- Privacy policy URL (required). Host a short static page or use the production site.
- App Store Connect listing: play-money, no real currency, age rating (simulated gambling).
- Screenshots from a device or sim at required sizes.
- Confirm 4.2 story in review notes: native push, share, haptics, not “a website bookmark.”

**Done when:** a signed build is uploaded to App Store Connect and Harry is ready to submit. Submission waits for his go-ahead.

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

## Next session

Start at **Phase 2** after the safe-area header is verified in the sim against localhost. Needs Harry’s physical iPhone and a signing team (free personal team is OK if Program enrollment is still pending). Do not implement APNs until Phase 2’s force-quit → same seat result is known. Before any merge: Capacitor `server.url` back to production.
