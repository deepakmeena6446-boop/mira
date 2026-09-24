# MIRA — Overnight execution plan

**Implementation contract for Claude Code. Start at Phase 0 and continue through Phase 12.** Read `MIRA_PRODUCT_SPEC.md` for product behavior, `MIRA_UX_UI_SPEC.md` for screens and interaction, and `MIRA_TECHNICAL_ARCHITECTURE.md` for stack, data, APIs, privacy, and integrations. When wording differs, preserve the stricter privacy rule; resolve other discrepancies by these document roles and record the decision in the implementation handover, then continue. This plan was written against an **empty directory, not an existing repository**. Do not discard or overwrite work that appears after 2026-09-24; inspect it first.

# EXECUTION RULES — READ BEFORE EVERY PHASE

1. Re-read this phase and the relevant sections of the other three documents before starting.
2. Do not invent features, remove hard requirements because they are difficult, or silently simplify behavior.
3. Do not change architecture without a concrete blocker; document constraint, impact, best implementation, and future path if one arises.
4. A screen is incomplete until its backend behavior, authorization, failure states, and tests work. No fake production data, simulated contact delivery, or stubbed success states.
5. Keep raw reports, journeys, contacts, and identifying text out of public APIs, URLs, logs, analytics, and browser persistence.
6. Verify each phase against its binary Definition of Done, then **immediately continue**. Do not wait for human sign-off between phases.
7. At Phases 4, 8, and 12, compare completed work with the full plan and all three source documents. Do not let context size end the job; use these files as persistent instructions.
8. Parallel agents may implement bounded independent modules only after the main process fixes shared schemas/contracts. Every agent reads all four docs; the main process integrates, runs migrations/tests, and owns final verification. Never let parallel agents redefine the product or architecture.
9. A genuine blocker is missing credentials, unavailable external data/service, an irreversible destructive action, or a legal/financial transaction. Finish independent work, implement clean disabled/fallback states, and record exact remaining work. Normal package, UI, schema, and implementation choices are not blockers.
10. Do not claim completion on a note, mock, partial test pass, or polished home screen. The final completion condition at the end of this file is mandatory.

## Shared operating method

For each task, implement end to end in small commits if Git is initialised. Run the named tests, inspect real responses and UI, fix failures, and mark the phase complete in the final handover only when its criteria pass. Keep one concise progress checklist in the working session; no extra governance files. If a command is unavailable, install the ordinary dependency or document a reproducible substitute. Keep all production seed data sourced; fixtures belong under `tests/fixtures` and are never loaded by the running app.

## Phase 0 — Repository, stack, and real pilot foundation

**Objective:** A reproducible Next.js + PostGIS + worker skeleton, real pilot-data import path, and passing baseline checks.

**Preconditions:** None. Inspect directory, hidden files, Git state, instructions, runtime, Docker, and network before creation. The original workspace inspection found it empty and not a Git repo.

**Tasks and subtasks:**

1. Initialise Git only if still absent; scaffold Next.js TypeScript App Router; pin stable dependencies and lockfile; add lint/typecheck/test/build scripts. Create `.env.example`, an `env:local` script that generates ignored local secrets and a random admin password hash, and startup validation without committed secrets. Do not stop for local credentials.
2. Add Docker Compose for PostGIS and Mailpit; implement Drizzle migration runner and first migrations; start web and worker processes with readiness endpoints/heartbeat. Verify worker cannot be silently absent while contact journeys appear available.
3. Record the fixed DU North Campus/Vishwavidyalaya pilot rectangle (28.6850–28.7050° N, 77.2020–77.2250° E) in `data/pilot/manifest.json`. Write a repeatable, rate-respecting real OSM import with source URL/date/licence/checksum; import places and walkable graph; validate bounds, IDs, geometry, and nonempty connected components. Commit permitted source artifacts or documented retrieval steps, respecting source terms. Never invent real places.
4. Add test-only graph/place fixtures separated from production import. Add a small design-token baseline and accessible shared layout; do not spend the phase building feature screens.

**Files/modules:** `package.json`, lockfile, `src/app`, `src/server/config`, `src/worker`, `db/migrations`, `docker-compose.yml`, `scripts/import-pilot.ts`, `data/pilot`, `tests/fixtures`, `.env.example`.

**Data/UX changes:** Pilot, place, graph, actor/admin/worker foundation tables; base layout, typography, colors, attribution slot, service-unavailable state. No community seed reports.

**Tests and verification:** Run clean install, migration, unit test, typecheck/lint, production build, web/worker smoke, and import validation. Inspect manifest provenance and at least one real imported place and connected way. If external extract unavailable, validate importer on a clearly marked test fixture, retain honest production unavailable state, record exact source blocker, and continue other phases.

**Definition of Done:** Scripts reproducibly start web+worker+DB; no committed secret; production map tables contain verified sourced data **or** map capability is honestly disabled with exact external blocker recorded; all baseline checks pass. **Unlocks:** all later phases.

## Phase 1 — Product shell and navigation

**Objective:** A polished, accessible mobile shell that clearly offers KNOW, ACCOMPANY, REPORT.

**Preconditions:** Phase 0 running stack and shared design tokens.

**Tasks and subtasks:** Build responsive header/bottom navigation, home hero and three primary cards, active-journey slot, privacy/about page, common buttons/inputs/cards/toasts/skeletons, route error boundaries, metadata, and text alternatives. Wire capability flags from server for map/worker/SMTP/AI; do not display disabled features as live. Establish actor cookie on first stateful action, not passive page load. Add accessible focus and reduced-motion behavior.

**Files/modules:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/privacy`, `src/components`, `src/styles` or equivalent, session/capability server modules.

**Data/UX changes:** No new sensitive data; navigation and empty/error states.

**Tests and verification:** Keyboard traverse mobile/desktop; inspect at 320, 390, 768, and 1280px; verify all three actions route correctly and no dummy success content appears. Run typecheck and build.

**Definition of Done:** Home and shared navigation work with keyboard/touch, no horizontal overflow, privacy copy is accurate, and missing capabilities are signalled honestly. **Unlocks:** feature UI phases.

## Phase 2 — KNOW: real place and walking context

**Objective:** Useful pilot place/route context with zero community reports.

**Preconditions:** Phases 0–1; real imported snapshot for full acceptance, or importer blocker isolated.

**Tasks and subtasks:**

1. Implement local indexed place search, pilot-bound checks, and optional one-shot geolocation with manual fallback; keep coordinates out of URLs.
2. Implement server-side graph snap, shortest route and genuinely distinct alternate under architecture rules. Return no route when disconnected; never draw straight lines as a walking path.
3. Build `/api/pilot`, `/api/places`, `/api/know` with sourced facts, source age, route geometry/duration, coverage and uncertainty. No public report table joins.
4. Build search, place, and route screens with MapLibre, visible attribution, text-list fallback, loading/no-results/outside-pilot/map-failure/no-route states. Separate map facts, community section, and unknowns. Use time-band input without implying live conditions.

**Files/modules:** `src/domain/routing`, `src/server/know`, `src/app/api/pilot`, `places`, `know`, `src/app/know`, `src/components/map`.

**Data/UX changes:** Indexes on places/graph and pilot geometry as needed; complete KNOW flow.

**Tests and verification:** Unit tests for disconnected graph, valid alternate, duration, restricted ways, and missing tags. API tests assert source labels and no private fields. In browser inspect one real pilot place and connected route, then deny location and block tiles to confirm fallback. Verify sparse data copy says no recent observations, never “safe.”

**Definition of Done:** Real pilot baseline works without community or AI; routes are graph-derived or absent; source/uncertainty always shown; map failure does not erase evidence. **Unlocks:** report place selection, aggregate display, journey destination picker.

## Phase 3 — REPORT: private intake and manual structure

**Objective:** End-to-end anonymous report intake with review-before-submit and zero public exposure.

**Preconditions:** Phases 1–2 place index, migrations, actor session.

**Tasks and subtasks:** Create the experienced/witnessed, category, approximate place/recency/time-band, optional 1,000-character narrative form; add browser speech only if on-device processing can be verified, with editable transcript; privacy preview and confirmation. Implement server validation, pilot coarse-cell mapping, deterministic PII detection/redaction flags, text encryption, rate limits, idempotency key, and private `pending/held` states. Ensure no raw text in client storage, URL, response, or logs. Add acknowledgement without status/publication promise. Keep flow complete with AI disabled.

**Files/modules:** `src/app/report`, `src/app/api/reports`, `src/domain/report`, `src/server/report`, `src/server/crypto`, report migrations.

**Data/UX changes:** `reports_private`, `report_structured` initial schema, actor and abuse counters; entry/review/receipt screens and all failures.

**Tests and verification:** Submit normal, Hindi/Hinglish, empty narrative, PII-bearing, duplicate-retry, off-pilot, oversized, and rate-limited cases. Inspect DB encrypted text and public API/network logs. Confirm text-only browser works; if voice is exposed, prove on-device processing and editable transcript. Run mobile flow.

**Definition of Done:** A real report is privately persisted once; PII is flagged; no raw report is public; user receives a truthful receipt. **Unlocks:** moderation, aggregation, optional AI.

## Phase 4 — Minimal moderation before publication

**Objective:** Only an authenticated moderator can review and approve structured content for aggregation.

**Preconditions:** Phase 3 reports and admin auth foundation.

**Tasks and subtasks:** Implement Argon2id admin password verification from environment, short-lived admin cookie, Origin/CSRF checks, login throttling, logout. Build queue/detail with pending/held/approved/rejected filters, private narrative open, PII and duplicate hints, editable structured fields, approve/hold/reject actions, reasons, and revoke from future releases. Approval must never create a raw public page. Add safe audit metadata (actor admin/session ID, action/time, no narrative/contact).

**Files/modules:** `src/app/admin`, `src/app/api/admin`, `src/server/admin`, `src/domain/moderation`, migrations if needed.

**Data/UX changes:** Admin session/audit metadata; responsive accessible moderation queue.

**Tests and verification:** Unauthenticated and actor-cookie requests return 401/403; credential attacks throttle; approve/reject transitions are valid and idempotent; PII/invalid structured tags cannot be approved; public endpoints remain unchanged after one approval. Compare work so far against all source documents.

**Definition of Done:** Admin can safely process a report, but no single approved report becomes public. **Unlocks:** aggregation release.

## Phase 5 — Community intelligence release

**Objective:** Reviewed observations become coarse, thresholded, time-relevant KNOW context.

**Preconditions:** Phases 2–4, especially moderation gate.

**Tasks and subtasks:** Implement duplicate groups and burst hold hints; weekly aggregation of eligible reports submitted in the prior 21 days with `today/yesterday/past week` recency (ensuring observations fall within 28 days), by fixed 500m cell/category/IST time band, five independent actors and five new contributors for changed release, source-safe factual templates, 35-day expiry, emergency suppression, and qualitative coverage. Keep positive/environmental/incident observations separate. Feed public KNOW **only** from `aggregate_releases`; attach source/freshness/uncertainty. No raw text/count/exact point/time in public data.

**Files/modules:** `src/domain/aggregation`, `src/server/aggregate`, `src/worker`, `src/server/know`, `src/app/know`, migrations/indexes.

**Data/UX changes:** `aggregate_releases`; community evidence cards; sparse/no-qualifying-data copy.

**Tests and verification:** At 1/4 contributors nothing public; at 5 independent reviewed contributors one coarse release; five repeats from one actor do not qualify; day and late do not merge; a tiny weekly increment does not reveal a new release; revocation and expiry remove data. Inspect all public JSON. Use **test fixtures only** for synthetic observations.

**Definition of Done:** Thresholded release works end to end, sparse data is honest, and public output cannot expose individual reports. **Unlocks:** full report-to-Know flow.

## Phase 6 — ACCOMPANY: journey and trusted-contact check-in

**Objective:** Real timed temporary journeys, contact consent, missed-alert delivery, and deletion.

**Preconditions:** Phases 0–2, worker heartbeat, SMTP adapter/Mailpit; independent of community implementation.

**Tasks and subtasks:** Implement owner-only actor-cookie journey CRUD/state machine and one active journey rule. Build setup/active/missed/completed UI with explicit disclosure and ETA constraints. Add optional email invitation, token hash, clean-URL token exchange, recipient acceptance, revocation, and no live map. Implement due-worker polling with transaction/row locking, one at-most-once missed-alert attempt, sent/failed/unconfirmed outcomes, ETA+30m expiry, 24h hard purge. Show no-contact and SMTP-disabled paths truthfully. Do not collect continuous GPS or origin. Make arrival/end/extend race-safe and idempotent.

**Files/modules:** `src/domain/journey`, `src/server/journey`, `src/server/mail`, `src/worker`, `src/app/accompany`, `src/app/invite`, journey/invite API routes and migrations.

**Data/UX changes:** Journey/contact tables; setup, active, invite, at-ETA, missed, terminal states.

**Tests and verification:** Inject clock: arrival before ETA; end; one extension; missed at ETA+10; accepted contact gets exactly one Mailpit email; pending/revoked/no SMTP gets none; delivery failure is visible; expiry and hard delete occur; race between arrive and worker yields one valid terminal outcome. Inspect email contains no origin/route/live coordinate. Run closed-tab worker test.

**Definition of Done:** Journey state, consented email, no-contact flow, and deletion work without a browser staying open; no tracking/history exists. **Unlocks:** full Accompany E2E.

## Phase 7 — Optional AI sense-making adapter

**Objective:** Helpful report structuring without making AI a dependency or publication gate.

**Preconditions:** Phases 3–4 and deterministic privacy pipeline.

**Tasks and subtasks:** Add report-level consent, OpenAI adapter behind a server-only interface, pre-redaction, `store:false`, strict structured schema with `unknown`, timeout, schema validation, provider failure fallback, and editable suggestions. Ensure no raw text/exact location/contact in provider payload. Duplicate similarity may remain deterministic for V0. Do not create agent loops, training pipelines, automatic truth judgments, or AI-authored public claims. If no key or provider privacy approval, hide AI control and retain manual flow.

**Files/modules:** `src/server/ai`, `src/domain/report`, `src/app/report`, report API, `.env.example`.

**Data/UX changes:** Optional consent flag and suggestion state, no new public data.

**Tests and verification:** Mock provider accepts only minimised payload; invalid/refusal/timeout returns manual flow; opt-out never calls provider; model output cannot approve/publish. With a real key only if provided, run one limited integration smoke after confirming terms; do not fabricate success without it.

**Definition of Done:** Optional adapter and tests work; lack of key leaves REPORT complete and unmisleading. **Unlocks:** optional AI assistance only.

## Phase 8 — Companion experiment boundary

**Objective:** Decide and implement the bounded V0 companion behavior without weakening core flows.

**Preconditions:** Phase 6; all three core actions functioning.

**Tasks and subtasks:** Keep a `companion` module/interface independent of journeys and reporting. If a genuinely usable in-app “Stay with me” text session can be implemented, add explicit start/stop, short-lived interaction, clear “not monitored/emergency help” copy, and no transcript retention. Speech is allowed only if on-device processing is verified; otherwise text only. If the experiment cannot be verified, ship **no visible Call Me control**; retain a clean disabled interface and record why. Do not implement a fake phone call or imply a human is listening. Reconcile completed product against all docs here.

**Files/modules:** `src/domain/companion`, optional `src/app/accompany` and UI, tests.

**Data/UX changes:** None if deferred; optional ephemeral in-app UI only.

**Tests and verification:** If enabled, test start/stop, unsupported API, permission denial, page close, and privacy copy; verify no stored audio/transcripts. If disabled, verify no visible phone-call claim, broken button, or route.

**Definition of Done:** Either a truly working bounded experiment or a hidden, documented boundary; core product remains unaffected. **Unlocks:** privacy/polish audit.

## Phase 9 — Privacy and security hardening

**Objective:** Prove sensitive data cannot cross the wrong boundary and is deleted on schedule.

**Preconditions:** Phases 2–8.

**Tasks and subtasks:** Audit all route handlers, client bundles, SQL joins, logs, errors, email content, AI payloads, tile requests, browser storage, CSRF, rate limits, cookie flags, admin auth, encrypted fields, and test fixture isolation. Verify retention jobs and backup purge guidance. Add safe health alerts for stale worker and mail errors. Remove any direct access path to private report/journey/contact tables from public code. Test malicious strings, replayed tokens, forged Origin, expired invite, actor-cookie swap, and admin session expiry.

**Files/modules:** Cross-cutting server/client/config/worker/deployment docs already in codebase; add only needed tests and fixes.

**Data/UX changes:** Security/error copy and enforcement fixes; no new features.

**Tests and verification:** Run public endpoint snapshot/allowlist tests; DB deletion tests; inspect built client assets and logs for secrets/PII; verify no permanent movement table exists; inspect contact link scope. Record any external blocker precisely.

**Definition of Done:** Red-line audit passes; sensitive data is absent from public surfaces and expired rows; no critical high-risk leak remains. **Unlocks:** release polish.

## Phase 10 — Product polish and accessibility

**Objective:** Consumer-quality, calm mobile experience with complete states.

**Preconditions:** Core flows and security audit.

**Tasks and subtasks:** Review every screen/state in UX spec; tighten typography, spacing, contrast, focus, touch targets, responsive map/list, skeletons, retry and error copy, microcopy, loading prevention of double actions, low-motion behavior, Hindi/Hinglish text handling, and source/uncertainty visibility. Remove placeholder copy or buttons. Keep red only for actual errors and avoid fear design.

**Files/modules:** `src/app`, `src/components`, styles, accessibility tests.

**Data/UX changes:** Presentation/state fixes only.

**Tests and verification:** Inspect at 320/390/768/1280px and 200% zoom; keyboard and screen-reader spot checks; low bandwidth and tile failure; browser console; complete mobile home-to-each-action smoke. Run build.

**Definition of Done:** All required states have useful UI, no overflow or blocking accessibility defect, and no fake production behavior. **Unlocks:** full product verification.

## Phase 11 — Full product verification

**Objective:** Verify complete user stories through real API, DB, worker, and UI.

**Preconditions:** Phases 0–10 and local web+worker+PostGIS+Mailpit running.

**Tasks and subtasks:** Verify these exact flows end to end:

1. **A:** Home → Know → real pilot place/route → sourced facts and uncertainty; disable tiles and repeat in list view.
2. **B:** Home → Report → private receipt → admin review → five independent approved test reports → weekly release → coarse Know evidence; one report stays private.
3. **C:** Home → Accompany → start → close/reopen tab → arrive → data purged by deadline.
4. **D:** Home → Accompany → invite accepted → miss ETA+10 via test clock → exactly one Mailpit alert → expiry/purge; repeat without accepted contact and with mail failure.
5. **E:** PII-containing report → hold/redact/review → zero identifying text in public JSON/UI/AI request.
6. **F:** Sparse/no community data and outside-pilot requests → explicit insufficiency/coverage, no safety verdict or fabricated incident.
7. **G:** Malicious narrative, forged requests, duplicate retries, expired token → validation/rate-limit/auth safe outcomes without data leak.

**Files/modules:** E2E/integration tests and any fixes across app, server, worker.

**Data/UX changes:** Only fixes; synthetic reports remain test-only.

**Tests and verification:** Automate feasible flows with Playwright and Mailpit; manually inspect mapped pilot and mobile states. Run entire unit/integration/E2E suite, typecheck/lint, production build, production-mode smoke of both processes. Save concise pass/fail evidence in final handover. Do not call a flow passed from screenshots alone.

**Definition of Done:** A–G pass or an exact external blocker is isolated with honest fallback and all independent assertions passing. **Unlocks:** final audit.

## Phase 12 — Final reconciliation and handover

**Objective:** Prove the implementation matches all four documents and is runnable by another developer.

**Preconditions:** Phase 11 results.

**Tasks and subtasks:** Review the Product Spec section by section, every UX screen/state, every Architecture boundary/table/API/retention rule, and each phase DoD. Search code for `TODO`, `FIXME`, `mock`, `stub`, `placeholder`, fake seed data, unfinished handlers, and misleading copy; resolve critical items. Re-run tests/build after fixes. Check package scripts, `.env.example`, local setup, database migration/import, web+worker run instructions, and production prerequisites. Produce a concise handover in the final response or existing project README; do not create extra governance documents. Name exact external blockers, affected requirement, implemented fallback, and future step.

**Files/modules:** All code/test/config; README may document run steps. Do not edit the four specification files to hide incomplete implementation.

**Data/UX changes:** Only corrective changes.

**Tests and verification:** Clean-install or clean-checkout run where practical; full test suite, build, production smoke, public-data inspection, and red-line audit. Compare actual behavior with the three source specs and this plan. Confirm no unreviewed agent branch remains unintegrated.

**Definition of Done:** Final completion condition below is true; handover states evidence and genuine limitations precisely.

## Practical parallel work and integration checkpoints

- After Phase 0 contracts/migrations are fixed, independent UI components and pure routing/report domain tests may run in parallel. Integrate before Phase 2/3 DoD.
- After Phase 3 schema is fixed, admin UI and deterministic moderation/aggregation tests may run in parallel; main process alone merges schema/API changes and verifies Phase 4 before any aggregate release.
- Journey UI and worker/mail implementation may run in parallel after the state machine/API are written; main process tests races and real Mailpit delivery before Phase 6 DoD.
- Accessibility review and privacy audit can run alongside late feature work, but Phase 9 and Phase 11 are sequential integration gates. An agent's “done” message is never verification.

## One explicit final completion condition

Claude Code may stop only when **every required phase is complete**, every phase Definition of Done is satisfied, critical automated tests pass, production build succeeds, core end-to-end flows A–G have been verified, no critical TODO/FIXME/mock/stub remains, the privacy red lines have been audited, and implementation has been reconciled against **all four MIRA documents**. UI completeness, a single working flow, context exhaustion, an agent report, partial tests, or a handover note do not meet this condition.

If a genuine external dependency prevents one item: finish all unaffected work; implement a clean, truthful interface/fallback; document the exact blocker and what remains; verify that it does not break the rest of the product. Do **not** call that item fully implemented. The most likely blockers are a real OSM extract at build time, production SMTP credentials, and optional hosted AI credentials. Begin with Phase 0 repository inspection and source-backed pilot import.
