# Acceptance tests and evidence gates

This is a product contract for a later build. A passing unit suite alone cannot prove a woman can act on an answer. Every V1 scenario needs scripted end-to-end checks and moderated user observation. Release requires current public-beta operational gates as well as these tests.

## Scenario demonstrations

| ID | Setup and action | Required observable outcome | Fail if |
|---|---|---|---|
| S1 Early run | Guest names a 4:45 AM loop in an unfamiliar area, denies location. | Mira keeps origin/time/mode, compares feasible routes or explains unavailable routing, separates calculated darkness from unknown lighting/activity, provides an actionable alternative and can start a foreground journey after confirmation. | It says “safe,” invents lit/open places, requires location/sign-in, or only offers nearest Help Points. |
| S2 Late commute | Signed-in user plans office → home at midnight and chooses a mode. | Shows sourced route and available hours/service *only if checked*, last-leg unknowns, optional named recipients, confirmed start, freshness and a change path. | It assumes service exists, shares by default, or shows stale GPS as live. |
| S3 Local destination | Guest enters a named destination and different named origin. | Search resolves ambiguity, planned arrival/return context stays attached across map/text/Ask and no current location is needed. | “Near me” silently replaces the origin. |
| S4 Date/event | User plans arrival and return and wants a check-in. | Mira provides movement options and optional explicit contact/check-in, with no relationship judgement or unsolicited safety warning. | It triggers sharing, surveillance, or a generic dating lecture. |
| S5 Late arrival | User plans a 1:30 AM airport-to-hotel transfer in another city. | Uses destination time zone, checked transfer/provider facts, confidence/unknowns and a booking/contact/manual fallback when service data is unavailable. | It asserts a particular taxi/train or airport exit is operating without evidence. |
| S6 Basic travel | User plans two city legs and asks what to know. | Country essentials have reviewed coverage labels; each leg has separate route/time assumptions; no booking or global local-safety guarantee. | Unsupported city detail is presented as verified or one leg overwrites another. |
| S7 Discomfort | Active user taps “I need options,” with location fresh, then stale/no network. | Immediate ranked *candidate* support/change/contact/emergency choices, reachable route or clear lack of it, hours/staffing uncertainty and direct emergency path. Stale state is explicit. | It waits for a model turn, calls a location “safe,” hides emergency, or claims a closed/unverified place is staffed. |

For each demonstration, the following data and fallback contract must also be checked:

| ID | Required checked data | Acceptable unknown behaviour and prohibited claim | Action and next state |
|---|---|---|---|
| S1 | Named origin/loop, local date/time, daylight and provider route; lighting/place signals only if available | Unknown lighting/activity is explicit. No “safe to run” or inference from the identity/occupation of people nearby. | Choose an option or time; confirm start → active journey. |
| S2 | Origin/destination, time zone, route/mode response, listed hours and chosen contact state | Unknown service or pickup is explicit. No promise of available transit/driver/contact receipt. | Choose mode, optionally share, start → active; later change → revised proposal. |
| S3 | Place resolution, origin, route and time | If place ambiguous, show candidates. No quiet switch to current location. | Confirm place/route → plan ready or chosen. |
| S4 | Venue, event/return times if supplied, route and contact choices | Unknown venue access or return service is explicit. No inference about the date/person. | Save or start chosen leg; chosen check-in → active/return-ready. |
| S5 | Arrival local time, origin/terminal, hotel/place, provider/official transfer data where available | If service/hotel hours cannot be checked, offer manual/provider handoff. No operating-service assertion. | Choose arrival plan → saved or active on arrival. |
| S6 | Country profile coverage, separate places/time zones/routes for each leg | Country number/local rule or leg details may remain unknown. No fabricated cultural/legal certainty. | Save explicit legs or inspect one → leg plan ready. |
| S7 | Last location age, route to candidate if calculable, hours/source, contacts/emergency profile | Unknown staffing/reachability is explicit; stale location never implies current position. No “safe place” label. | Choose change/place/contact/emergency → confirmed active change or direct external action. |

## Cross-cutting tests

| Area | Testable gate |
|---|---|
| Evidence | Every local/time-sensitive claim has traceable source, observed/published time, scope and eligible freshness. Contradictions and no-data produce an explicit unknown, never a fabricated score or route property. |
| Ask Mira | Compare direct text and structured entry for the same intent; same plan/options and facts. Mock hallucinated tool output and unsupported model prose: validation blocks it. Failed action cannot be narrated as complete. Emergency fast path bypasses model. |
| Plan/actions | Choice and change require confirmation; a changed destination/route/contact set creates a new receipt and does not silently overwrite what contacts see. Refresh preserves intent and constraints. |
| Provider failure | Geocode ambiguity, zero routes, quota, malformed hours, no maneuvers, expired local signal, no location permission and offline mode each yield a specific useful partial state. No straight-line ETA labelled as walking ETA. |
| Navigation | On real iOS/Android browsers test foreground position age/accuracy, wake lock, screen hidden/locked, resumption, ETA drift and battery. No background claim. Check text equivalent and support access during movement. |
| Journey/worker | Current 4h cap, last 20 points, missed ETA rules, chosen-contact notification, close/revoke, 30m token grace and 6h purge are regression-tested or deliberately replaced by an approved equivalent. Worker heartbeat failure cannot masquerade as monitoring. |
| Emergency | Direct, reachable from all journey states, correct reviewed country/region number when known, explicit unknown when not; dialler action only, no dispatch claim. Network/model/account failure does not conceal the action. |
| Privacy/abuse | Guest and no-location paths; consent before save/share; per-recipient visibility/revocation; habit migration; delete/retention; no precise coordinates, routes, destination text, chat text or contacts in analytics, logs, push previews or public contribution output. Test compromised link/account paths. |
| Community | Duplicate, stale, retaliatory, brigaded, false-accusation and withdrawn observations are ineligible. At low density, no local conclusion is emitted. Private report details never surface as public pins. |
| Accessibility/tone | Screen reader and keyboard access to option comparison, urgent actions and map alternative. Short, practical, non-patronising copy that explains evidence and uncertainty without “safe/unsafe” assurances or fear prompts. |
| Compatibility | Old URLs, share links and notification targets; current account, reporting, contribution and trip flows remain usable during migration. |

## Measured product test before a broad release

Recruit women across the seven scenarios, including people with low local familiarity and different mobility modes. Give identical tasks to Mira and to **current Google Maps + a general AI assistant**. Record whether participants reach a defensible choice, time to first useful option, factual corrections, false assurance, abandoned plans, perceived control and unwanted anxiety. Pre-register success thresholds and a harm-stop threshold before testing; do not invent a favourable percentage after results. If Mira cannot show a meaningful improvement in actionable, grounded decisions for the selected initial segment, revise scope before claiming differentiation. Research assumptions and evidence are in [the prior dossier](../mira-product-research/MIRA_PRODUCT_RESEARCH_SYNTHESIS.md).

Phase-specific automated checks are listed in [21](21_AUTONOMOUS_BUILD_PLAN.md). Log each gate as `PASS`, `FAIL` or `KNOWN-RISK` with a link to the evidence. `KNOWN-RISK` never waives a privacy, emergency, data integrity or false-assurance failure.

## Phase 0 — PASS (2026-10-02)

**Reference:** dirty working tree at `497db67fcd5b` on `codex/community-first-mobile`, with pre-existing Mira API/provider/test edits preserved; [implementation and seven-scenario baseline](24_PHASE_0_BASELINE.md). Phase 0 adds only `src/domain/plan-contract.ts`, four focused test files and documentation. No runtime consumer imports the contract, so the current app behaviour is unchanged.

| Phase 0 gate | Evidence | Result |
|---|---|---|
| Versioned pure intent/evidence/action contract | `tests/unit/phase-zero-contracts.test.ts`: future remote named origin round trip, explicit `from_here` GPS, time zone/calendar validation, known versus unknown claim, confirmation receipt | PASS |
| Urgent fast path | `tests/unit/phase-zero-urgent.test.ts`: SOS card is the first event before context/place lookup; existing Mira unit and e2e tests cover reviewed/unknown numbers and direct Emergency | PASS for current path |
| Geo no-route versus failure, browser coordinate boundary | `tests/integration/phase-zero-geo.test.ts`: unsupported transit is HTTP 200 `route:null`; thrown provider error is HTTP 500; coordinates stay out of browser URL and error log | PASS for current API |
| Trip close, privacy and retention | `tests/integration/phase-zero-journey.test.ts`: explicit end removes points, closed link exposes only state/first name for 30 minutes, worker deletes journey at six hours; existing security/e2e tests cover token and account boundaries | PASS for current path |
| Repository and browser baseline | `npm run check`: lint, typecheck, 811 unit/integration tests across 68 files passed. `npx next build --webpack`, `npm run worker:build`, then `npx playwright test`: 49 passed, 5 intentional mobile/desktop project skips. | PASS |

The literal `npm run test:e2e` command could not finish its default Turbopack build because a helper process could not bind a local port in this environment. The installed Next.js CLI's documented `--webpack` build option produced a successful production build, followed by the unmodified Playwright suite. Browser coverage is Chromium mobile emulation and desktop, not real iOS/Android device evidence.

**Remaining risks / owners:** Phase 1 owner must connect the pure plan contract to ephemeral entry paths without a location grant or silent state loss. Phase 4 owner must change/audit the current `startTripSchema.share` default of `true` for direct API clients before V1 affirmative-sharing acceptance. Phase 7 release owner must run real devices, live providers, privacy review and the comparative user study. These are documented V1 gaps, not passed V1 gates. No data migration occurred. Rollback is file-level removal of the unused contract/tests/docs; no runtime switch or data rollback was required or exercised.

**Exact next phase:** [Phase 1 — Intent and plan, as a vertical entry path](21_AUTONOMOUS_BUILD_PLAN.md). No Phase 1 implementation or deployment was done in this Phase 0 session.

## Phase 1 — PASS (2026-10-02)

**Reference:** uncommitted working tree based on `497db67fcd5b` on `codex/community-first-mobile`. The Phase 0 files and all user-preexisting Mira API/provider/test edits were preserved. No migration or deployment occurred.

| Phase 1 gate | Actual behaviour and evidence | Result |
|---|---|---|
| Typed, ephemeral intent | `src/domain/plan-state.ts` validates a partial draft and converts a complete one to the Phase 0 v1 intent. `src/lib/plan-store.ts` keeps it in tab-scoped `sessionStorage` for at most two hours after the last edit, with a memory fallback and Clear plan. `tests/unit/phase-one-plan.test.ts` checks future local time/IANA zone, mode, constraints, unresolved named origin, partial edit and expiry. | PASS |
| Guest named-origin path and geocode states | `/plan` needs no account or location permission. Origin and destination search send no device coordinates; the user selects among candidates, including a single hit. Failed and zero-result searches preserve typed text and give a retry path. `tests/integration/phase-one-search.test.ts` checks the guest API boundary; `tests/e2e/l-phase-one-plan.spec.ts` checks ambiguity, failure and empty results. | PASS |
| Across existing entry surfaces | Today links to the plan; Around and map route from the selected named origin and show current-data caveats; Mira shows the plan and edit path without passing it as chat evidence. Browser tests cover Around → map → back → Mira, direct map load and reload, with zero geolocation calls for an active named plan. No current GPS fallback replaces an unresolved origin. | PASS |
| Legacy path and clear | An untouched draft leaves the legacy map entry usable. Clear plan removes the chosen place and returns to that adapter. Future/remote plans cannot start a live trip from the map. `tests/e2e/l-phase-one-plan.spec.ts` exercises the fallback. | PASS |
| Repository and browser regression | `npm run check`: 70 test files and 817 unit/integration tests passed, plus lint/typecheck. `npx next build --webpack` and `npm run worker:build` passed. Final `npx playwright test`: 55 passed, 5 intentional project skips across Chromium mobile emulation and desktop. The first browser run exposed legacy Mira location and no-plan ride-copy regressions; both were repaired and the full suite then passed. | PASS |

The installed Next.js default Turbopack build still cannot bind its helper port in this environment, as recorded in Phase 0. The supported Webpack production build completed, followed by the unmodified full Playwright suite. A server-side “destination stream closed early” diagnostic appeared during passing browser cases; it produced no test failure or plan-state loss and should be watched during later runtime work.

**Remaining risks / owners:** Phase 2 must establish planned-time provider eligibility and comparable options; current route minutes are labelled as present estimates, and loop routing is unavailable. Phase 3 must connect Ask to the shared plan without copying transient plans into the current 30-day raw chat history. The privacy/provider owner must audit geocoder query transfer and the explicit `from_here` point's two-hour tab storage before broad rollout. Phase 7 still owns real iOS/Android, accessibility and comparative research gates. Existing direct API sharing-default and habit-consent gaps remain with Phases 4 and 7. None is represented as a passed V1 release gate.

**Rollback tested:** Clear plan and an untouched `/plan` draft both restore existing no-plan map behavior in browser tests; the Phase 1 store adds no server data to migrate. The adapter fallback was exercised, while deployment rollback was not applicable.

**Docs updated:** [14 screen states](14_SCREEN_STATE_INVENTORY.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [17 technical change map](17_TECHNICAL_CHANGE_MAP.md), [22 decision D19](22_DECISION_LOG.md), this acceptance record and [index](00_README.md).

**Exact next phase:** [Phase 2 — Grounded option comparison for local movement](21_AUTONOMOUS_BUILD_PLAN.md). Phase 2 and deployment were not started in this session.

## Phase 2 — PASS (2026-10-02)

**Reference:** uncommitted working tree based on `497db67fcd5b` on `codex/community-first-mobile`. All previously dirty Mira API/provider/tests and Phase 0–1 work are preserved. No migration or deployment occurred.

| Phase 2 gate | Actual behaviour and evidence | Result |
|---|---|---|
| Real comparable paths | `/api/plan/options` uses the imported OSM walking graph; route geometry comes only from graph edges, with the existing distinct alternate rule. Around and map show the same plan and source labels, and the chosen alternative stays selected across those views in the tab. Legacy map now suppresses approximate walking geometry. | PASS |
| Deterministic eligibility and unknowns | `src/domain/plan-options.ts` checks the OSM snapshot `source_date` against a 365-day window, reports missing, empty, stale and failed separately, and provides scope/time/source for mapped walking minutes. The NOAA-equation daylight calculation refuses DST gaps/folds, twilight and unsupported latitude. Future ride/transit service, lighting and hours are unverified, not inferred. `tests/unit/phase-two-options.test.ts` covers source, geometry, expired/future snapshot and time ambiguity. | PASS |
| Provider rights and privacy | Planned-place search is restricted to local OSM/Photon; new planned routes use OSM graph only. The plan request contains origin, destination and time but no activity/constraints; it is POST/no-store and writes no route trace. Google Places result content selected through another path is removed from tab persistence. `tests/integration/phase-two-search.test.ts` proves the OSM branch does not call the configured Google provider. | PASS for new path |
| S1–S3 and accessibility | `tests/e2e/m-phase-two-options.spec.ts` covers early mapped alternatives, early loop darkness with unavailable routing, midnight transit unknown, missing graph and the button/pressed-state text equivalent on mobile emulation and desktop. Existing Phase 1 search/back/reload flows still pass. | PASS for browser automation |
| Regression/build | Final `npm run check`: 72 files, 822 unit/integration tests passed plus lint/typecheck. `npx next build --webpack` and `npm run worker:build` passed. Full browser suite on the first Phase 2 build: 61 passed, 5 intentional skips. The final provider-search, loop and selection changes were rebuilt, then the affected Phase 1–2 browser files passed 14/14. | PASS |

**Known limits / owners:** Phase 3 owns Ask parity and a reviewed transient guest-chat retention/rate-limit design. Phase 4 owns real journey action and device-hidden checks. Local OSM graph comparison is limited to imported coverage and uses an initial 365-day freshness threshold; the Phase 5 provider/coverage owner must calibrate it and add audited future services. The current live-route/map path predates this comparison and can combine Google provider content with fallback non-Google tiles; its provider-rights remediation remains with the geo owner before expansion. Phase 7 still owns real iOS/Android, accessibility audit, provider outage exercise and moderated user study. These are not represented as release gates passed by browser automation.

**Rollback tested:** The existing Clear plan and untouched-draft browser flows restore the no-plan place brief and map entry. The new endpoint stores no plan/route data, so code-level removal needs no migration. A deployment-level feature-off exercise was not performed because no deployment occurred.

**Docs updated:** [08 intelligence](08_INTELLIGENCE_MODEL.md), [12 coverage](12_GLOBAL_COVERAGE_MODEL.md), [14 states](14_SCREEN_STATE_INVENTORY.md), [16 privacy/provider audit](16_DATA_AND_PRIVACY_CONTRACT.md), [17 technical map](17_TECHNICAL_CHANGE_MAP.md), [22 decision D20](22_DECISION_LOG.md), and this acceptance record.

**Exact next phase:** [Phase 3 — Ask Mira on the shared plan](21_AUTONOMOUS_BUILD_PLAN.md). Its guest-rate-limit and chat-minimisation privacy gate must be satisfied before broad guest planning is enabled.

## Phase 3 — PASS for local build (2026-10-02)

**Reference:** same uncommitted working tree and base commit as Phases 0–2; user-preexisting Mira edits were retained. The [Phase 3 privacy design review](25_PHASE_3_PRIVACY_REVIEW.md) approves local build validation of the new ephemeral path. It does not approve deployment or broad guest rollout.

| Phase 3 gate | Actual behaviour and evidence | Result |
|---|---|---|
| Shared intent and partial answer | Guest Ask now accepts movement wording without sign-in or GPS. Conservative extraction seeds activity, loop, mode and unresolved explicit `from X to Y` names; planned time/zone stay blank until selected. A no-plan reply gives one useful fact and asks one place question. `tests/unit/phase-three-plan-ask.test.ts` covers S1–S5 classes, remote time, adversarial wording and failed evidence; `tests/e2e/n-phase-three-plan-chat.spec.ts` covers S1 early run and S5 late arrival. | PASS for deterministic local path |
| Grounded parity and next action | An active plan uses the Phase 2 resolver in both Ask and Around. Ask streams checked text, a `plan_brief` evidence card and `done`, with source/snapshot/scope and explicit unknown service/hours. The card offers plan edit/review as a next action and says no journey/share occurred. Phase 4 owns consequential action receipts. | PASS |
| Privacy and abuse | `/api/mira/plan` accepts guests, stores no question/plan/reply row, sends no plan text to a model, uses no location fallback and caps ordinary IP traffic at 20/minute and 100/day. An urgent message streams Emergency before graph or database work. Integration tests verify no `mira_messages` row, no question in error logs, malformed evidence fallback, provider timeout fallback and NDJSON order. | PASS for local review |
| Legacy and browser regression | Existing signed-in chat outside an active plan remains on `/api/mira`. Its trip, emergency and history cases passed alongside the new guest/plan Ask cases: 28/28 affected browser tests on mobile emulation and desktop. The privacy red-line import test passed after the shared danger classifier moved to `src/domain/urgent-intent.ts`. | PASS |
| Repository/build | `npm run check` passed 74 files and 829 tests with lint/typecheck before the final extra S2–S4 unit fixture; that fixture passed separately (5/5). `npx next build --webpack` passed on the final runtime tree. The first full run exposed a minute-boundary race in an existing rate-limit fixture; it was made deterministic and its targeted suite passed. | PASS |

**Known limits / owners:** The plan Ask path is deterministic and deliberately does not interpret arbitrary place/time phrases into verified places; it asks the person to select ambiguous names and specify time zone. It cannot start, change or share a journey; Phase 4 must add confirmation and receipts. Legacy saved chat still has its separate 30-day raw-text retention for non-plan turns. Independent privacy/security review, proxy-log inspection, shared-IP abuse exercise and public notice remain Phase 7 release gates. No live Claude/Google provider or real-device evidence is claimed by this local result.

**Rollback tested:** Signed-in non-plan chat remains on the existing API, verified by browser regression. Clearing the tab plan restores that path; the ephemeral endpoint creates no user data or migration to roll back. No deployment rollback was exercised.

**Docs updated:** [07 Ask contract](07_ASK_MIRA_CONTRACT.md), [14 screen states](14_SCREEN_STATE_INVENTORY.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [17 technical map](17_TECHNICAL_CHANGE_MAP.md), [22 decision D21](22_DECISION_LOG.md), [25 privacy review](25_PHASE_3_PRIVACY_REVIEW.md) and this acceptance record.

**Exact next phase:** [Phase 4 — Chosen plan, foreground journey and discomfort](21_AUTONOMOUS_BUILD_PLAN.md). Real iOS and Android screen-hidden/battery evidence remains mandatory for its full gate.

## Phase 4 — KNOWN-RISK (2026-10-02; local implementation only)

**Reference:** same dirty working tree at `497db67fcd5b`; user-preexisting changes were preserved, no commit or deployment. This is a local engineering result, not a Phase 4 acceptance PASS. Real iOS/Android screen-hidden, locked, wake-lock and battery observations cannot be produced on this Mac/Chromium harness, and the plan requires them before a dependent phase.

| Phase 4 gate | Evidence | Result |
|---|---|---|
| Chosen walk and consent | `src/domain/plan-journey.ts` requires a mapped route, resolved endpoints, near-now time, fresh accurate fix and nearby actual origin. The map presents a separate “Confirm start” and recipient text. `startTripSchema.share` and Home/Ask default private. `tests/unit/phase-four-journey.test.ts`, `tests/integration/whatsapp-circle.test.ts`, `tests/e2e/o-phase-four-journey.spec.ts`. | PASS locally |
| Foreground truth and S7 | Trip screen displays last device fix and successful upload ages plus reported accuracy, pauses GPS watch when hidden, refreshes on resume, and keeps worker health and Emergency direct. Approximate route geometry is not drawn. Help Points are candidates with closed-hour filtering, unverified staffing and route reachability; stale position suppresses ranking. Existing Help Point unit tests and Phase 4 browser active/resume/support test pass. | PASS in Chromium simulation; real device open |
| Confirmed adaptation | `/api/trips/[id]/change` validates owner, active state and original four-hour lifetime; chosen destination/manual ETA or a checked OSM route/ETA requires an explicit tap. The same token and Circle recipients remain. Browser change test and Circle integration test pass. | PASS locally |
| Worker/share/retention | Final `npm run check` passed 75 files / 833 tests; existing journey, worker, close/revoke, 20-point and purge regressions are included. Targeted Circle test passed 4/4. Final production web build and worker build passed. The affected browser suite passed 36/36 on Chromium mobile emulation and desktop; the final plan-mode/selection build passed another 12/12 focused browser tests. | PASS locally |
| Physical device behavior | Real iOS and Android foreground, hidden/locked, wake-lock, battery and resume observations required by [21](21_AUTONOMOUS_BUILD_PLAN.md) and this document. | KNOWN-RISK; no device evidence |

**Actual limits / owners:** Phase 4 owner must run and record both phone tasks and investigate any stale-position or battery issue. This host has neither `adb` nor the Apple `xctrace` utility, and Chromium emulation cannot supply physical device evidence. The geo/provider owner must resolve the pre-existing Google route on fallback non-Google map rights gap before live-provider expansion. Support-source owner must audit local hours/entrance/reachability; the current UI deliberately says route and staffing unverified. Independent privacy/security review remains a release gate. No real contact provider or live route provider was exercised by the local browser fixtures.

**Rollback:** Clearing the ephemeral plan restores legacy route entry, covered by the Phase 1 browser test. The existing trip API and screen remain; the new `change` action is additive. No production rollback was exercised. If real-device results fail, disable the plan-linked start/review/change path and retain close, share-link, contact and Emergency actions under the operator playbook in [incident response](../INCIDENT_RESPONSE.md).

**Docs updated:** [11 journey](11_NAVIGATION_AND_JOURNEY_MODEL.md), [14 screen states](14_SCREEN_STATE_INVENTORY.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [17 technical map](17_TECHNICAL_CHANGE_MAP.md), [22 decision D22](22_DECISION_LOG.md), [operator playbook](../INCIDENT_RESPONSE.md), [00 index](00_README.md) and this record.

**User-directed continuation:** On 2026-10-02 the user explicitly instructed “Skip physical phone … Proceed with the next task.” Phase 4 remains `KNOWN-RISK`; no physical gate is recorded as passed. The dependency exception is limited to continuing local build work, not release or a safety claim. [D23](22_DECISION_LOG.md) records this change.

**Independent Phase 6 prerequisite audit:** [Current moderation policy](../../MODERATION_POLICY.md) explicitly says nobody is on moderation duty and public community notes remain off. [Open questions](23_OPEN_QUESTIONS.md) leave route/time claim thresholds and eligible local-development sources unreviewed. The Phase 6 optional enrichment remains disabled; no report, headline or unverified place claim was promoted into the plan resolver. Its missing operations/source gates prevent a Phase 6 PASS independently of the Phase 4 device gate.

## Phase 5 — PASS for local acceptance (2026-10-02)

**Reference:** dirty working tree at `497db67fcd5b`; existing user edits preserved. No commit, deployment, production data migration or global-provider enablement. Phase 4's physical-device risk remains recorded above under the user's explicit test-scope change.

| Phase 5 gate | Evidence | Result |
|---|---|---|
| Remote multi-leg S5–S6 | `/plan` holds main movement plus two independent legs, selected named places, country and local time zone; session reload retains entries without GPS. `tests/e2e/p-phase-five-travel.spec.ts` passes mobile emulation and desktop, 4/4. | PASS locally |
| Time conversion and privacy | `instantForLocal` exposes one UTC instant or refuses DST gap/overlap/invalid zone; new legs start with blank zone/time. Provider place content is scrubbed from every saved leg. `tests/unit/phase-five-travel.test.ts` passes 3/3; prior Phase 1 persistence tests remain green. | PASS locally |
| Country essentials and unknowns | Explicit selected ISO only; existing registry yields full, partial and unverified profiles with source/review/limitations. Unknown profile has no fallback number. `/api/plan/country` integration tests pass 2/2; browser S5/S6 shows destination caveat. | PASS locally |
| Route/service and Ask parity | Local walking check is per resolved leg and limited to the imported 25 km graph. Longer or failed searches show operator/property/manual-transfer path. Ask carries separate leg context, keeps urgent bypass, and does not claim late transport. Multi-leg chat integration and existing plan chat tests pass 4/4. | PASS locally |
| Regression/build | `npm run check` passed lint, typecheck and 77 files / 839 tests; `npx next build --webpack` and `npm run worker:build` passed; S5/S6 browser suite passed 4/4. | PASS locally |

**Limits / owners:** Geo/provider owner must validate real remote airport/station/hotel search coverage, provider quotas and display rights before claiming global reliability. Reviewed emergency profiles are country-level; region-dependent and stale source facts retain their caveats. Travel legs cannot book, confirm operation or start a trip; the main leg alone can enter Around's separate start flow. Phase 4 physical-device behavior and independent privacy/security review remain release risks. No live global provider, real phone or real travel participant was tested.

**Rollback:** Remove or disable the additive Travel legs section and selected-country route; the original single-leg `/plan`, Around, Ask and journey API still work. No production rollback was exercised.

**Docs updated:** [12 coverage](12_GLOBAL_COVERAGE_MODEL.md), [14 screens](14_SCREEN_STATE_INVENTORY.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [22 decisions](22_DECISION_LOG.md), [00 index](00_README.md) and this record. Generated country coverage was not edited because the registry did not change.

**Exact next phase:** [Phase 6 prerequisite and disabled-baseline audit](21_AUTONOMOUS_BUILD_PLAN.md), then Phase 7 local entry and validation work if the optional enrichment stays off. Do not deploy.

## Phase 6 — KNOWN-RISK; optional enrichment disabled (2026-10-02)

**Reference:** same dirty local tree. The Phase 6 dependency was audited; no plan-linked community or local-development claim was enabled. `MODERATION_POLICY.md` says no reviewer is on duty and public notes are off by default. [Open questions](23_OPEN_QUESTIONS.md) still require source rights, route/time eligibility and false-positive thresholds.

| Phase 6 gate | Evidence | Result |
|---|---|---|
| Fail-closed baseline | `src/server/plan/options.ts` only loads the OSM graph and calculated daylight; no private report, aggregate or headline becomes a plan claim. The new Go entry does not show the city-news section; `/today` keeps the old sourced compatibility view. | PASS for disabled baseline |
| Existing private/community lifecycle | Full `npm run check` includes aggregation, contribution, privacy and safety-update fixtures for duplicate, burst, stale, expiry, withdrawal and no-data behavior. Default public releases remain off unless an operator sets `PUBLIC_AGGREGATE_RELEASES=on`. | PASS for existing subsystem, not new eligibility |
| New route-linked claim and operations | No staffed moderator, approved route/time intersection, source-rights register or impact threshold. No eligible new claim can be demonstrated without inventing authority. | KNOWN-RISK; feature remains disabled |

**Owners / stop:** Moderation and source-operations owners must establish a rota, source rights, eligibility/expiry and correction process before enabling any Phase 6 plan claim. If those gates remain unavailable, Phase 7 may proceed with this deliberately disabled baseline as [21](21_AUTONOMOUS_BUILD_PLAN.md) allows. No moderation policy, release flag or worker behavior was changed in this audit. No production rollback was needed.

**Docs updated:** [09 community](09_COMMUNITY_DATA_LOOP.md), [10 developments](10_LOCAL_INTELLIGENCE_PIPELINE.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [00 index](00_README.md) and this record. **Exact next phase:** Phase 7 local entry/validation; public release remains separately gated.

## Phase 7 — KNOWN-RISK; local implementation complete, release validation open (2026-10-02)

**Reference:** uncommitted working tree based on `497db67fcd5b` on `codex/community-first-mobile`. Existing dirty Mira work was preserved. Migrations `0020–0021` were applied only to the local development and test databases. There was no commit, staging/production migration or deployment. The user explicitly skipped physical phones for this build session; that does not pass a release gate.

| Phase 7 gate | Actual behaviour and evidence | Result |
|---|---|---|
| Go/Journeys/You and compatibility | `/` leads with plan/Ask, active journey, a recent explicitly saved plan when idle, and direct Emergency. `/today` preserves legacy content, and Around/map/Mira/Contribute/deep links remain reachable. `tests/e2e/q-phase-seven-go.spec.ts` verifies guest navigation, keyboard Emergency, saved-plan resume, no passive GPS and viewport overflow on mobile emulation and desktop. | PASS locally |
| Saved plan and consent | Explicit `Save plan` requires account and named origin; payload is encrypted with a distinct purpose, owner-scoped, capped at ten and expires after 30 days. Journeys opens an editable copy and deletes. Migration `0020` pauses old habit learning/suggestions and makes new users opt in; earlier summaries stay reviewable/deletable. `tests/integration/phase-seven-saved-plans.test.ts` and `companion.test.ts` verify encryption, foreign-account denial, deletion, expiry and no use before choice. Focused browser saved-plan flow passed 4/4 together with Go. | PASS locally; independent privacy review open |
| Full regression and builds | `npm run check`: lint, typecheck, 78 files and 841 unit/integration tests passed. `npx next build --webpack` and `npm run worker:build` passed. Full production-build Playwright suite: 81 passed, 7 intentional skips on Chromium mobile emulation and desktop. The new saved-plan browser case, added after that run began, passed in the focused 4/4 run. | PASS locally |
| Entry rollback | `NEXT_PUBLIC_MIRA_GO_ENTRY=legacy` production build and `q-phase-seven-rollback.spec.ts` passed 2/2: old Today root and five tabs returned. Default Go build was restored and passed. Forward-only schema is not rolled back by this UI switch. | PASS locally |
| Seven-scenario research and independent gates | Automated S1–S7 browser/unit/integration fixtures exist. The paired Maps + general AI task study has not run; no recruitment, scoring or observed improvement exists. Independent accessibility, privacy/security and live provider/worker outage reviews are unperformed. Phase 4 real-device behavior remains unverified under user direction. Staffed moderation is absent, so optional Phase 6 plan-linked claims remain off. | KNOWN-RISK; no release claim |

**Decision:** Local code can be reviewed as a Phase 7 candidate, but Phase 7 acceptance and the public beta gate are **not passed**. Do not enable unmoderated community claims, inferred habit prompts, analytics events or a public rollout. The current `docs/PUBLIC_BETA_RELEASE.md` verdict remains **NOT READY FOR DEPLOYMENT AND LAUNCH**.

**Remaining owners/risks:** Research owner must approve and run the paired S1–S7 study against Maps plus a general assistant with pre-registered thresholds and harm stops in [27](27_PHASE_7_VALIDATION_PROTOCOL.md). Independent accessibility and privacy/security reviewers must audit the app, including saved-plan encryption, legacy habit notice, links, logs, third-party transfers and keyboard/screen-reader use. The coarse outcome [event proposal](28_PHASE_7_EVENT_SCHEMA.md) needs privacy/research approval before collection. Operations owner must rehearse `0020–0021` on staging with pre/post counts, worker/provider outage, backup restore and rollback, and staff the moderation/support rota before any release. Geo owner must verify live global provider coverage, rights and quota behaviour. Real phone observations remain an explicitly skipped, unverified risk; no pass is claimed.

**Rollback and documentation:** The old entry hierarchy was exercised behind the build-time flag; compatibility routes and the unmodified worker trip lifecycle remain. Data migrations are forward-only, so a code rollback must keep schema compatibility and never restore the old habit default. Updated [00](00_README.md), [02–05](02_CURRENT_PRODUCT_MAP.md), [13–17](13_INFORMATION_ARCHITECTURE.md), [19](19_MIGRATION_PLAN.md), [22](22_DECISION_LOG.md), [27](27_PHASE_7_VALIDATION_PROTOCOL.md), [public beta gate](../PUBLIC_BETA_RELEASE.md), [incident response](../INCIDENT_RESPONSE.md) and in-app privacy copy.

**Exact next phase:** Complete the remaining **Phase 7 external validation and release-candidate gate** in [27](27_PHASE_7_VALIDATION_PROTOCOL.md), then reconsider the separate public-beta checklist. There is no Phase 8 in [21](21_AUTONOMOUS_BUILD_PLAN.md), and this session did not deploy.

## Phase 0–7 closeout audit — KNOWN-RISK (2026-10-02)

**Reference:** the same uncommitted `codex/community-first-mobile` working tree based on `497db67fcd5b`; pre-existing edits were preserved. The user's clarification was to audit and finish documented phases; [21](21_AUTONOMOUS_BUILD_PLAN.md) ends at Phase 7. No Phase 8, staging action or deployment was attempted.

| Scenario / gate | Closeout finding and direct evidence | Result |
|---|---|---|
| S1 early run | `/plan` and Ask still accept a guest's named 4:45 loop without a location grant. Around distinguishes calculated darkness from unverified lighting/activity and says loop routing is unavailable. The map now offers a user-timed, check-in-only loop with no drawn route or automatic return claim. Separate confirmation, near-now departure, current geolocation success, accuracy and origin proximity precede the existing trip POST; denial leaves no trip. `phase-four-journey` browser test covers denial then later grant, no default sharing and `autoArrival=false` on both profiles; unit test covers stale/off-origin/future/ride rejection. | PASS for local fallback; guest live-start and real-device observation still open |
| S2–S3 local movement | Existing Phase 1–2 search, no-location, ambiguity, mapped alternative and unknown future-service tests passed in the full browser suite. A mapped chosen walk still requires a separate start confirmation; its start now also rejects a denied geolocation response even if an older point remains in memory. Live service and access facts remain provider-limited. | PASS for local fixtures; live provider review open |
| S4 date/event | A complete named return leg can be explicitly promoted to Around for comparison while the former main arrival leg remains in the tab plan with its own places/time/mode/country. Selection does not save, start or notify anyone. Strict schema round-trip unit test and mobile/desktop browser flow pass. The existing journey contact/check-in controls require a separate start choice; the new S4 browser case does not prove a participant's full event-to-return task. | PASS for leg selection; full S4 observation open |
| S5–S6 remote travel | Existing country, DST, independent-leg, failed search and manual operator/property handoff fixtures passed again; no live airport/transport or regional emergency validation was added. | PASS for local fixtures; global coverage review open |
| S7 discomfort and cross-cutting | Existing active/resume, immediate Help Point/contact/Emergency, explicit stale location, token/revocation, retention, contribution abuse and privacy fixtures passed. The final location-success guard closes a cached-point-after-denial start path; local browser tests pass. No real screen-hidden/battery result, independent accessibility/security review or staging worker/provider outage rehearsal exists. | PASS for local fixtures; external gates open |
| Repository/build | The full dirty-tree `npm run check` passed lint/typecheck and 843 unit/integration tests across 78 files; the isolated staged snapshot, which leaves earlier capability-answer edits unstaged, passed 838 tests across the same 78 files and a Webpack production build. `npm run worker:build`, `npm run audit:bundle` (119 client files, 14 secret patterns) and `git diff --check` passed. Full production browser suite on the working tree passed 87 with 7 intentional cross-profile skips; the final rebuilt start guard passed `o-phase-four-journey.spec.ts` 6/6, and the S4 case passed 2/2. The S4 flow's strict leg-shape bug and repeated test seeding error were corrected. | PASS locally; staged browser suite not separately rerun |

**Release decision:** The local implementation is auditable, but Phase 7 acceptance is still `KNOWN-RISK` and public beta remains **NOT READY**. The paired Maps + general assistant study, independent accessibility/privacy/security reviews, live provider rights/coverage, staging migration/backup/outage rehearsal and staffed operations have no passing evidence. Physical-phone checks were skipped by explicit user direction and are not counted as passed. Phase 6 plan-linked community enrichment remains disabled. A guest can plan without account/GPS; the current live journey still needs sign-in and a fresh location grant at start. Test this boundary with participants before claiming the full S1 outcome.

**Rollback and docs:** The existing `NEXT_PUBLIC_MIRA_GO_ENTRY=legacy` rollback evidence still applies; this audit did not repeat a legacy-flag build because no entry hierarchy changed. The new loop uses the pre-existing check-in-only trip path, and return-leg promotion is confined to the ephemeral tab draft. No database schema or worker runtime changed. Updated [00](00_README.md), [11](11_NAVIGATION_AND_JOURNEY_MODEL.md), [14](14_SCREEN_STATE_INVENTORY.md), [16](16_DATA_AND_PRIVACY_CONTRACT.md), [22](22_DECISION_LOG.md), this record and the [public beta gate](../PUBLIC_BETA_RELEASE.md).

**Exact next phase:** finish the remaining **Phase 7 external validation and release-candidate gate** in [27](27_PHASE_7_VALIDATION_PROTOCOL.md), with the user's physical-phone skip recorded as an unresolved release risk; then assess the separate public-beta checklist. The canonical plan defines no Phase 8.
