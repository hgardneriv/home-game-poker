# App Store listing — Phase 4 paste pack

Harry started Phase 4 (2026-09-08). Use this file as the single source while
filling App Store Connect. Do **not** click Submit for Review until a
TestFlight build has proven production APNs (`APNS_PRODUCTION=1`).

Privacy policy URL (required): `https://holdem.pokerparty.app/privacy`
(contact `homegamesupport@gmail.com`).

---

## What only Harry can do

This environment cannot open App Store Connect or Xcode. You:

1. Create the app record (steps below).
2. Take the 6.9″ screenshots (shot list below) — your phone or the 16/17 Pro Max simulator.
3. Archive + upload a **distribution** build for TestFlight.
4. Set Vercel `APNS_PRODUCTION=1` before that TestFlight install (sandbox tokens from Xcode Play will not get banners on a store-signed build).
5. Re-run swipe-away / kill-and-tap on TestFlight.
6. Click **Submit for Review** when you are happy (Phase 5).

Paste everything else from this file.

---

## Create the app record

App Store Connect → **Apps** → **+** → **New App**

| Field | Value |
|---|---|
| Platforms | **iOS** only |
| Name | **`pokerparty.app Hold'em`** (locked 2026-09-08). The first choice `Poker Party - Texas Hold'em` was already taken. |
| Primary language | English (U.S.) |
| Bundle ID | **`app.pokerparty.holdem`** (explicit App ID from Phase 3 — do not pick the XC Wildcard) |
| SKU | `holdem` |
| User access | Full Access (just you) |

If the bundle id is missing from the dropdown, the App ID is not in this team — fix that in the Apple Developer portal before continuing. Do not create a second bundle id.

---

**Store name locked:** `pokerparty.app Hold'em`. SpringBoard stays **Texas Hold'em**. Bundle id stays `app.pokerparty.holdem`. Do not create a second Connect app.

---

## Version / listing copy (Version 1.0)

**Subtitle** (30): `Play-money holdem with friends`

(The first draft `Play-money Hold'em with friends` is 31. Dropping the apostrophe keeps play-money and friends. Store name already has Hold'em.)

**Promotional text** (170, optional, you can edit anytime):

```
Private Texas Hold'em for friends. Share a table, play chips that have no cash value. Your-turn notifications if you step away. No accounts, no IAP.
```

**Description:**

```
Poker Party is a private Texas Hold'em table for friends. Share a link, take a seat, and play chips that have no cash value.

Host a table or jump into a quick game with optional computer players. The iPhone app wraps the same play-money game: a native invite (the iOS share sheet), a haptic when it is your turn, and a “Your turn” notification if you leave the table.

There is no real-money gambling, no cash-out, no in-app purchases, and no accounts. Refreshing or reopening the app returns you to your seat.

Play money only — chips have no cash value.
```

**Keywords** (100 characters, comma-separated, no spaces after commas):

```
poker,hold'em,texas holdem,poker party,play money,chips,friends,table,home game
```

**Support URL:** `https://holdem.pokerparty.app/privacy`
**Marketing URL** (optional): `https://holdem.pokerparty.app`
**Copyright:** `2026 Harry Gardner IV`

**Category:** Games → **Card**. Do not pick Casino as primary (reviewers sometimes map poker there; Card + play-money copy is the safer pair).

**Price:** Free. No IAP.

---

## Screenshots

Connect’s 1.0 page is asking for **iPhone 6.5″**. Ready files (1284×2778 portrait) are in `docs/app-store/`:

| Upload order | File | What it is |
|---|---|---|
| 1 | `02-table-flop.png` | Live flop, your turn, Fold / Call / Raise |
| 2 | `03-made-hand.png` | Full house on the felt |
| 3 | `01-home.png` | Home + Play now + play-money line |
| 4 | `01b-host-setup.png` | Home + **Host a game** (blinds / buy-in / bots) |
| 5 | `04-invite.png` | Host lobby + **Invite** |
| 6 | `05-share-sheet.png` | Invite → native iOS share sheet (personal suggested contacts removed) |

First three appear on the install sheet. Drag all six onto the **iPhone 6.5″** slot. Do not add iPad or Watch. No preview video.

`05-share-sheet.png` is your phone capture with the three suggested people taken out. Your MacBook / AirDrop row stays. The copy that landed in chat is 360px wide, so this export is a bit soft at 6.5″ — if Connect looks mushy, AirDrop the original Photos screenshot and we can replace it.

---

## Age rating (answer honestly)

Apple’s 2026 questionnaire includes chance-based / gambling items. Expected rating: **17+** (simulated gambling), which is correct.

| Topic | Answer |
|---|---|
| Simulated gambling / chance-based play with virtual currency | **Yes** — chips, no cash-out, no real-world prizes |
| Real-money gambling | **No** |
| Loot boxes / randomized paid items | **No** |
| In-app purchases | **No** |
| Unrestricted web browser | **No** (WKWebView loads this one site, not Safari) |
| User-generated content | **Yes, infrequent** — display names on a **private** table; no public feed, no chat |
| Violence / horror / sexual content / drugs / alcohol | **No** |
| Medical / wellness | **No** |

If Connect asks whether virtual currency can be exchanged for real money or real-world prizes: **No**.

---

## App Privacy (nutrition label)

**Does this app collect data?** Yes (declare what we actually send off-device).

**Used for Tracking?** **No.** No ATT prompt. Vercel Analytics is first-party page traffic, not ad attribution. Do not enable App Tracking Transparency.

Declare these. All **not linked to identity** except where noted.

| Data type | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|
| **Product Interaction** / Usage Data (Vercel Analytics page views) | No | No | Analytics |
| **User ID** (per-table player id in the `hg_{gameId}` cookie) | Yes — it is the seat | No | App Functionality |
| **Device ID** (APNs token, only if they allow notifications) | Yes — stored next to that seat | No | App Functionality |
| **Other User Content** (display name; localStorage `hg:playerName` + shown at the table) | Yes | No | App Functionality |

Do **not** declare: Location, Contact Info, Financial Info, Photos, Camera, Health, Advertising Data, Purchases, Search History.

Optional extra if you want to be conservative: **Product Interaction** already covers analytics. Vercel may see IP at the edge for the HTTP request itself — that is ordinary hosting, not a separate “precise location” collect.

---

## Review notes (paste into App Review Information)

**Sign-in required:** No. First name, last name, phone: yours. **Notes:**

```
This is a play-money Texas Hold'em table (chips have no cash value; no IAP).

Native value:
- Capacitor WKWebView shell (bundle id app.pokerparty.holdem)
- Native share sheet for table invites
- Haptic on your turn
- APNs “Your turn” when the app is backgrounded or killed (tap returns to that table)

Demo: open the app → Play now (or host) → sit. Invite uses the iOS share sheet. Background or kill the app; when it becomes your turn you get a banner. There is no login. Test account: none required.

The WebView loads https://holdem.pokerparty.app (same play-money site). Please try Invite and a backgrounded turn so Guideline 4.2 native value is visible.
```

Contact: `homegamesupport@gmail.com`. Demo account: none.

---

## Export compliance

Already in Info.plist: `ITSAppUsesNonExemptEncryption` = false (HTTPS + HMAC cookie only). Connect should pick that up; if it asks, **No** — not using exempt encryption beyond HTTPS.

---

## TestFlight archive (after listing + screenshots)

1. Vercel Production env: set `APNS_PRODUCTION` = `1`. Redeploy production so the server talks to the APNs production host.
2. On the Mac, `iphone-app` branch, Xcode → Product → **Archive** (Any iOS Device). Signing = **Apple Distribution** / Automatic. Confirm `aps-environment` is **production** on the archived entitlements (Debug Play stays `development`).
3. Distribute → App Store Connect → upload.
4. Install the TestFlight build on the phone. **Xcode Play will no longer receive pushes** while `APNS_PRODUCTION=1` (sandbox vs production tokens). That is expected.
5. Prove: swipe away on your turn; swipe away before it is your turn; kill → tap banner. Later turns quiet while the app is open.
6. Only then: Submit for Review (Phase 5).

To go back to Xcode Play debugging, unset `APNS_PRODUCTION` and redeploy. Do not leave it unset for the store binary.

---

## Assets already done

- App icon / splash: black spade + white Poker Party wordmark on felt + gold frame (`brand/`). SpringBoard **Texas Hold'em**.
- iPhone-only binary (`TARGETED_DEVICE_FAMILY = 1`).
- Play-money copy on the live site and home screen.
