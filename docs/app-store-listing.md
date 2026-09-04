# App Store listing draft (not submitted)

Copy for App Store Connect when Harry is ready to upload. **Do not paste this
into Connect until Phase 2 cookie proof and Phase 3 turn-push are done.** This
file is a draft so listing work can start without claiming native features we
do not ship yet.

Privacy policy URL (required): `https://holdem.pokerparty.app/privacy`
(also on the `kappa` Vercel alias; contact `homegamesupport@gmail.com`).

## Name / subtitle

- **Name:** Poker Party - Texas Hold'em (30-character cap; this fits)
- **Subtitle:** Play-money Hold'em with friends
- **Bundle id:** `app.pokerparty.holdem` (Dealer’s Choice sibling: `app.pokerparty.dealerschoice`)
- **Host:** `https://holdem.pokerparty.app` (live 2026-09-04). iPhone name is brand-first; the subdomain is game-first.

## Description

Poker Party is a private Texas Hold'em table for friends. Share a link,
take a seat, and play chips that have **no cash value**.

Host a table or jump into a quick game with optional bots. The iPhone app
wraps the same play-money game: native invite (share sheet) and a haptic when
it is your turn. There is no real-money gambling, no in-app purchases, and no
accounts.

Play money only — chips have no cash value.

## Keywords (draft)

poker, hold'em, texas holdem, poker party, play money, chips, friends, table

## Category / age rating notes

- **Category:** Games → Card (secondary: Casino is a common reviewer mapping
  for poker-shaped apps; pick what Connect offers and stay consistent with
  play-money copy).
- **Age rating:** this is **simulated gambling** (virtual chips, no cash-out,
  no real-money wagering). Answer Apple's gambling questionnaire honestly:
  the app contains gambling with virtual currency that cannot be exchanged
  for real money or prizes of real-world value.
- **Guideline 5.3:** listing, screenshots, and in-app copy must all say
  play-money. Do not show cash, PayPal, or "buy chips."

## Review notes template (Guideline 4.2)

Do **not** claim push notifications until APNs ships (Phase 3).

```
This is a play-money Texas Hold'em table (chips have no cash value; no IAP).

Native value today:
- Capacitor WKWebView shell (bundle id `app.pokerparty.holdem`)
- Native share sheet for table invites
- Haptic on your turn

Not in this build:
- Push / APNs (planned after we prove httpOnly seat cookies survive
  force-quit on a physical iPhone)

Demo: open the app → Play now (or host) → sit. Invite uses the iOS share
sheet. There is no login. Test account: none required.
```

## Assets still needed before submit

- Device or simulator screenshots at Apple's required sizes.
- `ITSAppUsesNonExemptEncryption` is already `false` in Info.plist (HTTPS + HMAC cookie only).
- App icon / splash: black spade + white Poker Party wordmark on felt with gold frame (`brand/home-game-icon-holdem.svg`). SpringBoard label is **Texas Hold'em**. Same chrome + a chip is the Dealer's Choice sibling (source in `brand/`, not this app).
