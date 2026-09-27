# MIRA — Execution Status

## MAJOR SCOPE UPDATE — GLOBAL COUNTRY COVERAGE + WOMEN SAFETY INTELLIGENCE (2026-09-27, branch `feat/global-day0-beta`)

Brief: the owner's "Major scope update", which supersedes the limited-country and generic-news assumptions. It has two phases:
- **A:** every one of the 195 sovereign states is in one registry, and fails honestly where it is unverified.
- **B:** Women Safety Intelligence replaces any notion of a generic news feed.

| Phase | Status |
|---|---|
| A — Global country coverage | PASS. 195/195 represented. The emergency data is honest about its gaps (135 not yet verified). |
| B — Women Safety Intelligence | PASS WITH KNOWN RISK. Built, tested and verified in the browser with sample data. Live GDELT from production egress and live classifier calls are not yet verified. |

### Phase A — what changed

- **One registry.** `data/countries/registry.json` holds all 193 UN members, the Holy See and the State of Palestine, plus Hong Kong as a territory because it already had a profile. Each entry has ISO alpha-2 and alpha-3, a canonical name, aliases, a calling code and a classification, with sources listed in the file. Nothing else in the code keeps a country list.
- **Emergency data stays in the 61 cited profiles** (`data/locales/<ISO>.json`), migrated rather than duplicated. They now carry:
  - explicit `covers` (police / ambulance / fire) per number;
  - `coverage: "regional"` and `limitation` where a number is qualified;
  - `regional` service gaps;
  - a declared `status` that tests prove equals what the cited numbers support.
- **Regional overrides.** `<ISO>-<SUB>.json` files are supported and tested with fixtures. No real override was invented.
- **Country special cases removed.** The Nigeria special case and the label-regex guess are gone from the code. Labels were fixed where a single-service number named another service or none (ES Guardia Civil, GH 112, CH 112, VN 114). The loader now rejects such labels.
- **Separate capabilities.** `CountryContext.capabilities` is kept apart from emergency: routes are provider-dependent; lighting, Help Points and safety updates are source-dependent; community signals are unavailable in the beta.
- **Fallback UX, live in the browser:**
  - Unknown country: "MIRA couldn't determine which country you're in…"
  - Known but unverified (Peru): "MIRA knows you're in Peru, but hasn't yet verified its local emergency information." It shows no `tel:` link and no 112 or 911.
  - Partly verified (Kenya): the three police numbers, labelled as police, plus "MIRA has not verified an ambulance or fire number."
- **Citation review.** All 75 cited hosts are recorded in `data/locales/sources.json` with their authority and source-hierarchy tier:

  | Tier | Source type | Hosts |
  |---|---|---|
  | 1 | National government | 35 |
  | 2 | Police / fire / health | 30 |
  | 3 | Telecom regulator | 9 |
  | 5 | European Commission | 1 |

  No blog, SEO or crowdsourced list is cited. Two provincial sources are noted (VN Dien Bien police, ZA Western Cape). A profile citing an unreviewed host fails the tests.
- **Found and fixed:** the Emergency options sheet (and the new Safety updates sheet) closed the instant it opened under React's development double-effect. It was mounted already open, so `useOverlay` popped its own history entry. Both sheets now stay mounted and toggle `open`. Production E2E never showed this, but the Emergency control must work everywhere.

### Global Country Coverage

```
Countries represented: 195 / 195

Emergency:
Fully verified:      49
Partially verified:  9   (CA, GH, KE, MA, MX, PH, RW, TH, UG)
Region-dependent:    2   (NG, ZA)
Not yet verified:    135
```

Hong Kong (a territory, not counted) is fully verified. The friends' countries:
- VERIFIED: IN 112, US 911, GB 999, AE 999 (police; 998/997), JP 110 (119 ambulance/fire), BR 190 (192/193), FR 112, AU 000, SG 999 (995).
- REGION_DEPENDENT: NG 112 (call centres rolled out state by state), ZA 10111 (fire numbers are per municipality).

Where source quality limits verification:
- Official sources don't itemise which services the number reaches: CA 911 (and territory coverage is unconfirmed), MX 911, PH 911, RW 112.
- No official fire and/or ambulance number is cited: GH, KE, MA, TH, UG.

The 135 unverified countries were not researched in this sprint; none was attempted and rejected. They show no number and say so. The full list and every limitation are in `docs/COUNTRY_COVERAGE.md`, which `scripts/country-coverage.ts` generates and `--check` keeps current. **The release must not claim verified emergency coverage in 195 countries.**

### Phase B — Women Safety Intelligence

The design is in `docs/SAFETY_UPDATES.md`. On Home, a restrained **Safety updates** line reads, for example, "2 recent women-safety updates from the past 7 days · Official advisories 1 · News reports 1 · Community reports: not in the beta". A destination card has the same line. A sheet holds the cards. There is no feed, no score and no colouring.

```
Provider(s):                  GDELT DOC 2.0 (discovery only; publisher + link kept), behind SafetyIntelligenceProvider;
                              fixture provider for tests/dev; official/police/transport feeds: interface ready, none connected
Countries technically reachable: all 195 (GDELT indexes worldwide news in ~65 machine-translated languages); depth varies widely
Languages represented:        deterministic gate: 13 (en es pt fr de it hi ja ko ar id/ms tr zh-Hans/zh-Hant);
                              any other language → classifier (relevance + translation); without ANTHROPIC_API_KEY, left out
Default recency:              7 days; the sheet can expand to 30; age always shown
Classification test cases:    228 (70 tuning, 70 held-out #1, 80 held-out #2, 8 real GDELT headlines)
Relevant correctly included:  first run on unseen data: held-out #1 15/26, held-out #2 20/30 (+4 routed to the classifier);
                              after vocabulary-only fixes: 91/91 across all sets (now regression tests, no longer unseen)
Irrelevant correctly excluded: first run on unseen data: held-out #1 33/34 (1 false positive: "stalking horse bid"),
                              held-out #2 38/38; now 108/108 across all sets
Duplicate clusters tested:    a 5-article story (incl. AMP copy + police statement) → 1 update, 4 sources, official lead;
                              2 distinct same-city stories stay separate; the real GDELT Mukherjee Nagar trio → 1;
                              the fixture pair in 12 countries
Provider failure behavior:    failed → "MIRA couldn't check recent updates right now." + Try again; partial → "Some sources
                              couldn't be checked"; empty → "No recent women-safety updates found from the sources MIRA checked
                              in this area. This does not mean no incidents occurred."; GDELT rate-limit text = failure, never
                              "no results"; failures cached 5 min
Location privacy:             coordinates only in the POST body to MIRA, reverse-geocoded (existing rounding) then discarded;
                              only the city (or region) name reaches GDELT; not logged, not stored, not in the cache (tested)
Caching behavior:             per city + window 30 min in Postgres (shared across instances); concurrent requests share one
                              call; per-article classifier decisions 14 days; client fetches once per ~1 km + window;
                              classifier only for ambiguous headlines (≤20 per fetch) under Mira's daily token ceiling
```

**Known limitations (Phase B)**
- **GDELT throttling.** GDELT throttled this machine's IP hard: the first successful response came after about 9 minutes of spaced retries. Shared hosting egress may see the same, so expect "couldn't check" until a second provider or cache warming exists. This is the main operational risk.
- **City-level location only.** A match means the article mentions the city, so the UI shows "(city-level)" and never a distance.
- **Recall depends on the classifier.** Many real headlines omit gender ("DU students stalked") and are routed to the classifier. Without a key they are dropped: precision holds, recall falls.
- **Classifier not measured live.** Its behaviour is covered only with a stubbed client. The default model is `claude-opus-5` at low effort (`SAFETY_CLASSIFIER_MODEL` overrides it), with server-side fallbacks on.
- **No generated summaries.** Cards show the publisher's headline.
- **Clustering.** Cross-language duplicates may show as separate updates. The shared-name rule can merge two incidents in the same neighbourhood within 72 h; each source's own headline stays visible.
- **"Official" is decided by host pattern only.** For example, `gob.mx` stays "news".

### Tests

- `npm run check`: lint, typecheck, **556/556** unit + integration.
  - New: `country-registry.test.ts` (17) and `safety-updates.test.ts` (52).
  - The privacy audit now covers `/api/safety-updates` and the new country keys.
- E2E (`npm run test:e2e`, production build): **46 passed**, 0 failed, 4 intentional cross-project skips.
  - New: `i-safety-updates.spec.ts` on mobile and desktop.
  - The Emergency specs assert the new "couldn't determine which country" copy.
- Migration `0017_safety_intel_cache` is applied on the dev database.

## GLOBAL DAY-0 BETA SPRINT (2026-09-26, branch `feat/global-day0-beta`)

Brief: the owner's "Global Day-0 Beta — 12-hour autonomous execution sprint". Source of truth: the five product documents plus `MIRA_LAUNCH_AUDIT.md`. The earlier P0/P1 record is kept below as history.

| Phase | Status |
|---|---|
| 0 — Baseline / repo truth | PASS |
| 1 — Global foundation | PASS WITH KNOWN RISK (Google OAuth client not yet created) |
| 2 — Product value / Home | PASS |
| 3 — Help / unsafe / emergency | PASS |
| 4 — Journey companion | PASS WITH KNOWN RISK (email alerts need Resend) |
| 5 — Mira intelligence | PASS |
| 6 — Contribute + reputation | PASS WITH KNOWN RISK (no human moderator; public notes off) |
| 7 — Personalisation foundation | PASS |
| 8 — Global QA | PASS WITH KNOWN RISK (real devices pending) |
| 9 — Production beta | FAIL — external blocker: Railway trial expired (owner must choose a plan) |
| 10 — Final audit | PASS (`MIRA_OVERNIGHT_IMPLEMENTATION_AUDIT.md`) |

### Sprint architecture contract (binding for every track)

- **Navigation (locked):** HOME · MIRA · TRIPS · CONTRIBUTE · ME (`src/components/app/TabBar.tsx`). Emergency is never a tab. Circle lives under Me (`/circle`).
- **Country Context:** one shape, `CountryContext` in `src/domain/country-context.ts`. Server: `countryContext(iso, region)` in `src/server/locale` reads every cited profile in `data/locales/<ISO>.json`. Client: `useCountry()` / `setCountry()` in `src/lib/locale-store.ts`. `/api/geo/reverse` returns `{ label, precise, country }`.
- **Emergency:** always rendered through `<EmergencyPill variant="pill" | "block" | "link" />`. Known number: one tap dials it. Unknown: it explains first ("MIRA doesn't know the local number"; 112 is connected by most mobile networks, 3GPP TS 22.101), then she chooses. No number is ever hardcoded in a screen, a prompt or an email. No LLM on this path.
- **Migrations:** `0012_global_day0` (journeys.tz / saved_place_id / start_hour, users.travel_prefs / remember_habits, journey_habits). The Contribute track owns `0013`. Any other schema change goes through the lead. The drizzle migrator applies by journal `when`, so the lead re-orders `when` at merge.
- **Words:** never Safe / Unsafe / Safest / safety score / "Safe Place". It's "Help Point", "mapped as lit", "not known". Never "reviewed by a person" (nobody is on moderation duty yet). Never "your contacts will be alerted" unless that channel is configured and verified.
- **AI decides relevance, not truth.** Mira only states facts from tools and context. No LLM on the Emergency or *I feel unsafe* paths.
- **Privacy:** no passive or background location collection; no location history beyond a journey (journeys are purged ≤ 24 h after closing); coordinates never in URLs, logs or emails; habits are learned only from completed journeys to saved places, and she can see and delete them.
- **Rewards:** no points, badges, streaks or leaderboards; nothing for incident reports. Impact counts only verified contributions.

### PHASE 0 — BASELINE / REPO TRUTH

PHASE: 0
STATUS: PASS

COMPLETED:
- Read the blueprint, the safety context engine, the intelligence & travel doc, the gap analysis, the launch audit, the previous execution status and the implementation audit. Inspected auth/session, the locale layer, Home, Trip, Help Points, the Google provider, Mira (Claude + placeholder), migrations 0000–0011 and the tests.
- Working today (from code and tests): journeys with live links, auto-arrival and missed-arrival email; route alternatives with lighting ("mapped as lit") and Help Points; *I feel unsafe* sheet (no LLM); Emergency pill; India locale profile; email magic-link sign-in; Web Push; Mira on Claude with a scripted fallback; per-person and global Mira caps; worker watchdog; readiness 503 on a stale worker.
- Partial or India-only, fixed by this sprint:
  - `112` hardcoded in 7 places, with the fallback everywhere;
  - `Asia/Kolkata` as the default time zone for emails and admin;
  - mode labels "Auto / cab", "Metro / bus";
  - Hindi/Hinglish-only persona;
  - police always in Help Point tier 1;
  - Google hours requested on every Help Point search (Enterprise SKU on every call);
  - identity = first name + cookie (email link optional);
  - tabs Home · Circle · Me;
  - "reviewed by a person" copy with nobody on moderation duty;
  - no contribution ledger, reputation or MIRA Checks;
  - no personalisation;
  - no production host.

TESTS (baseline, before any change): `npm run check` → lint pass, typecheck pass, 30 files / **210/210** unit + integration pass.

REGRESSIONS: none (baseline).

KNOWN RISKS:
- No Google OAuth client, no Resend key and no production domain exist yet (owner-held credentials).
- Journeys are purged ≤ 24 h after closing, so "previous journeys" in Trips can only mean the last day.
- `eta_at ≤ created_at + 4 h` limits long journeys.

FILES: this file.

NEXT: Phase 1 foundation (Country Context, emergency, tabs, migration 0012), then parallel tracks.


### PHASE 1 — GLOBAL FOUNDATION

PHASE: 1
STATUS: PASS WITH KNOWN RISK

COMPLETED:
- **Country Context** (`src/domain/country-context.ts`, `src/server/locale`, `useCountry()`):
  - one shape for ISO country, region, time zone, emergency numbers (primary / also / per service), helplines and source;
  - every profile in `data/locales/` is loaded and validated at startup.
- **61 cited country profiles**, all from official government or regulator pages:
  - Asia/Pacific: IN, JP, SG, TH, MY, ID, PH, LK, NP, BD, VN, KR, HK, AU, NZ;
  - Africa: KE, ZA, NG, GH, TZ, UG, RW, MA;
  - Middle East: AE, SA, QA, TR;
  - Americas: US, CA, BR, MX;
  - Europe: GB, CH, NO, and the EU 27 (with national police/ambulance/fire numbers and women's helplines where an official page states them; Ireland's primary number is 999).
  - Left out for lack of a national official source: PK, ET, EG.
- **Emergency** (`EmergencyPill`, three variants):
  - a known number is one tap;
  - an unknown one explains first ("MIRA doesn't know the emergency number for this country yet… mobile phones must treat 112 as an emergency number (3GPP TS 22.101)"), then she chooses;
  - no hardcoded 112 anywhere in screens, prompts or emails.
- **Google Sign-In** (OIDC code flow + PKCE, no SDK):
  - the ID token is RS256-verified against Google's JWKS, and iss / aud / exp / nonce / email_verified are all checked; state is kept in a sealed `__Host-` cookie;
  - it stores the Google account id, first name, and email only as a keyed hash plus an encrypted copy;
  - linking order: same Google account, then same verified email, then upgrade the signed-in first-name account in place (keeping places, contacts and trips), else a new account;
  - the session rotates on every sign-in;
  - first-name sign-in is a fallback, only when Google isn't configured or `ALLOW_DEMO_SIGNIN=on`;
  - half a Google client (id without secret, or the reverse) is a startup error.
- **No auth wall:** Welcome is two steps (the promise, then location) and lands on Home signed out. Sign-in is asked for only at Start with MIRA, saved places, Circle, contributions and Mira chat.
- **Time zones:** journeys store the phone's IANA zone. Emails, the viewer and the invite show the traveller's local time with its zone label. Nothing defaults to IST.
- **Tabs:** HOME · MIRA · TRIPS · CONTRIBUTE · ME.

TESTS:
- Google auth: 22 integration + 33 unit tests (success, reuse, email link, demo upgrade; every failure case, each with its logged reason; replay; deletion cascade; viewer needs no account).
- Country Context unit tests; time-zone unit tests.

REGRESSIONS: none (full suite green).

KNOWN RISKS:
- Google sign-in can't be used until the owner creates an OAuth client and sets `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (the redirect URI is in `.env.example` and `docs/DEPLOY.md`). Until then the fallback is first-name sign-in.
- Some country profiles have single-service primaries (e.g. JP 110 police, SA 999 police) — correct and labelled, but the profiles need reviewer sign-off (README rule 4).

FILES: `src/domain/country-context.ts`, `src/server/locale/index.ts`, `src/lib/locale-store.ts`, `src/components/app/EmergencyPill.tsx`, `data/locales/*.json`, `src/server/account/google-auth.ts`, `src/app/api/auth/google/**`, `src/app/api/auth/options/route.ts`, `src/components/app/{SignInSheet,SignInNotice,EmailSignIn}.tsx`, `src/app/welcome/Welcome.tsx`, `src/server/session/*`, `db/migrations/0012_global_day0.sql`, `src/components/app/TabBar.tsx`.

### PHASE 2 — PRODUCT VALUE / HOME

PHASE: 2
STATUS: PASS

COMPLETED:
- Home hero: **Where are you going?**, a one-line "before you go / on the way" subtitle for newcomers, search, saved-place chips, and one honest circle line. Emergency and *I feel unsafe* are at the top.
- **Journey context card:**
  - "18 min walk · 1.6 km · arrive around …";
  - Lighting row ("71% mapped as lit · 22% not known");
  - Help row ("4 Help Points along the way · first: …");
  - unknowns are always shown, with a one-tap "Why not known? · Community can improve this";
  - then **Start with MIRA**. "Fastest" is the only option label.
- **Travel modes explicit** (`src/domain/travel-mode.ts`): Walk · Ride / car · Transit.
  - `/api/geo/route` takes a `mode`. Ride uses Google Routes DRIVE (traffic-unaware, cheapest SKU); transit uses TRANSIT.
  - Live-checked in London, Dubai and Nairobi.
  - No provider route → "not known" and she sets her own ETA.
  - Ride/transit show Help Points where she arrives, and say that lighting is shown for walks.
- Distances follow the country's units (miles in US/GB).
- Habit-backed "like usual" suggestion (Phase 7) on Home.

TESTS: `journey-modes` integration (8: walk unchanged, ride/transit placeholder "not known", stubbed DRIVE/TRANSIT parsing, invalid modes 400, Google 429 → not known); travel-mode units; journey-context component test.

REGRESSIONS: none.

KNOWN RISKS: ride/transit routes aren't stored for the trip screen's route line (only walks are).

FILES: `src/app/(app)/HomeScreen.tsx`, `src/components/app/{ContextRow,RouteOptions,LightingSummary,SearchOverlay,HelpPointList}.tsx`, `src/app/api/geo/route/route.ts`, `src/server/providers/geo/{types,google,placeholder}.ts`, `src/domain/travel-mode.ts`.

### PHASE 3 — HELP / UNSAFE / EMERGENCY

PHASE: 3
STATUS: PASS

COMPLETED:
- **Help Point classes:** hospital, police, staffed rail/metro, airport, hotel reception, pharmacy, fuel, and 24-hour convenience store (off except where a country weight turns it on: JP, KR, TW, TH).
- **Situation-aware deterministic ranking** (`route | nearby | unsafe | emergency`):
  - police is one category, not universally first;
  - availability counts (open now > listed open > hours unknown; unknown at night is demoted and labelled "may be closed");
  - places ahead on the route come first;
  - an `emergency` situation promotes police and hospital;
  - her exclusions and per-class `prefer` weights are honoured (architecture for later preference UI).
- **Opening hours: Google primary, OSM fallback, cost-controlled.**
  - Discovery never asks for hours (Pro SKU).
  - Only the ≤ 5 shown are enriched via Place Details (`regularOpeningHours`, `currentOpeningHours.openNow`), cached 6 h, gated by `GOOGLE_PLACES_HOURS`, and counted against the Google budget.
  - Copy distinguishes **Open now · Google** / **Listed 9 AM–9 PM · OpenStreetMap** / **Hours not known**, and never says "staffed".
- Corroborated community corrections (gone / not this kind of place) remove a place from Help Points.
- ***I feel unsafe*** is instant, with no LLM and no network wait. Its actions, in order:
  1. Go to a Help Point (best + 2, "ahead on your way" during a journey);
  2. Tell my people / send the live link (uses the active journey and Circle; never re-asks);
  3. Call someone;
  4. Emergency (country-aware);
  5. helplines;
  6. Talk to Mira.

TESTS: ranking per situation (police not first when a closer open place exists; promoted in emergency), hours states, country weights; `help-hours` integration (no hours in discovery mask, ≤ 5 details calls, cache, gate, budget, OSM fallback, Sydney empty state).

REGRESSIONS: none.

KNOWN RISKS: country weights are product defaults, not cited data; Details "open now" is trusted for 20 min on the device.

FILES: `src/domain/{help-points,opening-hours}.ts`, `src/server/help-points/index.ts`, `src/app/api/geo/help/route.ts`, `src/server/providers/geo/{google,osm-live,placeholder}.ts`, `src/components/app/{UnsafeSheet,HelpNearSheet,HelpPointList}.tsx`.

### PHASE 4 — JOURNEY COMPANION

PHASE: 4
STATUS: PASS WITH KNOWN RISK

COMPLETED:
- The trip engine is preserved: the state machine, worker, alerts and auto-arrival are unchanged.
- **Trip screen:** destination, ETA in local time, mode, who's following (honest), Share prominent (native share → WhatsApp), next Help Point ahead, *I feel unsafe*, Emergency, I'm here, +10 min.
  - Mode-aware copy: "walking" / "by car or taxi" / "by transit".
- **Trips tab:** the active journey first, then "Earlier today" (journeys closed within the retention window; MIRA says it deletes them within a day). The signed-out state explains.
- **Shared viewer** (no account, ever): first name, state, ETA with the traveller's zone label, last location with its age, arrival.
  - After arrival: "Want MIRA with you on your journeys? **Try MIRA**" → `/` (no referral id).
- **After arrival:** one question at most (the night lighting question, else the journey's MIRA Check).
- **Honest alerts:** without an email provider or accepted contacts, the copy says nobody is alerted automatically and the share link is the way.
  - Email now goes through **Resend** (HTTPS API) when `RESEND_API_KEY` + `EMAIL_FROM` are set; SMTP remains for dev/E2E.

TESTS: `companion` integration (tz / saved place / start hour stored; foreign saved place 400; habit on manual + auto arrival; none for ended or non-saved; email shows the journey's zone; viewer with no cookies and allowlisted keys; Trips overview window); Resend unit + integration (sent / failed / not_attempted).

REGRESSIONS: none.

KNOWN RISKS:
- Automatic missed-arrival email stays off until the owner adds a Resend key and a verified domain; the app says so.
- Browsers can't track in the background (the screen must be on — existing honest copy).
- `eta_at ≤ start + 4 h` limits very long journeys.

FILES: `src/server/trips/{index,on-arrival}.ts`, `src/server/journey/*`, `src/app/(app)/{trip,trips}/*`, `src/app/t/**`, `src/server/mail/{index,resend,templates}.ts`, `src/lib/{time,trip-start,share}.ts`, `src/components/app/AfterArrival.tsx`.

### PHASE 5 — MIRA INTELLIGENCE

PHASE: 5
STATUS: PASS

COMPLETED:
- **Default model `claude-sonnet-5`** (`MIRA_MODEL` overrides), chosen from a live eval (`docs/MIRA_EVAL.md`): 16 prompts across Delhi, London, Dubai, New York, Nairobi and Tokyo.

  | Model | Full reply p50 / p95 | Tool choice | Languages | Safety checks |
  |---|---|---|---|---|
  | Sonnet 5 | 4.0 / 6.0 s | 16/16 | 5/5 | 16/16 |
  | Opus 5 | 5.2 / 7.7 s | 16/16 | 5/5 | 16/16 |
  | Haiku 4.5 | 2.5 / 3.8 s | — | — | rejected: it claimed "I'm calling the emergency help now" and used markdown |

- **Global context** each turn (no coordinates): local weekday/time in her zone, area, country, the emergency line (or "not known to MIRA"), saved places, Circle, active journey, and a coverage line saying MIRA has no crime or neighbourhood-safety data.
- **Tools:** `find_help_points` (ranked, with hours state), `get_local_emergency_info`, mode-aware `propose_trip`, `find_nearby`, `check_trip`, `offer_report`.
- **Unknowns:** "I don't have enough verified information to make that judgement", then factual context. Verdict words are logged (count only) for measurement.
- **Emergency never waits on the model:** a multilingual danger regex (15 languages) sends the Emergency card before any model call.
- **Budget:** 60 messages/person/day, a global daily message cap, and a new global daily token cap (`MIRA_DAILY_TOKEN_MAX`). When a cap is hit, or on any Claude error, the scripted (global, Country-Context-aware) Mira answers.
- **Mira tab:** a signed-out explanation with example prompts, suggestion chips, and a calm look.

TESTS: companion units (context has country/emergency line and no coordinates; tool routing; token fallback; multilingual regex; no literal 112); `mira-intelligence` integration.

REGRESSIONS: none.

KNOWN RISKS: one extra reverse-geocode per message that has a location; the eval is one run per case.

FILES: `src/server/providers/companion/**`, `src/app/api/mira/route.ts`, `src/app/(app)/mira/MiraChat.tsx`, `scripts/mira-eval.ts`, `docs/MIRA_EVAL.md`.

### PHASE 6 — CONTRIBUTE + REPUTATION FOUNDATION

PHASE: 6
STATUS: PASS WITH KNOWN RISK

COMPLETED:
- **CONTRIBUTE tab:** MIRA Checks, Correct something (a structured correction on a searched place), Report something (the private flow), Your impact (verified counts only), and Local Steward status with what's still needed.
- **MIRA Checks:** generated only from journey evidence — a Help Point the walk passed within 60 m, captured before the trip's points are deleted. One per journey, and it expires in 24 h.
- **Proof-of-usefulness lifecycle:** contribution → pending → independent corroboration (≥ 2 people, or 1 + agreeing listed hours) → verified → impact.
  - Contradiction means "reports differ" and nobody is credited.
  - Diminishing returns: a place and question counts once per 30 days.
  - **Incident reports create no receipt and no reward.**
- **Local Steward:** configurable thresholds (25 verified, 10 active days, 3 areas, 80% agreement, a 30-day-old durable account, no anomaly flags). Benefits are non-financial, and Stewards get no power to declare truth.
- **Privacy design:**
  - signals are unlinkable (keyed per-person hashes, no user id, no time of day);
  - her receipts are a separate ledger whose encrypted subject link is deleted when the receipt is decided;
  - lighting votes are one voice per person per stretch (fixes one person agreeing with themselves across weeks).
- **Reports:** honest copy ("Submitted privately. Reports may be reviewed before they can contribute to MIRA's information."). Public aggregate releases are OFF unless `PUBLIC_AGGREGATE_RELEASES=on`.

TESTS: contributions integration (11 + the lighting regression); contribution/reputation units (16).

REGRESSIONS: none.

KNOWN RISKS:
- No designated human moderator, so public notes stay off.
- Account deletion plus re-creation could add a second voice within a window; account age is enforced only for Steward.

FILES: `db/migrations/0013_contributions.sql`, `src/domain/{contributions,reputation}.ts`, `src/server/contributions/**`, `src/app/api/contribute/**`, `src/app/(app)/contribute/**`, `src/components/app/CheckCard.tsx`, `src/app/(app)/me/ImpactRow.tsx`, `docs/CONTRIBUTIONS.md`, `MODERATION_POLICY.md`.

### PHASE 7 — PERSONALISATION FOUNDATION

PHASE: 7
STATUS: PASS

COMPLETED:
- **Explicit preferences** (`users.travel_prefs`: preferred way of travelling), editable in Me.
- **Journey habits:** learned ONLY on arrival of a journey to one of her saved places. Stored: place, mode, start hour, count, last shared-with — no coordinates or routes.
- **"Like usual" suggestion** on Home only when ≥ 3 matching finished journeys exist within ±1 h. It names only contacts still accepted, and never fakes memory.
- **Me → "What MIRA remembers":** lists habits in words, has a switch (off deletes them) and "Forget all". Habits are purged after 400 days unused; account deletion cascades.

TESTS: habit units (threshold, midnight wrap, deleted contacts, modes); integration (arrival upserts; off deletes; cascade; retention).

REGRESSIONS: none.

KNOWN RISKS: `shareByDefault` exists in the schema, but no UI sets it yet.

FILES: `src/domain/{habits,travel-prefs}.ts`, `src/server/account/habits.ts`, `src/app/api/me/{prefs,habits}/**`, `src/app/(app)/me/PersonalSections.tsx`.

**Integration (lead):** the seven tracks were built in parallel worktrees with strict file ownership, then merged and conflicts resolved. Full suite after integration: lint clean, typecheck clean, **48 files / 453 tests pass** (baseline 30 / 210).


### PHASE 8 — GLOBAL QA

PHASE: 8
STATUS: PASS WITH KNOWN RISK

COMPLETED — live checks on the production build, with live Google Maps Platform and live Claude, in the in-app browser at 375×812. Locations were simulated by stubbing `navigator.geolocation`.
- **London:** "Westminster · Emergency 999".
  - Search Covent Garden → 2 walking options, 0.5 mi (miles), lighting shares, 12 Help Points.
  - *I feel unsafe* is instant: Help Points, share, call, Emergency 999, location in words.
- **Dubai:** "Downtown Dubai · Emergency 999". The map recentres on Burj Khalifa.
- **New York:** "Theater District · tel:911".
- **Nairobi:** tel:999.
- **Tokyo:** "Jinnan · tel:110". *I feel unsafe* lists "Ambulance / Fire 119".
- **Lima** (no profile): "Emergency" explains first, naming Peru, then Call 112.
- **Delhi, the full loop:**
  - sign in (first name; Google not configured yet), search Kamla Nagar Market, Start with MIRA;
  - the trip screen shows honest copy ("Nobody is alerted automatically…");
  - the live link opened with no cookie (API and page 200; first name, ETA with tz, location 20 s old);
  - I'm here → "You made it" → "Was the way lit?" → Partly → thanks;
  - the viewer then shows arrived and "Want MIRA with you on your journeys? · Try MIRA";
  - Trips shows "Earlier today"; Contribute shows 1 pending, nothing verified, and Steward needs;
  - Me shows every section;
  - Mira (live Claude): the neighbourhood-safety question → "I don't have enough verified information to make that judgement"; "Find somewhere staffed nearby" → ranked Help Points with "Open 24 hours (listed) · Google" / "Open now, listed until 10 PM · Google".
- **Fixed from QA:**
  - the map started on New Delhi for everyone (now the world until she's located);
  - Japan's 119 was missing from the unsafe sheet;
  - the unknown-number sheet said "doesn't know which country" when it did know;
  - the hours shortlist was spent on clinics without hours;
  - private doctors and homeopaths were counted as Help Points;
  - "0% mapped as lit" noise;
  - Help Points were fetched before the country was known (convenience stores never turned on);
  - Contribute copy named only email sign-in.
- **Degraded states** (E2E + integration): location denied, weak network (failed lookups say so), worker down (readiness 503, start refused, "checks paused"), AI unavailable (scripted Mira), email not configured (`not_attempted`, honest copy).

TESTS (final run on the last commit):
- `npx eslint .` clean; `tsc --noEmit` clean.
- `npx vitest run`: **48 files, 454/454 pass** (baseline 30 / 210).
- `npm run test:e2e` (production build + Playwright, mobile + desktop): **42 passed, 2 skipped, 0 failed** (10.1 min; baseline 40 passed).

REGRESSIONS: none found. E2E specs updated for intended behaviour changes: five tabs, explain-first emergency when the country is unknown, `tz` on the viewer.

KNOWN RISKS: real iPhone/Android not tested (needs the public URL); Help Point data quality varies by city.

FILES: `src/components/map/WorldMap.tsx`, `src/components/app/{EmergencyPill,UnsafeSheet,LightingSummary}.tsx`, `src/domain/{country-context,help-points,reputation}.ts`, `src/server/help-points/index.ts`, `src/app/(app)/{HomeScreen,trip/TripScreen,contribute/ContributeScreen}.tsx`, `tests/e2e/*`.

### PHASE 9 — PRODUCTION BETA

PHASE: 9
STATUS: FAIL (external blocker)

COMPLETED:
- The deployment is fully prepared: `docs/DEPLOY.md` Path A has the exact Railway CLI sequence (PostGIS `postgis/postgis:17-3.5` with a volume, web with pre-deploy migrations and a `/api/health/live` health check, worker with ALWAYS restart, the variable table, domain).
- Resend is wired; production env validation is in place.

BLOCKER: `railway init --name mira-beta` → "Your trial has expired. Please select a plan to continue using Railway." Choosing a plan is billing, so it's the owner's action. The Railway CLI is logged in as the owner.

NEXT (after the plan): run DEPLOY.md Path A → set the secrets → deploy web + worker → `curl /api/health/ready` → Google OAuth redirect → Resend test send → real-device pass.

### PHASE 10 — FINAL AUDIT

PHASE: 10
STATUS: PASS

COMPLETED: re-read the blueprint (§1, §5, §7–§9, §16) and the brief's definition of done, and compared them with the implementation. See `MIRA_OVERNIGHT_IMPLEMENTATION_AUDIT.md` (definition-of-done table with evidence, drift check, known risks, external blockers, P1 list, what to audit).

---

## HISTORY — P0/P1 execution (before the Day-0 sprint)


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
- Opening hours: Google hours need a pricier SKU (P1 decision; approved and on since 2026-09-26).
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
| 1. Help Point hours + deterministic ranking + filters; "Help Points near me" | Done. The OSM `opening_hours` strict parser runs open/closing/closed on the device clock, and places known closed (or closing before she'd arrive) are left out. Google hours sit behind `GOOGLE_PLACES_HOURS=on` (pricier SKU; owner approved "on", 2026-09-26). Class filters are stored with the account. There's a "Help Points near me" sheet on Home | `domain/opening-hours.ts`, `domain/help-points.ts`, `HelpNearSheet.tsx`, Me → Help Points |
| 2. Tell my people now + location in words | Done. It emails accepted contacts their live link with care wording, rate-limited to one per 5 minutes. On a private journey it adds her contacts (her tap is the consent); with no journey running it starts a "share where I am" one. The viewer page shows "asked you to check on them". Location in words (landmark, area, coordinates) is shown only on her screen, with a copy button | `trips/index.ts tellMyPeopleNow`, `UnsafeSheet.tsx`, `SharedTripView.tsx` |
| 3. Route alternatives | Done in P0 | — |
| 4. Next Help Point ahead on the trip | Done in P0, now hours-aware and filtered | `TripScreen.tsx` |
| 5. Widen "Was the way lit?"; viewer → user line | Done in P0 | — |
| 6. Web Push; durable sign-in | Done. Web Push: a worker outbox pushes each traveller update once and removes dead subscriptions; subscriptions are encrypted; there's a Me toggle and service-worker handlers. Email sign-in: one-time 20-min links via cookie + tap (mail scanners can't consume them), no enumeration, encrypted address, and sign-out no longer deletes a durable account | `providers/notify/push.ts`, `worker/jobs.ts`, `public/sw.js`, `account/email-auth.ts`, `/auth/link` |
| 7. Non-walking journeys with manual ETA | Done. Walk, Auto/cab or Metro/bus; she chooses the ETA; the 25 km walk limit doesn't apply; copy is mode-aware (trip screen, emails, viewer) | `trips/index.ts`, `HomeScreen.tsx` |
| 8. Emergency number + time zone via Location Context (India profile) | Done. `data/locales/IN.json` has every value verified on official pages (MHA ERSS 112, WCD 181 with "not in West Bengal" honoured, PIB IST). Reverse geocoding returns country/state, and the pill, sheet, missed banner and Mira SOS card use it. Without a profile it shows "not confirmed… 112 works on most mobile networks". Times use the place's zone label, not hardcoded "IST" | `server/locale`, `lib/locale-store.ts`, `lib/time.ts` |
| 9. ContextItem read-model; lighting freshness | Done. `domain/context.ts` (claim, source, observedAt, confidence tier, unknowns, verdict-free templates) feeds Mira's trip proposals: Mira gets evidence and picks relevance. Lighting shows "streets last edited 2016–2024" (OSM `out meta`) and "last seen" (Mapillary) | `domain/context.ts`, `server/lighting`, `LightingSummary.tsx` |
| 10. Notes display, encrypt saved places, tabs, OG image, attribution, Mira model | Done. Notes: off the map and out of "Around you"; a dated route-card line with "Why am I seeing this?". Places: AES-GCM at rest, with a worker backfill for old rows. Tabs: Home · Circle · Me. OG image. The official Google Maps logo (outlined, day/night variants from Google's attribution pack) on Google tiles. Mira: measured (below), kept `claude-opus-5`, switchable via `MIRA_MODEL` | various |
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
- ~~The "Google" mark is text~~ — replaced 2026-09-26 with the official Google Maps logo (`public/attribution/`, from Google's attribution assets zip).
- Web Push needs an installed PWA on iOS (16.4+). Delivery depends on the platform push services.
- The locale profile has no reviewers yet (the file requires 2 approvals). SMS to 112 is marked true per MHA's channel list, but support varies by state.
- Durable sign-in is email-only. Google OAuth is still not built (needs your OAuth credentials).
