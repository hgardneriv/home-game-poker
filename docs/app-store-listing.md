# App Store listing draft (not submitted)

Copy for App Store Connect when Harry starts Phase 4. Phases 2–3 are **done**
(cookie proof + turn-push device-proven, Harry signed off 2026-09-08). Do not
create the Connect record until he says start the listing.

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
wraps the same play-money game: native invite (share sheet), a haptic when
it is your turn, and a “Your turn” notification if you leave the table.
There is no real-money gambling, no in-app purchases, and no accounts.

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

Phase 3 turn-push is **device-proven** (Harry signed off 2026-09-08). Use the
notes below when he starts the Connect listing.

```
This is a play-money Texas Hold'em table (chips have no cash value; no IAP).

Native value:
- Capacitor WKWebView shell (bundle id `app.pokerparty.holdem`)
- Native share sheet for table invites
- Haptic on your turn
- APNs “Your turn” when the app is backgrounded or killed (tap returns
  to that table)

Demo: open the app → Play now (or host) → sit. Invite uses the iOS share
sheet. Background or kill the app; when it becomes your turn you get a
banner. There is no login. Test account: none required.
```

## Assets still needed before submit

- Device or simulator screenshots at Apple's required sizes.
- `ITSAppUsesNonExemptEncryption` is already `false` in Info.plist (HTTPS + HMAC cookie only).
- App icon / splash: black spade + white Poker Party wordmark on felt with gold frame (`brand/home-game-icon-holdem.svg`). SpringBoard label is **Texas Hold'em**. Same chrome + a chip is the Dealer's Choice sibling (source in `brand/`, not this app).
