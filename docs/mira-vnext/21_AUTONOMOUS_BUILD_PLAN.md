# Autonomous build plan

An agent can be instructed to read `docs/mira-vnext/00_README.md` and complete the remaining work across phases. Inspect the current tree first and preserve user changes. Keep each phase's evidence linked to [20](20_ACCEPTANCE_TESTS.md), with a `PASS`, `FAIL` or `KNOWN-RISK` record. A `FAIL` blocks dependent functionality; a known safety/privacy or false-assurance defect is never waivable. [D30](22_DECISION_LOG.md) deferred new external API and partner integrations for the **2026-10-02 local build only**. Later sessions should use the recorded provider backlog and actual credentials/source rights; missing inputs still require honest disabled states. This plan does not authorize deployment.

## Phase 0 — Baseline and contracts

- **Objective:** establish a reproducible baseline and executable domain contracts before changing UX.
- **In scope:** inspect dirty tree, current behaviour and APIs; record seven scenario baselines; add tests/fixtures for present emergency, journey, geo failures and retention; settle versioned intent/evidence/action types as pure contracts.
- **Out of scope:** new home, provider, database migration or public-facing feature.
- **Dependencies:** none beyond repository access and existing tests.
- **Exact systems:** `src/domain/*`, `src/server/providers/geo/*`, `src/server/providers/companion/*`, `src/server/trips/*`, `src/worker/jobs.ts`, `tests/{unit,integration,e2e}`, operational docs.
- **Expected behaviour:** unchanged for users; baseline results distinguish shipped behaviour from target gaps.
- **Acceptance:** tests capture current urgent path, route-null vs provider failure, trip close/purge, and current privacy boundary; contract supports remote/future origin and explicit unknown without inferring current GPS.
- **Required tests:** existing suite plus targeted contract and regression tests; review browser/device baseline where possible.
- **Privacy/safety:** no production telemetry or raw fixture with a real user's movement.
- **Rollback/stop:** contract/test changes can be reverted; stop if pre-existing failures make baseline unknowable, and record them without changing user code silently.
- **Documentation:** update `02`, `17`, `20` with discovered deviations and phase evidence; log material decisions in `22`.

## Phase 1 — Intent and plan, as a vertical entry path

- **Objective:** let a guest or signed-in user express a local or future movement intent and retain it across the existing entry surfaces.
- **In scope:** typed, ephemeral plan state for purpose, origin/destination/loop, planned time/time zone, mode, constraints and explicit source of location; named-origin path without device permission; search ambiguity and edit/clear controls; Go as the intent entry with compatibility routes for Today/Around/Mira.
- **Out of scope:** safety recommendation, visual rebrand, persistence by default, background location, multi-leg travel.
- **Dependencies:** Phase 0 contracts.
- **Exact systems:** `src/app/(app)/{GoScreen,TodayScreen}.tsx`, `src/components/app/TabBar.tsx`, `around/*`, `mira/MiraChat.tsx`, `src/lib/location-store.ts`, `src/app/api/geo/search/*`, new pure plan model/state code; auth boundary if guest access is added.
- **Expected behaviour:** Go opens with one intent action; S1/S3 can enter time and remote origin; map/text navigation does not replace intent with “near me”; useful provider/place result or explicit resolution failure appears.
- **Acceptance:** no location grant or sign-in for transient plan; no silent plan loss on navigation; clear state when geocode ambiguous/unavailable; legacy entry, deep links and Emergency remain reachable.
- **Required tests:** unit serialization/state tests, integration guest/no-location/future-time tests, Go/legacy entry and browser back/deep-link tests.
- **Privacy/safety:** plan ephemeral; no analytics copy; obtain exact location only at “from here.”
- **Rollback/stop:** feature flag or adapter fallback to current entry routes; stop if unauthenticated query path leaks account data or old routes break.
- **Documentation:** update `14`, `17`, `20` and phase result.

## Phase 2 — Grounded option comparison for local movement

- **Objective:** turn the plan into feasible, comparable options for early run, late return and local destination.
- **In scope:** deterministic source/freshness/coverage eligibility; route/ETA and daylight evidence; hours/lighting only when supported; comparison of real alternatives and explicit unknowns; text and map views of same plan.
- **Out of scope:** universal risk score, inferred crime probability, fabricated transit/ride availability, local community claims without verification.
- **Dependencies:** Phase 1; provider rights and error-state audit.
- **Exact systems:** `src/domain/{context,evidence-state,routing}.ts`, `src/server/know/graph.ts`, `src/app/api/geo/{route,nearby}/*`, `src/server/providers/geo/*`, Around/map components and new option display.
- **Expected behaviour:** S1–S3 get practical options and tradeoffs; if a provider lacks future service facts, the plan says what can and cannot be checked.
- **Acceptance:** each local/time-sensitive claim traces to source/time/scope; no “safe” guarantee; missing, empty, stale and failed states differ; no route drawn from approximate geometry.
- **Required tests:** deterministic evidence matrix, contradictory/expired provider fixtures, S1–S3 browser flows, accessibility of comparison.
- **Privacy/safety:** do not store a route trace by default; do not infer threat from people or occupations; respect map/provider storage terms.
- **Rollback/stop:** switch new comparison off and keep current place brief; stop for unsupported claim or unverifiable option ranking.
- **Documentation:** revise `08`, `12`, `14`, `17`, `20` to actual sources and evidence.

## Phase 3 — Ask Mira on the shared plan

- **Objective:** make conversation a second entry into the same intent → context → evidence → option → action contract.
- **In scope:** intent extraction, tool/evidence receipts, option explanation, one-question partial answer, explicit action proposals, structured and text parity, model-failure fallback.
- **Out of scope:** free-form generic travel chatbot, autonomous route/start/share, model-generated factual local claims without tools.
- **Dependencies:** Phases 1–2; chat retention and guest-rate-limit design approved by privacy review.
- **Exact systems:** `src/server/providers/companion/{tools,claude,persona,placeholder,index,types}.ts`, `src/app/api/mira/route.ts`, `src/app/(app)/mira/MiraChat.tsx`, action/state domain, tests. Preserve pre-existing user edits in these files.
- **Expected behaviour:** S1–S5 wording can enter Ask; results match structured option facts; user sees a plan/action card, not a generic lecture or tool list.
- **Acceptance:** no completion claim without receipt, urgent fast path before model, unsupported model claims blocked, one useful partial answer before any second clarification.
- **Required tests:** prompt/tool adversarial fixtures, response validator, failure/timeout, NDJSON contract, S1/S5 conversation tests, redacted logging inspection.
- **Privacy/safety:** current 30-day raw user-text retention requires explicit minimisation decision before broad guest planning; preserve output filtering, daily limits and emergency bypass.
- **Rollback/stop:** route conversation to deterministic plan/legacy chat behind flag; stop on hallucinated source, privacy regression or misrepresented action.
- **Documentation:** update `07`, `16`, `17`, `20` and phase record.

## Phase 4 — Chosen plan, foreground journey and discomfort

- **Objective:** connect option choice to a usable journey that can change and offer immediate support.
- **In scope:** attach chosen plan to existing trip lifecycle, explicit start/share receipts, current position age, route/ETA refresh, user-confirmed change, support-candidate evidence and emergency/contact actions.
- **Out of scope:** guaranteed background tracking, lock-screen maneuvers, dispatch, global staffed refuge, silent rerouting or sharing changes.
- **Dependencies:** Phases 1–3 for shared plan; privacy/worker parity; support-source review.
- **Exact systems:** `src/app/(app)/trip/TripScreen.tsx`, Home/Trips components, `/api/trips*`, `src/server/{trips,journey,help-points}/*`, `src/domain/help-points.ts`, `src/worker/jobs.ts`, `UnsafeSheet`, trip/contact token views.
- **Expected behaviour:** S1/S2 starts only on confirmation; S7 offers change, candidate place, contact and emergency immediately; hidden/locked browser shows stale last update truthfully.
- **Acceptance:** S7 and journey cross-cutting gates pass; existing missed check-in, close, revoke and retention remain correct; no unverified staffed/open claim; contact recipient changes require approval.
- **Required tests:** unit candidate/hours/reachability, integration worker/share/retention, browser active/resume, real iOS and Android screen-hidden and battery checks.
- **Privacy/safety:** no passive GPS, no unexpected contact notification, current location/point cap and token TTL remain floor; emergency accessible without AI.
- **Rollback/stop:** disable new journey features while current trip path remains; stop if worker heartbeat, alerts, purge or urgent action regresses.
- **Documentation:** update `11`, `14`, `16`, `17`, `20` and operator runbook.

## Phase 5 — Remote, multi-leg and global baseline

- **Objective:** extend the same plan to late arrival and basic domestic/international travel without assuming local density.
- **In scope:** destination time zones, departure/arrival legs, reviewed country essentials, per-claim coverage, hotel/airport/station named-place resolution, provider/manual handoff when service facts unavailable; explicit saved-plan and habit-consent controls in Journeys/You.
- **Out of scope:** bookings, fare guarantee, visa/legal advice, global 24-hour transport promise, unsupported emergency number.
- **Dependencies:** Phases 1–4 and audited country/provider data.
- **Exact systems:** plan/domain models, geo search/route providers, country registry/emergency UI, destination/arrival screens, Ask context/tools, Go/Journeys/You entry, `/api/me/plans`, `src/server/account/{saved-plans,habits}.ts`, migrations `0020–0021`, tests.
- **Expected behaviour:** S5–S6 can plan remotely without current location and see separate leg evidence and gaps; an explicit save preserves a plan, while new and legacy habit learning waits for consent.
- **Acceptance:** local time conversions and coverage labels correct; unknown-country emergency pathway explicit; unsupported late transport never described as available; save/open/delete is owner-scoped and opening never starts or shares a journey.
- **Required tests:** DST and time-zone fixtures, countries with full/partial/unknown coverage, no-route/provider-quota, S5–S6 browser tasks, saved-plan encryption/expiry/owner tests, Go and legacy-entry regression.
- **Privacy/safety:** future hotel and journey details ephemeral unless explicitly saved; no itinerary analytics or contact exposure; migrations do not treat the former habit default as consent.
- **Rollback/stop:** disable multi-leg entry and use the legacy entry flag if needed; keep single-leg plan and forward-compatible schema; stop on wrong time zone/emergency number, invented local facts or consent/retention failure.
- **Documentation:** update `12`, `14`, `16`, `20` and generated coverage only through its generator if registry changes.

## Phase 6 — Eligible community and local developments

- **Objective:** use verified, relevant observations and developments to improve a specific movement decision, without creating a feed.
- **In scope:** narrow fact checks/corrections, moderation/independence/freshness rules, claim expiry/withdrawal, plan-linked local development eligibility, provenance and low-density silence.
- **Out of scope:** public incident pins, gamified reporting, automatic conversion of private reports, city headline as route fact, universal safety score.
- **Dependencies:** Phase 2 evidence resolver; moderation/operations owner; source rights and threshold review.
- **Exact systems:** `src/server/contributions/*`, `src/server/report/*`, `src/server/aggregate/*`, `src/server/safety-intel/*`, `src/domain/{contributions,safety-updates}.ts`, `/api/{contribute,safety-updates}*`, admin and worker jobs.
- **Expected behaviour:** a relevant, eligible claim can change an option's explanation; otherwise user sees normal baseline answer. Post-journey correction is optional and short.
- **Acceptance:** S1 and S7 do not become falsely precise under sparse reports; abuse cases in [20](20_ACCEPTANCE_TESTS.md) fail closed; withdrawal/expiry removes downstream claim.
- **Required tests:** duplicate/brigade/stale/withdrawal fixtures, moderation audit, source-to-claim provenance, no-data and worker expiry tests.
- **Privacy/safety:** raw report remains private; no public contributor identity, exact sensitive trace or individual accusation; operators can correct/remove claim.
- **Rollback/stop:** feature flag individual claim class; stop if moderation capacity, false-positive impact or data rights are inadequate.
- **Documentation:** update `09`, `10`, `16`, `20`, moderation and contribution policies.

## Engineering completion check

There is no separate integration or external-user phase. The Go/Journeys/You entry, compatibility routes, explicit saved plans and habit-consent transition already exist locally; audit them against [15](15_V1_PRODUCT_CONTRACT.md) and [20](20_ACCEPTANCE_TESTS.md) as part of the core product. Engineering completion requires the seven scripted scenarios, privacy/emergency/worker regressions, device behaviour and supported source/provider claims to pass on the intended environment. Phase 6 enrichment may remain disabled where moderation and source gates are absent. A comparative user study may inform later product decisions, but it is not a build-completion gate. Deployment remains governed separately by [the public-beta checklist](../PUBLIC_BETA_RELEASE.md).

For the 2026-10-02 local continuation, independently buildable gaps used deterministic fixtures and provider work was recorded for the following integration session. Continue from the latest audit rather than repeating completed local work. Do not mark a scenario or the overall V1 engineering build `PASS` on the strength of a placeholder or fixture where live evidence is required.

## Phase result template

For every phase write: `Phase N — PASS/FAIL/KNOWN-RISK`, commit/working-tree reference, tests run and evidence paths, actual behaviour versus acceptance, unresolved risks with owner, rollback tested, and docs updated. A later agent may proceed only if every dependency passed or its optional enrichment is deliberately disabled with a documented baseline.
