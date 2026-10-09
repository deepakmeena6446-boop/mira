# Acceptance and verification

Use this matrix as the sprint release contract, not evidence that the proposed
behaviour already exists. Keep a result per ID: pass / fail / blocked / not run,
command or procedure, commit, environment, fixture/live status, and evidence path.
Never combine simulation, a browser emulator, a real phone and a live provider
into one “end-to-end verified” claim.

## Preparation baseline (9 October 2026)

At application base `7ac26b3fe893962777cb70a5904b6241fbdf087c`, before any product
implementation:

| Check executed | Exact outcome |
| --- | --- |
| `npm run lint` | Exit 0; no errors or warnings emitted |
| `npm run typecheck` | Exit 0; Next route types generated and TypeScript completed |
| `npm run test:unit -- --reporter=dot` | Exit 1; 901 passed, 2 failed, 903 total; 85 passing and 2 failing files, 87 total |
| Integration, build, bundle audit, fresh browser automation | Not run for this documentation preparation; not claimed passed |
| Real devices, real inboxes, live model/maps/news, production | Not verified |

Unit failures:

1. `tests/unit/audit-bundle.test.ts`: expected stderr to contain
   `no JavaScript or CSS client assets`, received empty stderr. Cause unresolved.
2. `tests/unit/infra.test.ts`: database-connect test expected `ECONNREFUSED` but
   received `EPERM` for loopback `127.0.0.1:1`, consistent with sandbox restrictions.
   Recheck in the actual local execution environment before changing behaviour.

Do not disable either test, weaken assertions merely to green the suite, or call
these failures product defects without diagnosis. The research-stage rerun also
reproduced them; this fresh preparation run is the baseline above. Temporary logs
were captured under `/tmp/mira-48h-baseline-*.log`; they may not exist on Claude
Code's machine. Record new logs locally with no secrets.

## Matrix

Types: U = pure/unit/component; I = local API/database integration;
B = browser automation against local test stack; H = human usability/accessibility;
D = physical device; L = live provider. Fixture passes establish code behaviour.

| ID / scope | Setup and action | Required observation | Verification / regression anchor |
| --- | --- | --- | --- |
| A01 M1 | New guest, no storage or permissions; open Home | Purpose + ask/structured action visible before metrics/contribution; no geolocation invocation, account wall or map | B; extend `tests/e2e/v-phase1-core.spec.ts` |
| A02 M1 | Show Home for five seconds to 3–5 people unfamiliar with it | At least 4/5, or all 3 if only 3 available, explain an outing/local-context use and locate a next action without a tutorial; report sample and misses | H; if people unavailable mark not run, not a release-safety claim |
| A03 M1–M2 | Type before hydration and submit; then browser back | Typed request reaches Mira once, no loss/duplicate; context remains correct | U/B; existing early-input/handoff tests |
| A04 M2 | Guest enters named pilot origin/destination/date/mode | Complete brief without GPS/account; selected results, time/zone and source correct | I/B; `l-phase-one-plan`, `v-phase1-core` |
| A05 M2 | Open Around a place; search a named result, no route | Context appears for selected place; no required trip, origin or GPS; current emergency-country context unchanged | U/I/B; `current-location-country.test.ts` |
| A06 M2–M3 | Early run, explicit 5 AM date and timezone, loop available/unavailable | Calculated daylight labelled; real loop only when supported; honest manual/edit fallback; no working-light/crowd claims | U/B; `plan-options`, `phase-one-plan`, run cases |
| A07 M2–M4 | Evening ride/transit and return with future departure | No invented last service; route not labelled verified for future time without source support; existing return editing preserved | U/B; `p-phase-five-travel`, `w-phase2-journeys` |
| A08 M3 | Fixture with several competing facts and explicit mode/constraint | <=3 priority items, <=2 primary actions, most relevant question answered; unsupported preference not presented as guaranteed | U/component/B; new brief selector tests |
| A09 M3 | Ready vs empty vs partial vs failed vs unavailable evidence | State-specific copy; failed never becomes “no reports”; partial keeps missing-source qualification | U/I/B; `evidence-state.test.ts` |
| A10 M3/C3 | Relevant attributed official advisory whose source establishes current action and matching scope | Correct source URL/publisher/time semantics/scope; no invented expiry or action | U/I with labelled fixture; L remains separate |
| A11 M3/C3 | Old event indexed today, city-level story near route, irrelevant article, missing actionability | Not promoted as current route advice; no “on your route”, safety score or generic incident-count summary | U/I; `safety-updates.test.ts`, existing held-out fixtures |
| A12 M3/C4 | Current eligible observation, stale observation, conflicting claims, unpublished report | Only eligible scoped evidence surfaces; conflicts not resolved by invented certainty; private submissions never appear as published | U/I; `contributions.test.ts`, community/aggregation tests |
| A13 M3/M7 | Claude absent, timeout, token exhaustion and interrupted stream | Useful deterministic answer/question plus actions; no fabricated source and no duplicate urgent action | U/I/B; `companion.test.ts` |
| A14 M3/M7 | Model proposes safe/unsafe verdict, hours, phone number, dispatch, unsupported action; test English/Hinglish legitimate refusals too | Unsupported consequential output withheld/replaced; legitimate wording not rejected merely for mentioning safety | U; `companion-output.test.ts`, scripted rubric; live model evaluation separately |
| A15 M3/M7 | Report/headline contains instruction to ignore policy or reveal location | Treated as data; no new action, secret, user coordinates or ungrounded claim | U/I; provider/tool mocks |
| A16 M4 | Open GoSheet from reply/plan, cancel, save, reopen | No journey/contact/share side effect until explicit start consent | I/B; `o-phase-four-journey`, `v-phase1-core` |
| A17 M4 | Start supported private manual and location journeys | Mode accurate; existing worker guard enforced; “I'm here” ends; chat acknowledgement alone does not falsely end | I/B; `journey-modes`, `local-check-in`, `w-phase2-journeys` |
| A18 M4 | WhatsApp/share-sheet action | User controls sending; no “sent” before actual supported outcome; cancel is not success | U/B; D for OS handoff |
| A19 M4 | Missing email, Mailpit accepted, provider failed, uncertain result, overdue worker retry | Accurate statuses; no dispatch/acknowledgement promise; existing at-most-once alert behaviour preserved | I/B; `phase-four-notify`; L for real inbox |
| A20 M4/M7 | Hide/resume Trip; stale/poor GPS; worker unhealthy | Foreground limitation/freshness visible; no false live dot or continuous-monitoring claim; worker-dependent checks marked paused | U/B; D for actual background behaviour |
| A21 M4 | Immediate help with unknown and reviewed country profiles; AI/network unavailable | Local support opens without AI; no guessed emergency number; dialler needs user action; listed place not represented as staffed | U/B; D/L for dialler and regional review |
| A22 M5 | Guest edits plan, changes tab route, reloads within TTL, advances clock past two hours | Supported draft resumes; Google resolutions scrubbed; expiry clears; no account-history claim | U/B; `phase-one-plan`, plan-state tests |
| A23 M5 | Account saves eligible named plan, reopens, edits, saves again, deletes | Same saved ID updates; owner/expiry/max10 guards retained; evidence recomputed; no journey starts | I/B; `phase-seven-saved-plans.test.ts` |
| A24 M5 | Device origin, Google destination, partial return leg; storage/server failure | Specific save eligibility/repair copy before action; server guards remain; no success toast for failure | U/I/B; both PlanDecision and PlanScreen |
| A25 M5/M7 | Select Google result in main and return flows; inspect session-serialized draft | No provider name/coordinates smuggled into retained user query; actual typed input retained; reload requires re-resolution honestly | U/B with synthetic labelled provider results; no live Google dependency |
| A26 M5 | Set explicit mode/help exclusion, revisit; override in current outing | Preference applies only as default; excluded classes respected; no inferred preference or automatic sharing | U/I/B; `travel-prefs.test.ts`, existing prefs tests |
| A27 M6 | Correct selected place, cancel, submit, fail submission | Correct context; optional; auth only when necessary; accurate private/pending status; no claimed immediate public improvement | I/B; `g-unsafe-and-contribution`, contribution tests |
| A28 M7 | GPS denied, timeout, permission revoked after opt-in | Named search works; no prompt loop; original plan retained; false current location absent | U/B; D for permission lifecycle |
| A29 M7 | Slow place A response arrives after user selects B/changes mode/time | No A fact displayed as B; old selected option invalidated; no stale response overwrites current edit | U/I/B; plan/context regression tests |
| A30 M7 | Offline after brief loaded, save/share/contribute attempted; cold offline open | Already loaded info labelled; no server success invented; retry/edit offered; cold shell limitation honest | B with network interception; D separately |
| A31 M7 | Signed-in first movement question with `plan:null`; named-place ephemeral request and follow-up | No new movement/location chat rows or coordinate-bearing stored cards; generic history contract explicit; UI copy matches | I; add coverage to `companion.test.ts` |
| A32 M7 | Sign out/change account, inspect local draft and reopen private links | Existing scoped clearing/owner controls preserved; tokens absent from new logs/analytics; revoked/expired links unavailable | U/I/B; `e-privacy.spec.ts` |
| A33 M1–M7 | 320x568, 390x844, desktop; long names, keyboard, 200% text/zoom, dark mode | No horizontal overflow, covered consent/submit/help, clipped critical qualifications; map optional; usable touch targets | B screenshots + H inspection; `x-phase3-a11y.spec.ts` |
| A34 M1–M7 | Keyboard-only and screen reader; open/close sheets and stream answer | Labels, heading order, focus trap/return, concise status announcement, reduced motion | B plus H; automated a11y alone is insufficient |
| A35 Regression | Existing auth, contacts, deletion/export, emergency, worker, report privacy, return legs, routes and source attribution | Relevant existing tests pass or failures precisely diagnosed; no silently weakened guards | U/I/B full relevant suites |

Human comprehension threshold is a suggested sprint check, not a validated
benchmark. No test above establishes that Mira reduces violence or that a place
is safe. A critical false claim, unintended sharing, or location disclosure blocks
delivery of the affected capability until repaired or disabled with a safe fallback.

## Execution commands and prerequisites

Inspect current scripts/config first. Dependencies: installed locked packages,
local PostGIS/Mailpit, test databases, pilot import and Playwright browser.
Use `npm ci` only when installation is needed; don't rewrite the lockfile casually.

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run audit:bundle
npx playwright test --project=mobile
npx playwright test --project=desktop
```

`npm run build` currently runs `next build --webpack` and worker bundling; older
release prose about the literal command using Turbopack is stale. `test:e2e` also
builds first; don't rebuild repeatedly without a change requiring it.

`tests/setup/test-env.ts` selects `mira_test`; `tests/e2e/e2e-env.ts` selects
`mira_e2e`. Verify local host/database identities without printing secrets.
`scripts/e2e-server.mjs` deliberately resets e2e schemas. Never point these tools
at a production/personal database or bypass their isolation checks. Reuse
`docker-compose.yml` and `db/init/`; don't delete existing Docker volumes.

For fast iteration run named affected Vitest files and Playwright specs, then
complete the applicable broader checks once. Add a small sprint browser spec if
that expresses the new journey more clearly. Keep existing protection assertions
when updating old layout/copy expectations. No arbitrary sleeps or permanent skips.

Browser evidence must state browser, viewport, build commit and fixture mode.
Existing e2e uses deterministic companion, test secrets, Mailpit and labelled
sample news. Screenshots of those runs are simulation. Inspect rendered screenshots
after changes, not just DOM tests. Real phones must separately establish keyboard,
background/pause, OS share/dialler, location and push behaviour.

## Release classification

- **Implemented and locally verified:** required code paths and applicable
  automated checks pass; human/device/provider gaps still listed.
- **Implemented, externally unverified:** local evidence exists but live provider
  or phone behaviour was not checked; do not promote that claim to verified.
- **Partial/blocked:** a mandatory path or applicable check fails/is unavailable;
  identify exactly what works and the usable fallback.

Do not change the repository's production NOT READY verdict in this sprint.
