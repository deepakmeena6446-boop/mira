# Acceptance tests and evidence gates

This is the product acceptance contract. A passing unit suite alone cannot prove a woman can act on an answer. Every V1 scenario needs scripted end-to-end checks; external-user observation is optional product research, not an engineering completion gate. Release requires current public-beta operational gates as well as these tests.

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

## Engineering completion evidence

Run S1–S7 as scripted end-to-end tasks and the cross-cutting tests above. Record results from supported devices and configured providers where a capability depends on them. Review sensitive-data flows, urgent actions, worker delivery and retention before declaring engineering completion. External-user recruitment or a paired Maps/AI study is **not a completion gate**. Such research can guide later product decisions without blocking this build.

**2026-10-02 local-build scope (historical):** New external API access, credentials, live provider integration and partner/source onboarding were deferred for that session. The deferral does not automatically apply to later sessions. A provider-dependent capability may have an interface or disabled placeholder, but no mock response may appear to users as a real place, service, route, opening hour, safety condition or verified claim. Record the exact deferred dependency and keep existing working providers intact. A placeholder is not a passing live-provider or public-release gate.

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

**Remaining risks / owners:** Phase 1 owner must connect the pure plan contract to ephemeral entry paths without a location grant or silent state loss. Phase 4 owner must change/audit the current `startTripSchema.share` default of `true` for direct API clients before V1 affirmative-sharing acceptance. Real-device, live-provider and privacy checks remain open engineering evidence. These are documented V1 gaps, not passed V1 gates. No data migration occurred. Rollback is file-level removal of the unused contract/tests/docs; no runtime switch or data rollback was required or exercised.

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

**Remaining risks / owners:** Phase 2 must establish planned-time provider eligibility and comparable options; current route minutes are labelled as present estimates, and loop routing is unavailable. Phase 3 must connect Ask to the shared plan without copying transient plans into the current 30-day raw chat history. The privacy/provider owner must audit geocoder query transfer and the explicit `from_here` point's two-hour tab storage before broad rollout. Real iOS/Android and accessibility checks remain open. Direct API sharing-default and habit-consent gaps were assigned to the subsequent local build. None is represented as a passed V1 release gate.

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

**Known limits / owners:** Phase 3 owns Ask parity and a reviewed transient guest-chat retention/rate-limit design. Phase 4 owns real journey action and device-hidden checks. Local OSM graph comparison is limited to imported coverage and uses an initial 365-day freshness threshold; the Phase 5 provider/coverage owner must calibrate it and add audited future services. The current live-route/map path predates this comparison and can combine Google provider content with fallback non-Google tiles; its provider-rights remediation remains with the geo owner before expansion. Real iOS/Android, accessibility and provider outage checks remain open. These are not represented as release gates passed by browser automation.

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

**Known limits / owners:** The plan Ask path is deterministic and deliberately does not interpret arbitrary place/time phrases into verified places; it asks the person to select ambiguous names and specify time zone. It cannot start, change or share a journey; Phase 4 must add confirmation and receipts. Legacy saved chat still has its separate 30-day raw-text retention for non-plan turns. Independent privacy/security review, proxy-log inspection, shared-IP abuse exercise and public notice remain open checks. No live Claude/Google provider or real-device evidence is claimed by this local result.

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

**Limits / owners:** Geo/provider owner must validate real remote airport/station/hotel search coverage, provider quotas and display rights before claiming global reliability. Reviewed emergency profiles are country-level; region-dependent and stale source facts retain their caveats. Travel legs cannot book, confirm operation or start a trip; the main leg alone can enter Around's separate start flow. Phase 4 physical-device behavior and independent privacy/security review remain release risks. No live global provider or real phone was tested.

**Rollback:** Remove or disable the additive Travel legs section and selected-country route; the original single-leg `/plan`, Around, Ask and journey API still work. No production rollback was exercised.

**Docs updated:** [12 coverage](12_GLOBAL_COVERAGE_MODEL.md), [14 screens](14_SCREEN_STATE_INVENTORY.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [22 decisions](22_DECISION_LOG.md), [00 index](00_README.md) and this record. Generated country coverage was not edited because the registry did not change.

**Next work at that point:** the Phase 6 source/moderation audit and local integration checks. Do not deploy.

## Phase 6 — KNOWN-RISK; optional enrichment disabled (2026-10-02)

**Reference:** same dirty local tree. The Phase 6 dependency was audited; no plan-linked community or local-development claim was enabled. `MODERATION_POLICY.md` says no reviewer is on duty and public notes are off by default. [Open questions](23_OPEN_QUESTIONS.md) still require source rights, route/time eligibility and false-positive thresholds.

| Phase 6 gate | Evidence | Result |
|---|---|---|
| Fail-closed baseline | `src/server/plan/options.ts` only loads the OSM graph and calculated daylight; no private report, aggregate or headline becomes a plan claim. The new Go entry does not show the city-news section; `/today` keeps the old sourced compatibility view. | PASS for disabled baseline |
| Existing private/community lifecycle | Full `npm run check` includes aggregation, contribution, privacy and safety-update fixtures for duplicate, burst, stale, expiry, withdrawal and no-data behavior. Default public releases remain off unless an operator sets `PUBLIC_AGGREGATE_RELEASES=on`. | PASS for existing subsystem, not new eligibility |
| New route-linked claim and operations | No staffed moderator, approved route/time intersection, source-rights register or impact threshold. No eligible new claim can be demonstrated without inventing authority. | KNOWN-RISK; feature remains disabled |

**Owners / stop:** Moderation and source-operations owners must establish a rota, source rights, eligibility/expiry and correction process before enabling any Phase 6 plan claim. If those gates remain unavailable, the core product may use this deliberately disabled baseline as [21](21_AUTONOMOUS_BUILD_PLAN.md) allows. No moderation policy, release flag or worker behavior was changed in this audit. No production rollback was needed.

**Docs updated:** [09 community](09_COMMUNITY_DATA_LOOP.md), [10 developments](10_LOCAL_INTELLIGENCE_PIPELINE.md), [16 privacy](16_DATA_AND_PRIVACY_CONTRACT.md), [00 index](00_README.md) and this record. **Next work at that point:** audit the integrated local build; public release remains separately gated.

## Integrated local build audit — PARTIAL (2026-10-02)

The Go/Journeys/You entry, explicit saved plans, habit-consent migration, manual loop check-in fallback and return-leg selection are implemented. They were previously grouped under an extra build phase; that phase and its external-user completion requirement have been removed by founder direction. The code is retained because these capabilities serve the frozen V1 contract.

| Frozen scenario | Current implementation result | Contract status |
|---|---|---|
| S1 4:45 run | A guest's named future loop, calculated daylight and manual check-in work; mapped loop and route/time comparison do not. There is no running mode: mapped time assumes walking at 4.5 km/h. A signed-in user asking without an active plan still enters the legacy chat rather than the plan resolver. Starting live requires account and fresh GPS. | **PARTIAL** |
| S2 midnight return | Named office/home plan, mapped walks, consented sharing and change exist; future ride/transit operation, pickup and last-mile facts remain unverified. | **PARTIAL** |
| S3 unfamiliar destination | Named origin and destination, no-location guest search and mapped walks work; arrival/return context is separate leg setup and broad place conditions are thin. | **PARTIAL** |
| S4 date/event | Separate arrival/return legs and a selected return-leg review exist; full event-to-return and chosen check-in flow is not demonstrated end to end. | **PARTIAL** |
| S5 late city arrival | Local time, named places, country context and honest manual handoff exist; live airport/late-transfer facts are not demonstrated. | **PARTIAL** |
| S6 basic trip | Three explicit legs and reviewed country coverage are present; global provider reliability and local leg evidence are unproven. | **PARTIAL** |
| S7 discomfort | Immediate Help Point/contact/Emergency sheet and stale-position wording exist; route reachability and staffing/access remain unverified, and physical-device behaviour is untested. | **PARTIAL** |

| Area | Current evidence | Status against frozen V1 |
|---|---|---|
| Entry and plan continuity | `/` uses Go; `/today` and `NEXT_PUBLIC_MIRA_GO_ENTRY=legacy` preserve the prior entry. A guest can create a named-origin tab plan and carry it through Around, map and plan Ask. Go still offers separate Plan and Ask buttons rather than a single intent input. `tests/e2e/q-phase-seven-go.spec.ts`, the legacy rollback test and earlier plan suites cover local browser behaviour. | **PARTIAL** against the one-flow thesis; direct Emergency and old links are covered by automated tests. |
| Local options and Ask | The imported OSM walking graph and calculated daylight produce source-bound walking options and explicit unknown service/lighting/hours states. `/api/mira/plan` is deterministic and ephemeral. Signed-in users without a tab plan still use legacy `/api/mira`; the new Ask path is reached only for guests or an existing plan. | **PARTIAL:** basic text parsing and a local walking graph do not yet give one reliable conversational planning path, broad contextual intelligence or global coverage. |
| Journey and discomfort | A selected walking option or unmapped-loop manual check-in requires separate confirmation, a fresh location and account sign-in. Trip view shows stale-location age; Help Points are labelled as candidate places with unverified route/staffing. | Partial: no real iOS/Android hidden/locked/battery evidence, routed Help Point ETA or verified access. |
| Travel | Up to three explicit legs, time zones and reviewed country profiles are present. Unsupported late transfer routes/services receive a manual/operator handoff. | Partial: no live airport/hotel/transport coverage or global provider reliability proof. |
| Community intelligence | Private reporting/checks and moderation safeguards survive; no community or news claim enters the new plan resolver. | Optional enrichment disabled for lack of eligible source and moderation operations. |
| Differentiation from Maps plus generic AI | The plan resolver currently combines an imported local walking graph, distance/time and approximate daylight; plan Ask explains those same facts. It has no eligible recent community, route-level service, place-access or movement-specific local development evidence. | **NOT MET** as a defensible data advantage yet; the baseline remains useful but easily replicated. No external-user study is required to establish this implementation fact. |
| Personal control | Signed-in users can explicitly save encrypted named-origin plans for 30 days and delete them. New habit learning defaults off; old settings pause for review. | Implemented locally; staging migration, independent privacy review and retention operations unverified. |
| Outcome instrumentation | The frozen V1 contract calls for privacy-preserving success/failure events. No new vNext decision-outcome collector is enabled. | **NOT IMPLEMENTED**; design a minimal allowlist and retention rule only when needed, without coordinates or text. |
| Current checkout regression | `npm run check` passed lint, typecheck and 843/843 unit/integration tests. `npx next build --webpack` and `npm run worker:build` passed. Full browser run: 86 passed, seven intentional skips, one selector-only failure after the manual loop successfully started. The selector was narrowed to the heading; focused mobile/desktop rerun passed 2/2. | Local behaviour verified within fixture coverage; full browser suite was not repeated after the one-line test correction. The literal `npm run build` Turbopack path failed in this host while spawning a CSS loader (`binding to a port: EPERM`); Webpack production build passed, so the default build remains an environment/packager gate. |

**Engineering verdict:** **PARTIAL, not done against the frozen V1 contract.** The missing items are concrete source/device/privacy/operations and scenario-coverage gaps above. External-user recruitment or a comparison with Maps plus general AI is **not** a build-completion condition. Keep the separate public-beta deployment checklist in force. No deployment or production migration is implied by this local audit.

## Integrated local continuation — 2026-10-03

This is the current implementation audit; the earlier snapshot above remains as history. The base commit is `f273522`. Existing uncommitted companion provider, tests and documentation work was preserved. Migration `0023` was applied only to a verified localhost test database. No production migration or deployment occurred. E2E fixtures prove product flow and fail-closed wording, never live route, service, place, staffing or safety facts.

### Frozen scenario matrix

| Scenario | Locally observed behaviour | Status and remaining evidence |
|---|---|---|
| **S1 4:45 early run** | First-turn Ask acknowledges “North Gate” and “4:45 AM” without asking for the named starting place again or guessing date/zone. A guest with GPS denied can set and end a private tab check-in timer; the early loop shows calculated darkness and a later daylight option, without pretending to map a loop. Signed-in manual check-in requires separate confirmation and a fresh position. Unit and browser cases cover these paths. | **PARTIAL.** No mapped running loop, calibrated pace or route/time comparison. The guest timer cannot monitor, detect return, notify, share or reliably continue after the screen closes. Founder choice remains precise: either define and implement the accountless, no-GPS foreground journey and route/time minimum under the frozen contract, or explicitly amend that minimum. Until then, do not call the timer a full journey. Physical-phone behaviour remains unverified by user direction. |
| **S2 midnight office return** | Named origin/home, mapped walking reference, private or chosen-recipient journey start, explicit change, position age and no false future-transit claim pass local tests. | **PARTIAL.** Midnight ride/transit operation, pickup and last-mile access need a time-eligible source and live validation; the test provider supplies no real operating evidence. |
| **S3 unfamiliar local destination** | Guest disambiguates named places without GPS, retains the plan across Go/Around/map/Ask/reload, retries a failed graph check, and receives calculated local daylight with labelled unknowns. | **PARTIAL.** Broad destination access/conditions and verified arrival/return route coverage remain unavailable. |
| **S4 date/event** | A production-build E2E test performs venue arrival, explicit private journey start, user “I’m here” check-in, reverse-leg review and a separately confirmed private return journey through arrival. The arrival leg remains intact and review alone does not start or share. | **PARTIAL overall; local flow PASS.** The E2E route/venue are deterministic fixtures. Real venue access and future return service evidence are still unknown. |
| **S5 late city arrival** | Destination IANA zone, named airport/hotel context, reviewed country profile and manual operator/property handoff pass; no checked late transfer is claimed. | **PARTIAL.** Live airport/hotel/late ride or transit facts and broader search reliability need rights, source and operations proof. |
| **S6 basic multi-city trip** | Three independent legs preserve places/zones and honest country-coverage gaps; failed search retains typed text. | **PARTIAL.** Global place, route, service and country coverage is unverified. |
| **S7 discomfort** | Unsafe/Emergency actions appear immediately without a model turn. A Help Point candidate requests fresh location, checks the imported walking graph when possible, and says reachability is unknown on failure; stale position suppresses ranking. Sharing/worker safeguards remain in regression tests. | **PARTIAL.** Candidate opening, access, staffing and real-world approach are unverified. Locked/hidden device and battery evidence was skipped by user direction. |

### Scripted useful-decision rubric

`tests/support/scripted-decision-rubric.ts` is an **audit-only** S1–S7 checklist, not user analytics. It records booleans and a scenario ID, with no person, place, route, message, contact or location data. A scenario passes only when a concrete option or action was chosen, required facts were checked from an eligible source (including a live source where required), unknowns were visible, the next state was confirmed, and that scenario's frozen minimum was met. A prohibited assurance, hidden unknown or consent breach fails. Otherwise the result is partial. Unit tests prove that answer generation, viewing, a private timer and manual journey end cannot individually count as success. The coarse database counters do not purport to measure this rubric or a user's successful decision.

### Cross-cutting implementation and checks

- **Ask and privacy:** Signed-in movement questions and guest planning use the ephemeral shared plan endpoint. First-turn explicit place/time details are acknowledged. Urgent danger keeps the direct Emergency fast path. Informational emergency-number questions use only the reviewed country registry, state missing context and do not create a plan outcome. Signed-in nearby/report/product questions use the existing tool chat even with an active plan; that chat retains its disclosed 30-day history. The UI offers explicit current-location permission for nearby questions with an active plan; movement questions never receive that location by implication. Guest informational questions get a limited ephemeral answer. The classifier is bounded regex logic, not a claim of universal intent understanding.
- **Outcome meaning:** Forward migration `0023` renames historical ambiguous `journey_completed` counts to `journey_closed_legacy` and records new arrival as `journey_arrived` and manual end as `journey_ended`. No old count is backfilled into arrival. Existing `0022` keeps only UTC day, allowlisted event and count; worker purge remains 30 days. Integration tests cover allowlist, aggregation, distinct closure, no sensitive columns and purge. Neither close event is a success claim.
- **Provider/display boundary:** Existing Google Places, Routes and Map Tiles keys returned bounded successful status in a non-user probe (one Places result, one Routes result, and a tile session). That proves access to those APIs at probe time only. OSM tile fallback now requests the OSM route/place source and suppresses Google-only map pins; a server integration test asserts an OSM route request does not call Google transit. Planned-route content remains OSM-only. Google [Routes](https://developers.google.com/maps/documentation/routes/policies) and [Places](https://developers.google.com/maps/documentation/places/web-service/policies) display/storage policies, [OSMF public tile policy](https://operations.osmfoundation.org/policies/tiles/) and the [Photon public demo limits](https://github.com/komoot/photon) still require account-specific rights, attribution, quota and operations review. No probe result or fixture is shown as a real operating service.
- **Build and bundle gate:** The previous default Turbopack build failed in this host's CSS helper while spawning/binding a port (`EPERM`), including with host escalation; a separate localhost Node bind succeeded. The installed Next.js CLI documents `next build --webpack`; default `npm run build` now uses that path and builds the worker. `audit:bundle` counts client JS/CSS assets and exits nonzero on zero files, covered by a unit test.
- **Local verification:** After the final Ask disclosure/location refinement, `npm run check` passed lint, typecheck and **858 unit/integration tests across 84 files**. `npm run build` passed the Webpack production and worker builds; `npm run audit:bundle` scanned **117 JS/CSS client files** against 14 secret patterns with no findings. The full production-build Playwright suite passed **99 active cases** on mobile emulation and desktop, with **7 intentional skips** (106 listed), including S4 arrival → check-in → return. After the final Ask edit and rebuild, the focused Ask browser suite passed **12/12** mobile/desktop cases, including explicit nearby-location use with an active plan. Browser and fixture checks do not establish live-provider, physical-device or release readiness.

**Engineering verdict: PARTIAL.** Local flows and privacy regression coverage improved, but the frozen V1 scenarios still need the evidence stated above. No extra phase or external-user recruitment gate is required. Public beta is **NOT READY**: independent privacy/security review, staging rehearsal of `0020–0023`, retention and backup restoration, source operations and skipped physical-device behaviour remain release work.

### Next session: exact external dependencies

1. **Existing Google access:** Review the actual project/billing-region contract, allowed Places/Routes/Map Tiles display and caching/storage patterns, attribution and fallback-map mixing, quota/alert settings and outage behaviour. The API probe succeeded, but account-specific rights and sustained availability were not verified. Validate eligible live S2/S5/S6 examples only after this review; do not put Google route content on an OSM map.
2. **Planned-time transport and place operations:** Obtain a permitted, time-eligible provider or operator feed for late ride/transit operation, pickup, airport/station transfer, hotel access and last-mile facts in named rollout geographies. Supply credentials, licence/display terms, coverage, refresh/expiry owner, quota and sample live cases. [Google transit responses](https://developers.google.com/maps/documentation/routes/transit-route) alone are scheduled routes, not guaranteed operation or pickup; planned driving traffic has separate [departure-time tradeoffs](https://developers.google.com/maps/documentation/routes/config_trade_offs).
3. **Public OSM/Photon capacity:** Confirm acceptable usage/attribution and outage policy for configured public endpoints, or supply an owned/commercial geocoding and tile service with credentials, rights, quotas, uptime expectation and rollout geography. Public demo endpoints do not prove release-scale capacity.
4. **Help Point truth:** Supply an accountable, current source for staffed/open/accessibility status and routable entry, with refresh, expiry and correction owner; otherwise keep all such properties unknown and candidates labelled.
5. **Country and optional community evidence:** Identify official emergency/transport source owner and intended countries for dated regional review, then regenerate registry coverage. Optional route/time community or local-development claims need source rights, moderation duty, eligibility thresholds, correction and withdrawal operations before enablement.

No fixture, placeholder or bounded provider probe satisfies a live scenario claim.


## v0 flagship implementation continuation — 2026-10-03

The founder-authorised implementation supersedes the preceding current-state matrices. The frozen thesis is unchanged; there is no additional product phase. S1's formerly unresolved minimum is now explicitly defined and demonstrated with mapped loops, editable pace/duration, route/time/daylight choice and a guest no-GPS selected-route manual journey (guidance, progress, private check-in and explicit arrival). A timer alone still fails.

[Current S1–S7 matrix, repairs, commands, screenshots and walkthrough evidence](27_V0_IMPLEMENTATION_EVIDENCE.md). [Provider rights/capabilities/evidence register](28_PROVIDER_EVIDENCE.md). Three isolated browser agents covered guest, signed-in and traveler scenarios on mobile emulation and desktop using fictional data; source fixtures were identified separately from actual local APIs and imported OSM archive routing. Enlarged-text urgent overflow was observed, fixed and given a persistent browser regression.

No automated fixture establishes a live route, operating service, open/staffed Help Point or safety outcome. Physical-phone evidence remains **UNKNOWN**, external recruitment optional, independent privacy/security/staging retention/backup/provider-worker operations remain release-only gates. Migration0024 was applied only to isolated local test databases. No commit, deployment or production migration occurred. Full V1 release acceptance remains **PARTIAL**, public beta **NOT READY**.

**S4 long-night condition:** Save a complete fictional dinner/return explicitly; confirm arrival; advance the actual browser timers through three hours and prove the two-hour draft is removed before reload. Restore the exact dated return from the saved-return picker, recheck fresh options and require a separate start confirmation. Preserve the event as another leg, named places, time zone and recipient preferences without GPS, automatic sharing or a journey POST. Deleted/expired/account-inaccessible plans cannot be restored. `setFixedTime` alone is insufficient expiry evidence.
