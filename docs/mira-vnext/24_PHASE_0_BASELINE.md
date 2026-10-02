# Phase 0 — implementation and test baseline

**Working-tree reference:** `497db67fcd5b` on `codex/community-first-mobile`, 2026-10-02, with pre-existing edits to `src/app/api/mira/route.ts`, `src/domain/limits.ts`, `src/server/providers/companion/{index,signals}.ts`, three related tests, and untracked `docs/mira-product-research/` and `docs/mira-vnext/`. Those edits were present before Phase 0 and were preserved. Phase 0 adds only a pure contract module, regression tests and these canonical notes. No user flow, provider, database migration or telemetry changed.

## Seven scenario baselines

These are **implementation-backed current-state observations**, not claims that the V1 scenario demonstrations passed. The current browser suites exercise parts of the paths; a new real-device observation was not performed in Phase 0.

| Scenario | Current shipped path | Gap to the V1 acceptance test |
|---|---|---|
| S1 early run | Around can search and show a walking route, lighting and Help Points when covered; `/api/geo/route` labels approximate routes. Trips can start from explicit points. | No single guest 4:45 intent/loop/time contract travels through Around, Ask and trip. Unknown lighting is not a complete future comparison. |
| S2 late commute | Signed-in Trips supports walk/ride/transit/manual ETA, active location, optional contact selection in UI, worker and end/extend. `/api/geo/route` can return `route:null` for unsupported transit. | No future service-hours proof or plan-linked replan. API `startTripSchema` currently defaults omitted `share` to `true`; Phase 4 must make an affirmative share choice, including direct API clients. |
| S3 local destination | Around place search and route use named place results and current or selected map points. | No shared origin/destination/time object; no cross-surface guarantee that a remote named origin survives map/Ask navigation. |
| S4 date/event | A current trip can be started and a contact can be asked to check on the traveller. | No arrival/return pair, event time or optional check-in bound to a planned return. |
| S5 late arrival | Geo accepts explicit coordinates; Ask Mira presently limits unsupported travel advice rather than asserting late service. | No destination-local future plan, verified airport transfer availability or structured manual handoff. |
| S6 basic travel | Reviewed country context and emergency coverage exist with partial/unknown status. | No two-leg plan or independent time-zone/evidence state per leg. |
| S7 discomfort | Emergency UI is direct; scripted and model paths emit an SOS card before context/model response; nearby Help Points use class and listed hours. Active trips expose freshness and end/contact paths. | No unified immediate change/support options with routed candidate reachability and verified staffing/access. Existing place category is not proof of a staffed refuge. |

## API and privacy facts frozen for migration

- Browser geo route is `POST /api/geo/route`, with point coordinates in the body. Ride/transit `routes=[]` produces HTTP 200 with `route:null`; a thrown provider failure produces a generic HTTP 500 and code-only server log. Arrival Help Point evidence is separate and may be empty/failed. An approximate walking geometry is not treated as street evidence for lighting/Help Points.
- Current `/api/mira` is signed-in NDJSON with rate limits, a deterministic danger card, and 30-day raw **user** message text. Assistant history is scrubbed, but that does not make the user text ephemeral. The pre-existing capability-answer edits remain untouched.
- A current active trip keeps at most 20 points; explicit close deletes points, closed token links reveal only state and first name for 30 minutes, and the worker hard-deletes the journey at the six-hour `purge_at`. Worker heartbeat and Mailpit delivery are separate dependencies.
- Browser-to-Mira coordinates are POST-body data. Some server-to-provider reverse/geocoding GET URLs contain rounded coordinates; [location privacy](../LOCATION_PRIVACY.md) remains the precise boundary.
- `remember_habits` currently defaults on in migration `0012`. The consent transition in [19](19_MIGRATION_PLAN.md) remains a later migration gate.

## Phase 0 contract

`src/domain/plan-contract.ts` exports version 1 schemas for a movement intent, evidence and action. A named origin carries its own query, optional resolved point and future local time/IANA zone. Device coordinates require the explicit `from_here` variant. An unknown claim has a reason and no value; a known claim needs source, observation/expiry and scope. A proposed side effect requires confirmation and cannot parse as completed without a receipt. The schemas are pure and currently have no API/storage consumer. Phase 1 must adapt entry points to them; later phases must validate provider facts and receipts at runtime.

## Evidence and result

**Phase 0 — PASS.** Tests and command outcomes are recorded in the Phase 0 section of [20](20_ACCEPTANCE_TESTS.md). No rollback was needed: the new contract and tests are unreferenced by production flows and can be removed without a data transition; that removal was not exercised. Existing public-beta release gates and real-phone checks remain pending. The exact next build phase is **Phase 1 — Intent and plan, as a vertical entry path**. Phase 1 was not started here.
