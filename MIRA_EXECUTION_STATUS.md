# MIRA — Execution Status

*Development tracker for executing the approved plan (`MIRA_GLOBAL_PRODUCT_BLUEPRINT.md`, `MIRA_EXECUTION_GAP_ANALYSIS.md`, `MIRA_LAUNCH_AUDIT.md` Part 6). Not a product spec. Branch `feat/execute-approved-plan`, started 2026-09-26 from `2fe07ac`.*

| Phase | Status |
|---|---|
| 0 — Baseline & protection | PASS |
| 1 — Core proposition / information hierarchy | PASS |
| 2 — Emergency + I feel unsafe | PASS |
| 3 — Help Points | PASS WITH KNOWN RISK |
| 4 — Safety context presentation | PASS |
| 5 — Journey experience | PASS WITH KNOWN RISK |
| 6 — Community contribution loop | PASS |
| 7 — Production hardening | PASS WITH KNOWN RISK (code) · ops items external |
| 8 — Final QA / handover | PASS WITH KNOWN RISK (real devices + ops pending) |
| P1 — Complete Horizon 1 (gap analysis §2 P1) | see "P1 EXECUTION" below |

---

## PHASE 0 — BASELINE & PROTECTION

STATUS: PASS

COMPLETED:
- Read the approved documents (blueprint, safety context engine, intelligence & travel, gap analysis, future research, launch audit, README) and the implementation: Home, Trip, Welcome, shared viewer, Me, privacy, route/nearby APIs, Google + OSM providers, lighting, trips service, worker health, Mira (Claude + placeholder), tests.
- Verified two assumptions the plan left open:
  - Google Routes API returns walking alternatives in Delhi (`computeAlternativeRoutes`, 2 routes on two test pairs), and the OSM placeholder router already plans an alternate. Route options are feasible without a provider rewrite.
  - `smtpConfigured()` exists, so the UI can state honestly whether email alerts are available.

TESTS (baseline, before any change):
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm test`: 24 files, 169/169 pass
- `npm run test:e2e` (production build + Playwright, mobile + desktop): build pass, 32 passed, 2 skipped (7.9 min)

KNOWN RISKS:
- A dev server from another session is running on :3100; E2E uses :3300 and a separate `mira_e2e` database, so no conflict.

FILES CHANGED:
- `MIRA_EXECUTION_STATUS.md` (this file)

NEXT:
- Phase 1–5 share `HomeScreen.tsx` / `TripScreen.tsx`; the Help Point domain module (Phase 3) is built first because Home, route context and the unsafe sheet all depend on it.

---

## PHASE 1 — CORE PROPOSITION / INFORMATION HIERARCHY

STATUS: PASS

COMPLETED:
- Welcome step 1 leads with the promise: "Walk home. Your people will know." It has three bullets for Before / On the way / If something feels wrong. Removed "Hi, I'm Mira" and both "Google sign-in is coming soon" lines (welcome, sign-in sheet).
- Home: the sheet opens with **Where are you going?**, then saved-place chips, "Search a place or address", and one circle-status line that names the channel ("… get your live link by email", or "Email alerts aren't switched on yet" when SMTP isn't configured). Ask Mira and Report are quiet secondary links. "Around you" stays, lower down. The gradient Mira nudge card became a plain one-line prompt.
- Route sheet order: route (time, distance, arrive-around) → two context lines (lighting, Help Points) → **Start with MIRA** → who's alerted (honest per state) → full lighting + Help Point list → save place.
- Metadata and manifest describe the product; the "Demo mode" developer pill is gone from Me.

TESTS: E2E asserts the welcome headline, the "Where are you going?" heading and the channel line. Browser check at 375×812 (screens below).

REGRESSION CHECK: saved places, search, drop pin, long-press report/walk, inbox badge, install card, and signed-out flow all unchanged.

FILES CHANGED: `src/app/welcome/Welcome.tsx`, `src/app/(app)/HomeScreen.tsx`, `src/app/(app)/page.tsx`, `src/components/app/SignInSheet.tsx`, `src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/(app)/me/*`.

---

## PHASE 2 — EMERGENCY + "I FEEL UNSAFE"

STATUS: PASS

COMPLETED:
- `EmergencyPill` on Home and on the journey screen: `tel:112` through the phone's dialler, aria-label "Emergency call, 112", neutral styling, 44 px target. There's one source for the number (`src/domain/emergency.ts`), used by the pill, the sheet, the Mira SOS card, the missed banner and the report thank-you.
- `UnsafeSheet`, a first-class state, opens with **no model call and no network wait**. It shows the nearest ranked Help Point (Home: walk there; journey: show it, with "Directions in Maps"), two more, and a share action that depends on what's known (send the live link; or start a walk to the destination or Home; or sign in / choose a destination). **Call someone** uses the phone's contact picker where supported and a typed number otherwise; the number is never sent or stored. Then Emergency 112, and quietly Talk to Mira and I'm okay now.
- Mira: when she's uneasy, she gets options first (`TOOL_GUIDE`); no legal or medical instructions (persona); 60 messages per person per day.

TESTS: E2E `g-unsafe-and-contribution` checks that all actions are visible in < 2 s, that zero `/api/mira` requests are made, the `tel:112` href, that Call someone falls back to a number field, and that the Help Point opens its route. The same checks run on a journey. Integration test: the 60/day cap returns 429.

KNOWN RISKS: "Tell my people now" (a user-triggered alert) is P1 per the blueprint §5D staging; at P0 the sheet offers the live link.

FILES CHANGED: `src/components/app/{EmergencyPill,UnsafeSheet}.tsx`, `src/domain/emergency.ts`, `src/lib/share.ts`, Mira `claude.ts`/`persona.ts`/`MiraChat.tsx`, `api/mira/route.ts`, `ReportScreen.tsx`.

---

## PHASE 3 — HELP POINTS

STATUS: PASS WITH KNOWN RISK

COMPLETED:
- `src/domain/help-points.ts` holds the deterministic Help Point rules:
  - Classes: hospital, police, metro/train station (tier 1); hotel reception, pharmacy, fuel (tier 2). Clinics, doctors, labs, dispensaries, ATMs, cafés, shops, bus stops and PGs are excluded.
  - Ranking: walking time; tier 1 preferred when within ~2 min; at night, places whose hours matter but aren't known are demoted and labelled "may be closed"; places behind her on a journey are demoted.
  - Hours are shown only as the source lists them (`open24h` only for OSM `24/7`).
- Provider interface `helpPlaces(points, radius)`:
  - Google uses `includedPrimaryTypes` and accepts the primary type only. A live check showed doctors and labs carrying a secondary `hospital` type, and PGs typed `hotel`; a conservative name rule drops those.
  - OSM uses the local snapshot plus ONE Overpass `around`-polyline query per corridor.
- Route Help Points come from samples every ~900 m along every option, shared between options and capped at 5, kept within 200 m of the line, in the order she'd pass them. "Near me" uses `/api/geo/help`, prefetched on Home and the journey screen.
- "Along the way" (midpoint places) is replaced by Help Points.

TESTS: 13 unit tests (classes, plausibility, projection, corridor, sampling, ranking, determinism, copy without verdicts). Integration: route order, hours as listed, a chemist *shop* excluded, near-me, approximate routes claim nothing.

KNOWN RISKS:
- Opening hours: Google hours need a pricier SKU (P1 decision), so Google Help Points say "hours not known".
- Place-type quality varies (a "hospital" can be a small nursing home).
- Google cost: up to 5 Nearby calls per route and 2 per near-me lookup, bounded by the new per-process budget (Phase 7).

FILES CHANGED: `src/domain/help-points.ts`, `src/server/help-points/index.ts`, `src/app/api/geo/{help,route}/route.ts`, `src/server/providers/geo/{types,google,placeholder,osm-live}.ts`, `src/components/app/HelpPointList.tsx`.

---

## PHASE 4 — SAFETY CONTEXT PRESENTATION

STATUS: PASS

COMPLETED:
- Lighting wording follows source strength: **Mapped as lit** (OSM), "Lit, say MIRA walkers" (new `confirmed` share), "Streetlights mapped", **Mapped as unlit** (OSM `lit=no` was previously mislabelled "Reported dark"), and "Not known" always shown. Sources are named, with "map data can be old … not a safety rating".
- **Route alternatives.** Google `computeAlternativeRoutes` was verified to return walking alternatives in Delhi, and the OSM router already had an alternate. The API returns up to 2 alternatives within 1.5× of the fastest. `RouteOptions` compares them on time, lighting line (with unknown share) and Help Points count, sorted by time; "Fastest" is the only label, and "Not a safety rating" is shown. The chosen option's minutes set the ETA (`routeMinutes`, clamped server-side to 1–1.6× the fastest).
- Lighting for all options comes from ONE layer fetch; otherwise the polite-rate guard would make option B look "not known".
- Pre-existing map bug fixed: MapLibre adds per-call padding to the map's persistent padding, so route fits silently failed on phones. Padding is now set once.

TESTS: 3 lighting unit tests still pass; unit tests for the `confirmed` share; integration test that approximate routes carry no lighting or Help Points; E2E route region assertion. Browser-verified: route drawn and framed, and context lines read "88% mapped as lit · 5% streetlights mapped · 7% not known".

FILES CHANGED: `src/domain/lighting.ts`, `src/server/lighting/index.ts`, `src/components/app/{LightingSummary,RouteOptions}.tsx`, `src/components/map/WorldMap.tsx`, `src/server/trips/index.ts`.

---

## PHASE 5 — JOURNEY EXPERIENCE

STATUS: PASS WITH KNOWN RISK

COMPLETED:
- "Start with MIRA" replaces "Share my trip" (Home, Mira card). With accepted contacts and email on, there's a choice of *Share with Mum* or *Just me*. The route of the chosen option is kept on the device (sessionStorage) for the journey.
- Journey screen, top to bottom:
  - ETA and distance.
  - **I'm here**.
  - **Send my live link**: primary when nobody follows; Web Share, so WhatsApp works through the share sheet.
  - I feel unsafe / +10 min.
  - Who can follow, honestly: "emailed if you haven't arrived 10 min after your ETA", or "Only people you send your live link to can follow. Nobody is alerted…".
  - Nearest Help Point (ahead).
  - The Emergency pill sits under the header.
- **Safety net shown honestly.** `/api/trips/current` returns `safetyNet {worker, email}`, and the screen says "Missed-arrival checks are paused" when the worker is unhealthy. The "they'll see your last spot" line appears only when someone is following.
- Viewer page after arrival or end: a quiet "Want MIRA with you on your journeys?" and **Get MIRA** → `/` (no parameters).
- Pre-existing overlay bug fixed: the sign-in sheet, search and unsafe sheet were rendered under the tab bar (a fixed screen is its own stacking context). They're now portalled.

TESTS: E2E `a-share-trip` (Home → Start with MIRA with share choice, Emergency on Home + journey, live-link button, viewer invitation line) and the private-journey copy. Integration: `routeMinutes` clamps; `safetyNet` flips when heartbeats go stale.

KNOWN RISKS: background location is still impossible in a browser (existing honest copy). "Next Help Point ahead" uses a straight-line walking estimate, labelled "about".

FILES CHANGED: `src/app/(app)/trip/{TripScreen,page}.tsx`, `src/app/api/trips/current/route.ts`, `src/server/health/safety-net.ts`, `src/lib/trip-route.ts`, `src/app/t/[token]/SharedTripView.tsx`, `src/components/app/{SearchOverlay,SignInSheet}.tsx`.

---

## PHASE 6 — COMMUNITY CONTRIBUTION LOOP

STATUS: PASS

COMPLETED:
- "Was the way lit?" is now asked after **arrived or ended** journeys at night (same 18:00–06:00 window as before). It uses the route kept on the device, so it survives a reload. The answers are Lit / Partly / Not lit; values are unchanged, so the trust logic (`lit_votes`, ≥3 voters, 60% agreement, 90-day window) is untouched. The kept route is deleted once she answers or leaves.
- No dashboard, points, leaderboard, or "did you feel safe" question.
- The viewer → user line is covered in Phase 5.

TESTS: E2E with a night device clock: end early → "Was the way lit?" → Partly → "Thank you", `lit_votes` grows, and the kept route is cleared.

FILES CHANGED: `src/app/(app)/trip/TripScreen.tsx`.

---

## PHASE 7 — PRODUCTION HARDENING

STATUS: PASS WITH KNOWN RISK for the code; the ops items below are external blockers.

COMPLETED (code, from a read-only audit of worker, health, DB, secrets, cost and email):
- Worker: claimed alerts are **sent before** any other work in a pass, and each alert is isolated in try/catch. A claim that never completes now **notifies the traveller** ("Your contacts may not have been told") instead of leaving "I'm emailing…" standing.
- Worker process:
  - **Watchdog exit** (for the supervisor to restart it) if the journeys job hasn't completed within the readiness window (3 min), or after 10 consecutive heartbeat failures.
  - Structured `uncaughtException` / `unhandledRejection` → exit(1).
  - Every worker SQL statement capped at 30 s.
- Cost:
  - Per-process Google call budget (`GOOGLE_MAX_CALLS_PER_MIN`, default 600). Over budget, the adapter answers from OpenStreetMap, so spend is bounded without denial of service.
  - Mira global daily ceiling (`MIRA_GLOBAL_DAILY_MAX`, default 5000) on top of 60/person/day.
  - Rate-limit keys bucket IPv6 by /64.
- Confirmed OK by audit:
  - Readiness returns 503 on a stale worker, and trip start is refused.
  - The migrations journal and `CREATE EXTENSION postgis` are in place.
  - Retention for trips, points, reports, chat, notifications and lit votes.
  - No secrets in git history; `.env*` ignored.
  - Missing SMTP → alert recorded `not_attempted`, never `sent`.

TESTS: unit tests for /64 bucketing and budget refill; integration test for stale claim → `unconfirmed` + traveller notification. The existing missed-alert E2E (including Mailpit down → "couldn't confirm") still passes.

KNOWN RISKS (code):
- The Google budget is per process, not global.
- Geo endpoints stay callable signed-out (the unsafe sheet needs it); only per-IP limits plus the budget apply.
- No inactivity retention yet for `users` / `contacts` / `saved_places`; it's needed before durable Google sign-in ships (demo accounts already expire).

EXTERNAL / OPS BLOCKERS (not doable from the repo): hosting for web + worker with an always-restart supervisor; managed Postgres with PostGIS; HTTPS; production SMTP with SPF/DKIM, and a real invite plus missed-arrival email seen in a real inbox; rotating all four demo keys (Google server/browser, Anthropic, Mapillary), restricting them (server key to Places/Routes/Geocoding plus server IP; browser key to the domain plus Map Tiles), with quotas, budgets and alerts; an Anthropic spend limit; an uptime monitor on `/api/health/ready`; `TRUSTED_PROXY_HOPS`; and a commitment to check `/admin`.

FILES CHANGED: `src/server/journey/worker.ts`, `src/worker/main.ts`, `src/server/db/client.ts`, `src/server/providers/geo/budget.ts`, `src/server/providers/geo/google.ts`, `src/server/ratelimit/index.ts`, `src/app/api/mira/route.ts`, `src/server/config/env.ts`, `.env.example`, `README.md`.

---

## PHASE 8 — FINAL QA / HANDOVER

STATUS: PASS WITH KNOWN RISK

TESTS (final, on the committed code):
- `npm run check`: lint pass, typecheck pass, 27 files / **191/191** unit + integration.
- `npm run test:e2e`: production build pass, **40 passed, 2 skipped, 0 failed** (baseline 32 passed, 2 skipped).
- History, for honesty: the first full run had 5 failures from three causes, all fixed. (a) An ambiguous heading selector (test). (b) Timing measured across Playwright round-trips instead of in-page (test). (c) A **real ghost-tap bug**: the long-press card armed on a timer and now sat under the finger. It now arms after the finger lifts. A second run then had 1 failure, a `waitForResponse` race in the new test, fixed by waiting on visible state.

SCENARIOS (A–K from the brief): all walked through, in E2E and/or the browser at 375×812. See `MIRA_IMPLEMENTATION_AUDIT.md` → PRODUCT WALKTHROUGH. User J (weak network) also got a fix: a failed Help Point lookup now says "Couldn't load Help Points — check your connection" instead of "none nearby".

REGRESSION CHECK: map, search, route, lighting, saved places, trip start, live location, Share Link, contact view, arrival, +10 min, missed check-in (including SMTP down → "couldn't confirm"), contacts, reports, moderation, account deletion, privacy allowlists and PWA installability all pass in E2E.

KNOWN RISKS:
- Not tested on real Android or iPhone devices (installed-PWA session, contact picker, Web Share → WhatsApp).
- Ops blockers are listed in Phase 7.

FILES CHANGED: `MIRA_IMPLEMENTATION_AUDIT.md`, this file, `README.md`.

NEXT (owner): hosting + SMTP + key rotation (Phase 7 ops list), then real-device checks (launch audit Part 6, Phase 6), then P1 in the audit's order.

---

## P1 EXECUTION (owner request: "Fix the P1 issues, commit, then merge")

Owner decisions taken up front (AskUserQuestion): license **AGPL-3.0**; durable sign-in by **email magic link**; Mira model: **measure, then choose**; merge into **main**.

| Gap-analysis P1 item | Status | Where |
|---|---|---|
| 1. Help Point hours + deterministic ranking + filters; "Help Points near me" | Done. The OSM `opening_hours` strict parser runs open/closing/closed on the device clock, and places known closed (or closing before she'd arrive) are left out. Google hours sit behind `GOOGLE_PLACES_HOURS=on` (pricier SKU, owner's call; default off). Class filters are stored with the account. There's a "Help Points near me" sheet on Home | `domain/opening-hours.ts`, `domain/help-points.ts`, `HelpNearSheet.tsx`, Me → Help Points |
| 2. Tell my people now + location in words | Done. It emails accepted contacts their live link with care wording, rate-limited to one per 5 minutes. On a private journey it adds her contacts (her tap is the consent); with no journey running it starts a "share where I am" one. The viewer page shows "asked you to check on them". Location in words (landmark, area, coordinates) is shown only on her screen, with a copy button | `trips/index.ts tellMyPeopleNow`, `UnsafeSheet.tsx`, `SharedTripView.tsx` |
| 3. Route alternatives | Done in P0 | — |
| 4. Next Help Point ahead on the trip | Done in P0, now hours-aware and filtered | `TripScreen.tsx` |
| 5. Widen "Was the way lit?"; viewer → user line | Done in P0 | — |
| 6. Web Push; durable sign-in | Done. Web Push: a worker outbox pushes each traveller update once and removes dead subscriptions; subscriptions are encrypted; there's a Me toggle and service-worker handlers. Email sign-in: one-time 20-min links via cookie + tap (mail scanners can't consume them), no enumeration, encrypted address, and sign-out no longer deletes a durable account | `providers/notify/push.ts`, `worker/jobs.ts`, `public/sw.js`, `account/email-auth.ts`, `/auth/link` |
| 7. Non-walking journeys with manual ETA | Done. Walk, Auto/cab or Metro/bus; she chooses the ETA; the 25 km walk limit doesn't apply; copy is mode-aware (trip screen, emails, viewer) | `trips/index.ts`, `HomeScreen.tsx` |
| 8. Emergency number + time zone via Location Context (India profile) | Done. `data/locales/IN.json` has every value verified on official pages (MHA ERSS 112, WCD 181 with "not in West Bengal" honoured, PIB IST). Reverse geocoding returns country/state, and the pill, sheet, missed banner and Mira SOS card use it. Without a profile it shows "not confirmed… 112 works on most mobile networks". Times use the place's zone label, not hardcoded "IST" | `server/locale`, `lib/locale-store.ts`, `lib/time.ts` |
| 9. ContextItem read-model; lighting freshness | Done. `domain/context.ts` (claim, source, observedAt, confidence tier, unknowns, verdict-free templates) feeds Mira's trip proposals: Mira gets evidence and picks relevance. Lighting shows "streets last edited 2016–2024" (OSM `out meta`) and "last seen" (Mapillary) | `domain/context.ts`, `server/lighting`, `LightingSummary.tsx` |
| 10. Notes display, encrypt saved places, tabs, OG image, attribution, Mira model | Done. Notes: off the map and out of "Around you"; a dated route-card line with "Why am I seeing this?". Places: AES-GCM at rest, with a worker backfill for old rows. Tabs: Home · Circle · Me. OG image. Google mark on Google tiles. Mira: measured (below), kept `claude-opus-5`, switchable via `MIRA_MODEL` | various |
| 11. Public moderation policy; open-source readiness | Done. MODERATION_POLICY.md (describes what the code actually does); LICENSE (AGPL-3.0, verbatim from gnu.org), CONTRIBUTING, SECURITY, CODE_OF_CONDUCT (Contributor Covenant 2.1), PRINCIPLES, CODEOWNERS, CI workflow; V0 docs moved to `docs/archive/v0/` | repo root, `.github/` |
| (from P0 risks) Inactivity retention before durable accounts | Done. Email accounts unused for 400 days are deleted; activity is recorded to the day only | `retention.ts`, `session/user.ts` |

**Mira model measurement (2026-09-26, live API, one run per cell, first round).**
- **Opus 5:** 1.4–3.1 s.
- **Sonnet 5:** 1.7–1.9 s.
- **Haiku 4.5:** 1.1–1.8 s. It said "get home **safely**", which breaks the no-safety-promise rule.

All three chose the right tools: "uneasy" → options first (confirming the P0 fix on live Claude), and followed → emergency first. **Kept Opus 5:** the gap is under a second, it was fastest on the emergency prompt, and Mira is off every urgent path. `MIRA_MODEL` allows switching without a deploy.

KNOWN RISKS (P1):
- Opening-hours parsing ignores public-holiday rules. Hours are always labelled "listed".
- Google hours stay "not known" until the owner switches on the SKU.
- The "Google" mark is text, not the official logo asset. Replace it with Google's logo file before launch per their attribution guidelines.
- Web Push needs an installed PWA on iOS (16.4+). Delivery depends on the platform push services.
- The locale profile has no reviewers yet (the file requires 2 approvals). SMS to 112 is marked true per MHA's channel list, but support varies by state.
- Durable sign-in is email-only. Google OAuth is still not built (needs your OAuth credentials).
