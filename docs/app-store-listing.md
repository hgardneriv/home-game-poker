# App Store listing — Phase 4 paste pack

Privacy policy URL: `https://holdem.pokerparty.app/privacy`
(contact `homegamesupport@gmail.com`).

**Submitted 2026-09-28.** Version **1.0.1**, build **1.0.1 (2)** attached.
Status: **Waiting for Review**. Do not submit again. After Apple approves,
Harry taps **Release this version** (manual — will not auto-go-live).
Leave `APNS_PRODUCTION=1`. Do not invent icon/listing restyles. iPhone-only.

---

## Connect status (2026-09-28)

**Waiting for Review.** TestFlight 1.0.1 (2) installed; Harry confirmed
production your-turn banners. Version field is **1.0.1**; build **1.0.1 (2)**
attached; **Manually release this version**. App Privacy published.
Content Rights: no third-party content. Submitted for Review.

**Done in App Store Connect**

- App record: `pokerparty.app Hold'em`, bundle `app.pokerparty.holdem`, SKU `holdem`
- 1.0 / 1.0.1 copy: subtitle, description, keywords, support + marketing URLs, copyright
- Category: Games → **Card**
- iPhone 6.5″ screenshots (six PNGs in `docs/app-store/`; no preview video)
- Age rating **18+** (Frequent simulated gambling). See answers below.
- App Privacy published: Other User Content, User ID, Device ID, Product Interaction
- Privacy policy URL saved
- Pricing: **Free / $0.00** in 175 countries; availability 175; Public listing
- Mac **off**, Vision Pro **off**
- App Review Information (contact + notes paste); sign-in required **off**
- Version release: **Manually release this version**
- Game Center **off**; no IAP / subscriptions
- Content Rights: no third-party content
- TestFlight **1.0.1 (2)** uploaded, installed, production APNs proven
- Submitted for Review (2026-09-28) — **Waiting for Review**

**Next (after Apple approves — do not submit again)**

1. Wait for Apple (email). Do not submit again.
2. Harry taps **Release this version** (manual). Leave `APNS_PRODUCTION=1`.

Xcode Play uses sandbox tokens. Play banners stop while production APNs is on (`APNS_PRODUCTION=1`) — expected. Leave production on.

---

## What only Harry can do

This environment cannot open App Store Connect or Xcode. Listing fields below are the record of what was pasted, not a second fill-in.

---

## Create the app record (done)

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

## Version / listing copy (Connect version is now **1.0.1**; copy below is what landed)

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

**Price:** Free / $0.00 worldwide (175). No IAP. Public App Store. Mac and Vision Pro availability **off**.

---

## Screenshots

Connect’s 1.0.1 page used **iPhone 6.5″**. Ready files (1284×2778 portrait) are in `docs/app-store/`:

| Upload order | File | What it is |
|---|---|---|
| 1 | `02-table-flop.png` | Live flop, your turn, Fold / Call / Raise |
| 2 | `03-made-hand.png` | Full house on the felt |
| 3 | `01-home.png` | Home + Play now + play-money line |
| 4 | `01b-host-setup.png` | Home + **Host a game** (blinds / buy-in / bots) |
| 5 | `04-invite.png` | Host lobby + **Invite** |
| 6 | `05-share-sheet.png` | Invite → native iOS share sheet (personal suggested contacts removed) |

First three appear on the install sheet. **Uploaded** to iPhone 6.5″. Do not add iPad or Watch. No preview video.

`05-share-sheet.png` is your phone capture with the three suggested people taken out. Your MacBook / AirDrop row stays. The copy that landed in chat is 360px wide, so this export is a bit soft at 6.5″ — if Connect looks mushy, AirDrop the original Photos screenshot and we can replace it.

---

## Age rating (saved 2026-09-08)

Connect calculated **18+** (17+ on older iOS). Frequent play-money chips is simulated gambling. Do not reopen to mark it Infrequent.

| Step | Answers |
|---|---|
| 1 Features | All **NO** (parental controls, age assurance, unrestricted web, UGC, social, chat, ads). 2026 UGC means **broad distribution** — a private-table display name is not that. |
| 2 Mature Themes | All **NONE** |
| 3 Medical / Wellness | All **NONE** |
| 4 Sexuality or Nudity | All **NONE** (graphic must stay NONE or the app can go Unrated) |
| 5 Violence | All **NONE** (cards / a spade icon are not weapons) |
| 6 Chance-Based | **Gambling NO**. **Simulated Gambling FREQUENT**. Contests **NONE**. Loot boxes **NONE**. Virtual currency not exchangeable for real money / prizes. |
| 7 Additional | Age Suitability URL **blank**. Save. |

---

## App Privacy (saved 2026-09-08)

**Collect data?** Yes. **Tracking?** No. No ATT.

Do **not** check Contact Info → Name (table nickname is not a contact name). Do **not** check Gameplay Content (Apple’s wording is in-game UGC; Product Interaction covers play).

| Data type | Linked to identity? | Tracking? | Purpose | Required to use the app? |
|---|---|---|---|---|
| **Other User Content** (display name) | Yes | No | App Functionality | Yes |
| **User ID** (`hg_{gameId}` seat cookie) | Yes | No | App Functionality | Yes |
| **Device ID** (APNs token) | Yes | No | App Functionality | No (notifications optional) |
| **Product Interaction** (Vercel Analytics) | No | No | **Analytics** only — not App Functionality | No |

Do **not** declare: Location, Contact Info, Financial, Photos, Camera, Health, Ads, Purchases, Search History, Diagnostics.

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

## TestFlight archive (done 2026-09-28)

1. ~~Vercel Production env: set `APNS_PRODUCTION` = `1`. Redeploy production so the server talks to the APNs production host.~~ **Done.** Leave `APNS_PRODUCTION=1`.
2. ~~On the Mac, Xcode → Product → **Archive** (Any iOS Device). Signing = **Apple Distribution** / Automatic.~~ Build **1.0.1 (2)** uploaded.
3. ~~Distribute → App Store Connect → upload.~~
4. ~~Install the TestFlight build on the phone.~~ Harry installed 1.0.1 (2). **Xcode Play will not receive pushes** while `APNS_PRODUCTION=1` (sandbox vs production tokens). That is expected — leave production on.
5. ~~Prove: swipe away on your turn; swipe away before it is your turn; kill → tap banner.~~ Harry confirmed production your-turn banners.
6. ~~Submit for Review.~~ Submitted 2026-09-28. Status: **Waiting for Review**. Do not submit again.

Do not unset `APNS_PRODUCTION` for the store binary. After Apple approves, Harry taps **Release this version**.

---

## Assets already done

- App icon / splash: black spade + white Poker Party wordmark on felt + gold frame (`brand/`). SpringBoard **Texas Hold'em**.
- iPhone-only binary (`TARGETED_DEVICE_FAMILY = 1`).
- Play-money copy on the live site and home screen.
- Connect 1.0 paperwork (2026-09-08) + 1.0.1 (2) Waiting for Review (2026-09-28) — see status at the top of this file.
