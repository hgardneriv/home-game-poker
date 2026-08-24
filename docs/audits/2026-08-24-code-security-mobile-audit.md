# Code, Security & Mobile-Readiness Audit — 2026-08-24

Read-only audit of the home-game-poker codebase, run to (1) surface code-structure and security issues worth fixing, (2) assess the gap between the current web prototype and a future iPhone app, and (3) give a CRAP-score-style (complexity × coverage risk) read on where bugs are most likely to hide. No code was changed as part of this audit — see the roadmap at the end for proposed follow-up work.

Method: three independent read-only passes (structure/complexity, security, test/coverage/mutation) run in parallel, plus a manual synthesis pass for the mobile-porting analysis. See [Methodology](#methodology--how-to-re-run-this-audit) at the end to reproduce this on another repo.

---

## 1. Code structure — mostly healthy, one hotspot

- Clean separation holds up under inspection: pure `src/engine/` (zero deps, no `Date.now()`/RNG inside), `src/server/` (storage/identity/redaction), `src/components/` + `src/hooks/` (UI). No duplicated engine logic in the client, no copy-pasted API-route boilerplate (`server/api.ts` helpers + `withGame()` are used everywhere), no rogue global state — everything flows through the single `useGame()` hook.
- **Zero** `any`, `as any`, `@ts-ignore`, `@ts-expect-error` in the codebase, `strict: true` in `tsconfig.json`. Genuinely clean for a project this size.
- **One real hotspot: `src/engine/engine.ts` (848 lines)** — the core `applyAction` reducer is a 19-branch switch with 87 `if` statements. It's a cohesive state machine, not mixed concerns, but it's the single largest blast radius in the app and (see §3) the file with the most surviving mutants in absolute terms.
- Minimal dependency footprint (5 runtime deps: `next`, `react`/`react-dom`, `@upstash/redis`, `motion`, `nanoid`). No ORM, no auth library, no state-management library — appropriately lean.
- No CI pipeline exists (`.github/workflows/` is absent). "Run tests before pushing" is currently a documented human habit, not an enforced gate.

## 2. Security findings (ranked)

| Severity | Finding | Where |
|---|---|---|
| **High** | **No rate limiting anywhere.** Game creation, join (mints a fresh identity), player actions, and SSE stream connections are all unthrottled. Enables cheap resource-exhaustion / cost-abuse DoS (spam game creation to fill Redis, spam joins to flood host approval, spam SSE connections to multiply Redis polling + function-minutes). | all `app/api/games/**` routes |
| **High (transitive)** | `npm audit` shows 4 high-severity advisories in `next`'s nested `postcss`/`sharp`/`nanoid`, fixed by bumping `next` past the currently pinned `16.2.12`. | `package.json` |
| **Medium** | `SESSION_SECRET` and the Redis-vs-in-memory-KV choice both hinge on a single `NODE_ENV === 'production'` string check, checked lazily per-request rather than asserted at boot. If that check is ever bypassed (non-standard env, container/hosting change), the app silently signs cookies with a **hardcoded, publicly-known fallback secret** (`identity.ts:15`) — full session/identity forgery — or silently drops to a per-instance in-memory KV that would corrupt multiplayer state on serverless. | `src/server/identity.ts:9-16`, `src/server/kv.ts:100-106` |
| **Medium** | No CSP, `X-Frame-Options`, HSTS, or `X-Content-Type-Options` anywhere — no `headers()` in `next.config.ts`, no `middleware.ts`, no `vercel.json`. No clickjacking protection. | project-wide |
| **Medium** | Unbounded concurrent SSE connections per game/client, each polling Redis every 500ms for up to 240s with client auto-reconnect — amplifies Redis load / Vercel cost under abuse, compounded by the rate-limiting gap above. | `app/api/games/[id]/stream/route.ts` |
| **Low** | No schema validation (zod/etc.) on API inputs — currently safe because coercion is manual and disciplined (`Number.isInteger`, `.slice(0,20)`, clamped ranges), but fragile as the surface grows. | `src/server/api.ts` |
| **Info (verified strong)** | HMAC cookie verification is genuinely constant-time (`timingSafeEqual`); CAS/version-based concurrency control is race-free; the `ClientGameState`/`GameState` type split is consistently enforced everywhere state is serialized (no raw-state leak found); all host/player actions are authorized server-side off the verified cookie, never client-supplied identity; no XSS surface (no `dangerouslySetInnerHTML`, all names go through JSX escaping); no hardcoded secrets; `.env*`/`.vercel` correctly gitignored. | — |

**Two audits corroborated each other independently**: the security pass flagged `kv.ts`'s brittle env-based fallback as a design risk, and the coverage pass — with no knowledge of that finding — flagged `kv.ts` as the single weakest-tested file in the mutation report (16 of 59 mutants have **zero test coverage**). That convergence is the strongest signal in this report for where to spend hardening effort first.

## 3. Coverage & CRAP-style risk read

- **303 tests across 22 files, all passing** (docs say "281," now stale). Testing is **entirely engine/server-side** — there are zero tests for `src/components/*.tsx`, zero for `src/hooks/*.ts` (including `useGame.ts`, the one hook actually holding client realtime state), and no `jsdom`/`@testing-library` is even installed. The fuzz suite (150 seeded full games, chip-conservation + top-up + termination invariants) is real and exists as described.
- **No coverage tooling is installed** — `@vitest/coverage-v8`/`-istanbul` are only listed as optional peer deps, not actually present; `npx vitest run --coverage` fails immediately. **There is no line/branch coverage percentage available today** — only the mutation-kill-rate proxy below.
- A true CRAP score (`complexity² × (1−coverage)³ + complexity`) can't be computed without (a) a cyclomatic-complexity tool and (b) real branch coverage — neither exists in-repo right now. Using mutation kill-rate as the best available substitute for "is this code actually exercised, not just executed":
  - **`engine.ts`**: high complexity (as above) but also the largest test investment (1,523 combined test lines across `engine.test.ts` + `engine.hardening.test.ts`) — still has **87 surviving mutants** out of 855, the most in absolute count. High complexity + high-but-incomplete coverage = the classic CRAP-score danger zone. This is where a bug is most likely to hide and most costly to hit in production.
  - **`kv.ts`**: lower complexity, but **16 of 59 mutants have zero coverage at all** — the fallback/env-detection paths the security audit flagged as risky are apparently the exact paths nobody is testing.
  - Other above-baseline survivor counts: `evaluator.ts` (14), `seating.ts` (12), `pots.ts` (11), `store.ts` (10).
  - The cached mutation report (`reports/mutation/mutation.json`) is **23 days stale** relative to the audit date and 5 relevant commits behind — its 91.2%/91.1% headline number should not be quoted as current without a fresh run.

## 4. iPhone-app gap analysis

The engine's purity (framework-free, injected `now`/`randInt`) is the single biggest asset for a mobile port — it's reusable regardless of which path below is chosen. The UI layer and realtime transport are where the real work is.

**Path A — wrap the existing web app (Capacitor/WKWebView shell), fastest to a real App Store listing:**
- `EventSource`/SSE generally works fine inside a WKWebView (it's just a web page), unlike true React Native — so `useGame.ts`'s SSE+poll+visibilitychange design mostly transfers, but iOS suspends WebViews on backgrounding and Capacitor's app-lifecycle events (`appStateChange`) differ from browser `visibilitychange` — the resync logic needs a native-lifecycle hook, not just the DOM event.
- httpOnly cookie persistence inside WKWebView across app restarts/updates needs explicit verification — WebView cookie jars are not guaranteed to behave like mobile Safari's.
- **No push notification infrastructure exists at all.** SSE only works while the app/WebView is alive; a backgrounded or closed app cannot learn "it's your turn." For a turn-based game this is a real UX gap, not a nice-to-have — closing it means APNs integration (device-token registration tied to `playerId`, a server-side trigger on turn-start, and a push-sending service).
- **Apple App Store review risk**: a bare WebView wrapper around an existing website is a common rejection under Guideline 4.2 (Minimum Functionality) unless it adds native value (push, native share, etc.) — reinforces that push notifications aren't optional if this path is chosen.
- **Guideline 4.7/5.3 (gambling)**: since this looks like poker with chips, review risk is materially lower as long as it's clearly play-money/no-real-currency — worth keeping explicit in App Store copy and in-app messaging as the mobile launch approaches.

**Path B — native React Native rewrite:**
- `EventSource` isn't available natively (would need `react-native-sse` or fall back to polling); `Table`/`Seat`/`PlayingCard` (SVG-based) and `motion` animations are DOM/web-only and would need `react-native-svg` + `Reanimated` equivalents; Tailwind would need `NativeWind`. Bigger lift, but the pure engine ports untouched.

**Recommendation**: Path A (Capacitor wrap) is the pragmatic v1 — it reuses ~95% of existing code — but budget for push notifications and native-lifecycle reconnect handling as first-class work, not an afterthought, since App Store review and actual gameplay UX both depend on it.

**Other mobile-relevant gaps already partially handled**: the iOS GPU constraint (no `backdrop-filter`/`filter` on animated elements) and shared-`AudioContext`-on-`pointerdown` pattern are already documented and followed in `CLAUDE.md` — a good sign the team has hit real device issues before and encoded the fix.

---

## 5. Recommended hardening roadmap

**Phase 1 — close the corroborated gaps (security + coverage agree), low effort:**
1. Add independent startup assertions for `SESSION_SECRET` and Redis credentials (fail fast/loud on boot, not lazily per-request, not gated solely by a `NODE_ENV` string match).
2. Add targeted tests for `kv.ts`'s fallback/env-detection branches — the exact paths flagged as both a security risk and a coverage gap.
3. Add rate limiting to `POST /api/games`, `.../join`, `.../action`, and SSE connection establishment — Upstash Redis is already in place, so `@upstash/ratelimit` is a natural fit.
4. Add basic security headers (`X-Frame-Options`/CSP `frame-ancestors`, `X-Content-Type-Options`, HSTS) via `next.config.ts` `headers()`.
5. Bump `next` to clear the 4 high-severity transitive advisories; re-run `npm audit`.

**Phase 2 — measurement infrastructure (needed before you can trust any "% covered" claim):**
6. Install `@vitest/coverage-v8`, add a `coverage` script and CI gate with a real threshold.
7. Stand up a minimal CI workflow (`.github/workflows/`) running `test`, `typecheck`, `lint` on PRs — currently nothing enforces "run tests before pushing" beyond habit.
8. Re-run `npx stryker run` fresh (current report is stale) to get a trustworthy mutation baseline before deciding where to invest more hardening tests.

**Phase 3 — targeted hardening (spend effort where CRAP risk is highest):**
9. Add scenario tests aimed at `engine.ts`'s surviving mutants specifically (not just more coverage — coverage that kills those particular mutants), given it's the largest, most complex, and most consequential file.
10. Follow up on `evaluator.ts`, `seating.ts`, `pots.ts`, `store.ts` survivors in that order.
11. **Mutation testing verdict: keep it, and treat it as more authoritative than line coverage for prioritization** — the `kv.ts` finding in this very report is a direct product of it. It correctly separated "code that runs during tests" from "code whose bugs would actually be caught," which is exactly what a CRAP-score approach needs and line coverage alone can't tell you. Just fix the staleness problem (Phase 2, item 8) so it's trusted input rather than a stale snapshot.

**Phase 4 — iPhone-app groundwork (once the above is stable):**
12. Decide Path A vs. B explicitly (recommend A) — a real architecture decision worth a short discussion before committing engineering time.
13. Design push-notification infra: device-token storage tied to `playerId`/session, a server-side "turn started" trigger, APNs (or a wrapper service) integration.
14. Wire native app-lifecycle events into `useGame.ts`'s reconnect logic alongside the existing `visibilitychange` handling.
15. Verify WKWebView cookie persistence across app restarts before relying on the current httpOnly-cookie identity model unchanged.
16. Add UI/component test infrastructure (`@testing-library/react` + `jsdom`) before the mobile UI layer grows further untested — currently zero front-end tests exist.

---

## Methodology — how to re-run this audit

Run three independent **read-only** passes in parallel (each scoped to *read and report*, never fix, so findings stay independent and can corroborate each other), plus a manual synthesis pass for any mobile-porting angle.

### Pass 1 — structure & complexity
- `wc -l` across `src/**/*.ts(x)` (or the app's equivalent source root) sorted descending, to find size hotspots. Flag files that mix many responsibilities vs. large-but-cohesive single-purpose files (e.g. a reducer/state machine is fine being big; a file doing routing + validation + business logic + formatting is not).
- `grep -rn ': any\|as any\|@ts-ignore\|@ts-expect-error' src/` for type-safety erosion.
- Read the `tsconfig.json` for `strict` and related flags; read the lint config for enforced rules (or their absence).
- Read `package.json` dependencies/devDependencies; flag anything DOM/browser-only if a mobile port is planned (e.g. `EventSource`, animation libraries, CSS frameworks) since those are exactly what breaks or needs a shim under React Native.
- Grep for duplicated fetch/validation/response logic across API route files — a sign the app lacks shared request/response helpers.

### Pass 2 — security
- Full read of the identity/auth module: how are cookies/tokens constructed, is MAC/signature verification constant-time (look for `timingSafeEqual` or equivalent, not `===`), and what happens if the signing secret is missing — does it hard-fail at boot, or silently degrade to an insecure default?
- Every API route: input validation, authorization (is the acting identity derived from a verified server-side credential, never from a client-supplied body field?), error responses (no stack traces/internals leaked to the client).
- The storage/concurrency layer: is there an atomic compare-and-swap (or equivalent) around state mutation? What happens if the "real" backend's credentials are absent — does it silently fall back to something unsafe for production (in-memory store, hardcoded secret, etc.)?
- The redaction/serialization boundary, if the app has private-per-user state: grep every response path (JSON responses, SSE/WebSocket pushes) to confirm all of them route through the redaction function and none serialize the raw internal state.
- Realtime/streaming endpoints: connection auth, and whether connections are rate-limited/capped (SSE/WebSocket endpoints are an easy DoS/cost vector if not).
- `grep -rn 'dangerouslySetInnerHTML\|innerHTML'` for XSS surface; grep for hardcoded secrets/keys; confirm `.gitignore` covers `.env*` and any deployment-tool directories.
- Check the framework config / middleware for security headers (CSP, `X-Frame-Options`, HSTS) and CORS policy — commonly just absent.
- `npm audit --omit=dev` for dependency CVEs; note which are reachable from app code vs. transitive/build-time only.

### Pass 3 — test coverage & mutation testing
- Inventory test files by directory to find untested layers (commonly: UI components and client hooks have zero tests when a project's discipline is engine/server-focused).
- Check whether a coverage tool is actually installed (`@vitest/coverage-v8` or equivalent) vs. just referenced in config — try running the coverage command and see if it errors.
- If a mutation-testing config exists (Stryker or similar), read its scope/exclusions, and check any cached report's **timestamp against recent commit history** before quoting its numbers — a stale mutation report is worse than none because it looks authoritative.
- Cross-reference: files with both high structural complexity (Pass 1) and low mutation-kill/no-coverage mutants (this pass) are the CRAP-score danger zone — prioritize hardening there first, not by raw LOC or by test count alone.
- Check for a CI workflow enforcing tests/lint/typecheck on PRs — "run tests before pushing" as a doc comment is not a gate.

### Optional pass — iOS/mobile-port readiness
Only if the target repo is also headed toward a native wrap: identify anything DOM-only in the realtime/animation/styling stack (`EventSource`, CSS-in-JS/Tailwind, DOM animation libraries) — these mostly transfer fine under a WebView wrapper (Capacitor-style) but need shims/rewrites under true React Native. Check for any push-notification infrastructure (there usually isn't any yet). Note any already-documented device-specific gotchas (e.g. iOS WebView GPU/animation constraints) as a signal the team has hit real hardware issues before and captured the fix.

### Execution notes
- Running the three main passes **in parallel** (e.g. as separate background research agents) rather than serially is what makes this fast and lets findings cross-corroborate without one pass anchoring the others.
- Every pass should be strictly read-only — no fixes, no edits — until the full report is reviewed and prioritized. Findings that show up independently in two passes (as `kv.ts` did here) are the highest-confidence signal for where to start.
