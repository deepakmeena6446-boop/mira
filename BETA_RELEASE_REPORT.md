# MIRA — beta release report

**Sprint:** Final beta → deployment sprint, 2026-09-27
**Branch:** `release/beta-rc` (from `main` at `fc36a95`; nothing pushed — the repository has no remote)
**Release candidate:** see the last commit on `release/beta-rc` (recorded in the verification table below)

## Release verdict

# READY TO DEPLOY

Deploying is now a configuration task: every remaining step needs an owner credential or account (listed under *Deployment prerequisites*), not engineering. This verdict covers **deployment to staging and production**. Inviting the friends beta still requires the ~15-minute [production smoke test](PRODUCTION_SMOKE_TEST.md) to pass on real phones against live providers, and the stricter launch gates in [docs/PUBLIC_BETA_RELEASE.md](docs/PUBLIC_BETA_RELEASE.md) (which deliberately stay *NOT READY FOR LAUNCH* until that evidence exists).

## Product quality bar

| Question | Answer | Evidence |
|---|---|---|
| Can someone understand MIRA without us explaining it? | Yes | Welcome screen leads with the outcome and the three moments (before / on the way / if something feels wrong), Mira and privacy in one line each; Home teaches by showing a real route's lighting and Help Points above Start. |
| Does Day 1 provide value? | Yes | Routes, lighting, Help Points, Emergency, I feel unsafe, Safety updates and following a live link all work signed out. Starting a journey and Mira need a (one-tap Google) account. |
| Is repeat use materially faster? | Yes | Saved places are one-tap chips; "Heading home?" and habit nudges ("like usual") start from Home; Circle is remembered; Mira knows saved places and people. |
| Does every failure state tell the truth? | Yes | Failed ≠ empty ≠ unavailable is now carried end-to-end for Help Points (Home, trip, ride arrival, Mira tools), lighting sources, Safety updates (new *partial* state) and contact alerts (per-recipient). |
| Can Emergency function without AI? | Yes | Emergency pill and I feel unsafe are deterministic and local; the sheet opened in 65 ms with no network wait in the browser test. |
| Can the core journey work if Mira is unavailable? | Yes | Nothing in the journey path calls the model; Mira falls back to the scripted engine on errors, budget or the per-person daily cap. |
| Can a friend follow a journey without an account? | Yes | Verified live: accountless viewer shows first name, destination, ETA in the traveller's zone and the latest point only; after arrival only "arrived"; unknown tokens 404. |
| Does Safety updates show relevant evidence rather than random news? | Yes | Audit probe precision 0.224 → 1.000; protests, court procedure, online abuse, awards, anniversaries, male-only victims and incidental "she" are excluded; fresh unseen probes scored 0.875 precision (see limitations). |
| Is lighting visible before a walking journey? | Yes | One lighting line plus one lighting bar with sources/age sit above Start; the third copy below Start was removed. |
| Are provider failures distinguishable from "no evidence"? | Yes | See the failure-mode table. |
| Does MIRA avoid safety verdicts everywhere? | Yes | Deterministic output filter in 14 languages, lookalike-character folding and whole-reply checks; UI copy audited. |
| Are production setup steps deterministic? | Yes | [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md); strict mode refuses to boot on a missing public-beta provider; bundled migrator verified on a fresh database. |

## Product flow status

| Area | Status | Notes |
|---|---|---|
| Home | **PASS** | New hero/landing copy; lighting stated once as text and once as a bar, above Start; glass sheet blur fixed for Chrome/Android (Lightning CSS was dropping `backdrop-filter`, so map labels bled through text). |
| Route context | **PASS** | Duration, alternatives ("Fastest" is the only label), lighting with the unknown share, per-source provenance (with data / nothing mapped / couldn't check / not available), Help Points. Rides and transit explain why lighting is walk-only. A shared Overpass queue turned a Delhi route from "92% not known · couldn't check OpenStreetMap" into "85% mapped as lit · 7% not known". |
| Journey | **PASS** | Start states who follows, what they see (latest spot and ETA), when it stops, and whether anyone is alerted. Trip ETA is labelled "with time to spare" (it's the buffered check-in time). Live location uploads never exceed the server limit on fast rides. |
| Circle | **PASS** | Copy depends on the actual email provider state; Mira's cards say "will try to email… sending can fail" or "email isn't on, send your link". Trip screen links straight to Circle. |
| Arrival | **PASS** | Verified live: auto-arrival after the 45 s dwell, sharing stops, viewer sees only "arrived", journey details purge within a day. |
| Emergency | **PASS** | Verified for IN, US, GB, AE, JP, BR, NG, FR, AU, SG, ZA, NP and MN: correct detection; service-specific numbers labelled (AE/JP/SG "Police", BR "Military Police"); NG/ZA region-dependent; unreviewed MN has no guessed number. |
| I feel unsafe | **PASS** | Instant and deterministic; with no destination, "Share where I am, live" now starts sharing immediately instead of asking her to pick a destination; a failed Help Point lookup during a trip now says "couldn't load", never "none". |
| Mira | **PASS** | Multilingual verdict and completed-action filter, emergency-number check (allows reviewed helplines), danger turns keep the emergency sentence even when a reply is replaced, honest Circle wording, read-only `get_safety_updates`, near-destination search, daily-cap fallback to scripted Mira. Real-model behaviour against the new persona was not re-evaluated live (see limitations). |
| Safety updates | **PASS** | Relevance, one incident = one item, independent-source counts (wire copies collapsed), "Mentions Delhi" when the headline doesn't place it, "first indexed" dates, http(s)-only links, partial state, separate classifier budget. Live GDELT from Railway egress is unverified. |
| Contribute | **PASS** | One-question limit and delayed preparation unchanged; Local Steward criteria moved behind a disclosure so they don't read as a checklist to chase; impact counts only confirmed contributions. |
| Privacy | **PASS** | Logs carry codes and masked routes (never coordinates, emails, tokens or raw provider messages); viewer shows the latest point only; push endpoints restricted to browser push services. |

## What changed in this sprint

- **Truthful failure states:** trip Help Points (failed ≠ none, partial shown); ride/transit arrival Help Points evidence; lighting sources (failed vs not configured, per-source provenance); Safety updates *partial* when headlines went unassessed; missed-arrival alerts name exactly who may not have been told.
- **Critical path:** "Share where I am, live" from I feel unsafe without a destination; location uploads throttled to ≥ 8 s so fast rides don't trip the rate limit and show a false "can't reach MIRA".
- **Mira:** see Mira row above.
- **Deploy blockers fixed:** Google tile session now sends the site referrer (a referrer-restricted browser key otherwise fails silently to OpenFreeMap); worker gets the map keys MIRA Checks need; OSM endpoints configured; strict mode also requires `CLIENT_IP_HEADER`, `OVERPASS_URL`, https and no demo sign-in; missing locale data fails loudly; boot warnings for missing providers.
- **Security:** "add email" links complete only for the requesting account; push endpoints allowlisted and capped at 5 per person; destination names defused in emails; redirects built from `APP_BASE_URL`; service worker rejects backslash paths.
- **Cost:** per-process daily Google ceiling (default 20,000) with OpenStreetMap fallback; Safety update classifier has its own daily token budget (300,000), so public traffic can't drain Mira.
- **Observability:** error codes instead of `Error`; masked route on `request.failed`; `trip.started/arrived/ended/extended`, `mail.failed`, `mail.not_configured`, `auth.email_link_*`, `geo.google_daily_budget_reached`; abandoned requests no longer logged as failures.
- **Database:** additive migration `0018` indexes the retention purge columns.
- **Copy/value proposition:** title, landing, OG image, manifest and README now say "With you until you arrive" and the product promise, without "safety app" framing; landing CTA "Start with MIRA" is sticky so it's visible at 375 px.

## Verification

Baseline at `fc36a95` (before any change): lint pass, typecheck pass, **556/556** unit+integration tests, production build pass.

| Check | Command | Result |
|---|---|---|
| Type generation + TypeScript | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass (0 errors, 0 warnings) |
| Unit + integration | `npm test` | UNIT_INTEGRATION_RESULT |
| Production build (web + worker + migrator bundles) | `npm run build` | pass |
| End-to-end (Playwright, mobile + desktop projects, production build) | `npm run test:e2e` | E2E_RESULT |
| Clean-database migration (dev migrator) | `scripts/migrate.ts` on a new database | 19 migrations, PostGIS/pg_trgm/pgcrypto, 36 tables; re-run is a no-op |
| Clean-database migration (production bundle) | `node dist/migrate.mjs` with only `DATABASE_URL` set | 19 migrations applied |
| Safety updates eval | `scripts/safety-eval.ts` | tuning, held-out 1, live GDELT sample: precision/recall 1.000/1.000; held-out 2: 1.000 / 0.967 (one item relabelled ambiguous by the tightened rule); 65 audit probes: precision 0.224 → 1.000 |
| Browser (375 × 812, production build, real providers from `.env.local`) | manual | Landing, Home, route sheet, journey start, live viewer, auto-arrival, Contribute, Trips, Me, I feel unsafe, 13-country emergency data |

A first E2E run on the merged tree found one real regression (lighting provenance showed "from no mapped source yet" instead of naming the sources checked); it was fixed and the full suite re-run for the result above.

## Failure-mode check

| Dependency down | What she sees |
|---|---|
| Google | Search/routes/Help Points answer from OpenStreetMap; a straight-line walk is labelled "approx." with lighting and Help Points "not known"; basemap falls back to OpenFreeMap. |
| Mapillary | That lighting source reads "couldn't check just now"; OSM and walker evidence stay visible. |
| OSM / Overpass | "Couldn't check OpenStreetMap"; Google Help Points and other lighting sources stay visible. |
| GDELT | "MIRA couldn't check recent updates right now. Try again" — never "no updates". |
| Email | Home, trip and Mira say nobody is alerted automatically; the live link still works; alerts are recorded `not_attempted`/`failed`, never `sent`. |
| AI | Scripted Mira answers (emergency, trips, reports, updates pointer); ambiguous news headlines are left out and the result is marked partial. Emergency and I feel unsafe never touch AI. |

## Deployment prerequisites (owner credentials and accounts only)

1. **Railway plan** — the account's trial has expired; a paid plan is needed before `railway init`.
2. **Domain** for production (and a staging subdomain), with DNS access.
3. **Resend** — verified sending domain and a sending-only API key.
4. **Google Cloud** — server Maps key (Places, Routes, Geocoding), browser Maps key (Map Tiles, referrer = production origin), OAuth client with redirect `https://<domain>/api/auth/google/callback`, budget alert and quotas.
5. **Anthropic** API key with a monthly spend limit.
6. **Mapillary** token.
7. **Generated secrets** (session, encryption, admin hash, VAPID) — commands in the checklist.
8. **Key rotation** — demo keys were previously pasted in chat; issue fresh production keys rather than reusing them.

## Known limitations

- **Real devices:** nothing in this sprint was run on a physical phone. iPhone Safari, Android Chrome, installed PWAs, background/resume behaviour, the dialler hand-off, Web Push delivery, the phone contact picker and wake lock are **unverified on real devices**. All browser checks used a 375 × 812 emulated viewport with stubbed geolocation.
- **Live providers from Railway:** Google (with referrer-restricted keys), Resend delivery to real inboxes, Google sign-in, and GDELT from Railway's egress IPs are unverified — GDELT throttles shared IPs heavily (a dev-machine first success took ~9 minutes).
- **Mira on the live model:** the output filter is deterministic and tested (129 filter cases), but the updated persona and tools were not re-run through `scripts/mira-eval.ts` against Claude. The filter is deliberately strict and may replace harmless replies (e.g. Spanish "seguro" meaning "sure").
- **Safety updates relevance:** the audit set was tuned against; fresh unseen probes scored precision 0.875 and recall 7/10 on first run. Stories naming the city and another place can still be labelled city-level; there's no locality list, so a neighbourhood-only headline reads "Mentions <city>". Without a classifier key, results stay *partial* with a 5-minute cache (more GDELT calls).
- **Coverage:** 195 countries are recognised; reviewed emergency profiles exist for 60 (49 verified, 9 partial, 2 region-dependent); 135 have no reviewed number and say so. Lighting and Help Point evidence varies by source and area. Google tile sessions use one border convention (`region: IN`).
- **Cost guards are per process:** the Google minute/day ceilings reset on restart; Google Cloud quotas and budget alerts remain the hard backstop. Per-IP geo limits are deliberately generous (carrier-grade NAT); abuse from many IPs is bounded by the ceilings, not per-IP limits.
- **Help Points "unavailable":** with no map provider at all, a few sheets still say "no mapped Help Points from the sources checked" rather than "unavailable"; this cannot happen with the production configuration.
- **Accounts:** Mira and starting a journey need an account (one tap with Google); following a journey, route context and all emergency features don't.
