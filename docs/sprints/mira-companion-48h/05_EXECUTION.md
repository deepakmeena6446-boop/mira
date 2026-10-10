# Autonomous execution sequence

This is the frozen implementation plan for Claude Code, not an instruction to the
documentation preparer to implement features. Read 00–05 in full before editing.
Work only on `sprint/mira-companion-48h`; never merge main or deploy production.

## Operating rules

1. Read all six documents and `AGENTS.md`; inspect relevant bundled Next.js guides.
2. Verify branch, base, remotes and working tree. Preserve existing work. No
   destructive reset, silent stash, or overwriting another person's changes.
3. Work only on the sprint branch. Fetch and fast-forward only when safe. Never
   force-push. If the remote advanced, inspect and reconcile without discarding work.
4. Implement one coherent vertical slice at a time, including fallback and tests.
5. Test and commit meaningful completed increments using descriptive commits.
6. Fix relevant failures promptly; don't accumulate a large untested diff.
7. Make ordinary technical choices autonomously inside this contract. No further
   founder decisions are needed on navigation, scope, save boundary or data gating.
8. Missing credentials/infrastructure: implement the supported fallback and record
   the blocked live check. Continue independent work; never invent provider success.
9. Never fabricate behaviour, results, local facts or tests. Do not disable meaningful
   tests to get green. Keep fixture data confined to test/demo modes and labelled.
10. Push completed commits only to `sprint/mira-companion-48h`.
11. Do not merge to main, change production infrastructure, deploy production,
    expose secrets, or activate public incident publication.
12. Don't stop for routine clarification answerable from code and these documents.
    If instructions truly conflict, preserve the functioning core, document the
    conflict and continue independent tasks rather than expanding the scope.

## First task and local bootstrap

T00 is first: confirm the branch and baseline, then trace the existing guest Home
-> named-place Plan -> brief path. Do not begin by rewriting AI, maps or schema.

Run these read-only checks from the repository root:

```bash
git status --short --branch
git remote -v
git log -1 --oneline
git branch --show-current
```

If clean and not already on the sprint branch:

```bash
git fetch origin sprint/mira-companion-48h
git switch sprint/mira-companion-48h
git pull --ff-only origin sprint/mira-companion-48h
```

For a fresh clone without a local branch, use
`git switch --track origin/sprint/mira-companion-48h`. If the clone has a restricted
fetch refspec, fetch explicitly with
`git fetch origin refs/heads/sprint/mira-companion-48h:refs/remotes/origin/sprint/mira-companion-48h`
first. Do not blindly overwrite an existing local branch. Dirty conflicting work
requires preservation and a precise blocker report, not automatic stash/reset.

Read every numbered document, then establish local services as needed using the
repository README plus 03/04's corrections. Reuse installed dependencies. If absent,
`npm ci`; use local Compose for PostGIS/Mailpit. Read any applicable cloud-runtime
Docker/network instructions before container use. `npm run env:local` only if a
local env file is missing; it prints a local moderator password, so capture output
privately, never in the handoff or Git. Never use `--force`. Migrate/import only a
confirmed local development/test database; no production access is necessary.

## Sequenced bounded tasks

Timeboxes total 48 hours including verification. When blocked, record the reason
and execute an independent task. Final 12 hours are reserved for checks/fixes/handoff.

### T00 — Baseline and implementation trace (0–6h)

- Purpose: establish what works on this execution machine and preserve work.
- Files/modules: six sprint docs, `AGENTS.md`, `package.json`, README,
  `playwright.config.ts`, `vitest.config.ts`, local service scripts, Home/Plan/Around.
- Dependencies: Git access, dependencies; local database for integration/browser.
- DoD: branch/base/worktree recorded; existing user changes identified; lint,
  typecheck and unit baseline recorded; local named-place flow traced; database
  targets checked; scope IDs mapped to tasks. Reproduce 04's two baseline failures
  if present before attributing them to new work.
- Verification: commands in 04; inspect current route imports and one mobile view
  where runtime is available. No live/provider claims from fixtures.
- Failure/fallback: record unavailable Docker/DB/network; continue pure domain and
  UI work with existing mocks. Do not create fake production data or bypass sandbox.

### T01 — Clear entry to the companion (6–12h)

- Purpose: complete Home -> outing or selected-place entry without permission friction.
- Files/modules: `HomeNow.tsx`, `Situations.tsx`, `LocationOnOpen.tsx`,
  `ask-handoff.ts`, existing i18n strings and Home browser tests.
- Dependencies: T00; existing routing. No AI key required.
- DoD: M1 and entry parts of M2 match 02; four tabs retained; no first-open GPS;
  ask text survives hydration/handoff; active journey still reachable; no counts,
  contribution or map dominate Home.
- Verification: A01/A03/A05/A28/A33; lint/typecheck and relevant UI tests.
- Failure/fallback: structured Plan/Around links remain useful when chat fails;
  named place entry remains when location fails. Preserve explicit prior consent.
- Commit: `feat(companion): lead home with outing and local-context actions`.

### T02 — Concise contextual brief and real actions (12–18h)

- Purpose: turn existing facts into a relevant response rather than an exhaustive ledger.
- Files/modules: `PlanDecision.tsx`, `AroundNow.tsx`, `MiraChat.tsx`,
  `src/lib/brief.ts`, `decision-take.ts`, optional pure brief selector,
  current Evidence/Frame components and API response types.
- Dependencies: T01; existing geo/plan evidence contracts.
- DoD: M2/M3; selection order and limits from 03; source detail available;
  context-key invalidation; explicit mode respected; map secondary; existing
  actions reachable without inventing service availability.
- Verification: A04–A09/A29/A33; unit tests for selection and state handling plus
  local named-place and sparse-coverage browser paths.
- Failure/fallback: use deterministic partial brief, edit/retry and manual plan;
  never fabricate route/time/entrance. Do not create a second route engine.
- Commit: `feat(companion): prioritise sourced context and next actions`.

### T03 — Evidence, news and model boundaries (18–24h)

- Purpose: prevent concise wording from upgrading weak information into certainty.
- Files/modules: companion provider/output guard/persona, `evidence-state.ts`,
  `safety-updates.ts`, existing safety-intel adapters, summary selectors and fixtures.
- Dependencies: T02. Live model/news optional, not required for deterministic branch.
- DoD: M3/M7 and C1/C3/C4 handling: output bound to facts/actions; automatic news
  absent unless strict gate passes; community source/freshness preserved; missing,
  failed and partial distinct; unsupported generated summary replaced before display.
- Verification: A09–A15; English/Hinglish regression; all existing affected safety
  update and output-guard tests. Test fixture actionability rather than assumed news.
- Failure/fallback: wholly deterministic summary; omit unsupported news/community
  items while preserving explicit source/error detail. Never use the LLM as truth judge.
- Commit: `fix(companion): enforce evidence and fallback boundaries`.

### T04 — Saving, preferences and private continuity (24–30h)

- Purpose: make the return visit work within real storage constraints.
- Files/modules: `plan-state.ts`, `plan-store.ts`, `saved-plans.ts`, PlanDecision,
  PlanScreen, PlanSheets, return-leg handlers, `JourneysScreen.tsx`, prefs APIs,
  `/api/mira/route.ts`, MiraChat, ask handoff, existing clear-device helper.
- Dependencies: T02; account/database for persistent saving.
- DoD: M5/M7; supported save/update/reopen/delete; eligibility UI before action;
  actual typed query preserved without Google display-content persistence; mode
  precedence; first movement/context turn and follow-ups ephemeral as specified;
  no coordinate-bearing new chat cards persisted; sign-out rules retained.
- Verification: A22–A26/A31/A32; integration save ownership and chat-row assertions;
  Google selection test fixtures across main and return paths. Old stored history
  remains untouched and is disclosed as outside the repair.
- Failure/fallback: memory/session draft with honest TTL; failed save is not success;
  Google account saving remains clearly unsupported; no schema/provider rewrite.
- Commit: `fix(companion): make saving and private context predictable`.

### T05 — Honest journey/help and optional contribution (30–36h)

- Purpose: connect the brief to real assistance and community actions without overclaiming.
- Files/modules: GoSheet, TripScreen, JourneyDock/Home, SafetyAccess, existing
  follower/sharing surfaces, AroundNow, ContributeScreen and contribution APIs.
- Dependencies: T02/T03; existing journey worker and local mail tests for related paths.
- DoD: M4/M6; no implicit start/share; foreground/stale location and delivery copy
  accurate; emergency independent of AI; correction optional, correctly scoped,
  private/pending where applicable; no Scout changes or incident-publication enabling.
- Verification: A16–A21/A27/A30/A35; existing worker, sharing, consent and private
  report tests; mobile button placement. Real-device checks recorded separately.
- Failure/fallback: manual send and explicit check-in; accurate unavailable states;
  no invented notification, emergency dispatch or successful contribution.
- Commit: `fix(companion): align support and contribution with actual capabilities`.

### T06 — Integrated verification and repair (36–45h)

- Purpose: deliver three coherent experiences rather than disconnected components.
- Files/modules: affected application/tests; 04 acceptance matrix; existing build,
  bundle, browser and local stack configuration only when a relevant defect requires it.
- Dependencies: T01–T05. Integration/browser need isolated local services.
- DoD: applicable lint/typecheck/unit/integration/build/bundle/browser checks run;
  critical defects fixed; actual screenshots inspected at required viewports;
  failures, intentional test changes and unavailable checks recorded exactly.
- Verification: full command sequence in 04, focused reruns after fixes; A01–A35
  classified individually; keyboard, source links, dark mode and overflow inspected.
- Failure/fallback: cut stretch; fix affected core; do not disable meaningful tests,
  change production settings, or claim external verification. Commit functioning
  bounded core if environment blocks further work and state incomplete gates.
- Commit: `test(companion): verify mobile flows and failure boundaries` (plus
  separate fixes where appropriate, not an empty test-only commit).

### T07 — Report, commit and push (45–48h)

- Purpose: leave a reviewable, reproducible result for the founder.
- Files/modules: completed implementation and tests; append report below in this
  document. Keep exactly six primary sprint documents; no seventh report required.
- Dependencies: T06 or explicit classified blockers; Git push permission.
- DoD: meaningful completed commits; final worktree/diff reviewed; report matches
  actual state; push only sprint branch; remote commit verified; main untouched.
- Verification: `git diff --check`, `git status --short --branch`, commit log,
  `git diff --stat <recorded-base>...HEAD`; inspect staged paths and no secrets.
  Push with `git push -u origin HEAD:refs/heads/sprint/mira-companion-48h`, then
  compare `git rev-parse HEAD` with
  `git ls-remote origin refs/heads/sprint/mira-companion-48h`.
- Failure/fallback: preserve commits locally; record exact push rejection. Fetch
  and reconcile remote advancement safely; never force-push or push another branch.

## Completion rules and report format

No PR, merge or deployment is required. Do not mark production release readiness
from this sprint. Documentation-only commits do not count as delivered features.

Append the final report under the heading below, replacing the placeholder. Include:

- Implementation base and final code commit; branch; ordered meaningful commits.
- Delivered M/C IDs and user journeys, with code references.
- What changed in existing screens/APIs/persistence; any necessary deviations and why.
- Command, exit code, exact test totals, failed/skipped cases, browser/viewport and
  fixture/live mode; screenshot paths; acceptance IDs pass/fail/blocked/not run.
- Outstanding defects and impact; missing credentials/services/device/human checks.
- Deferred scope, including unsupported Google account saving and news gate if absent.
- Privacy/data-quality/safety limitations and actual notification/tracking capabilities.
- Git status, push result and remote SHA verification; explicit no-main/no-production note.

For the report commit, identify the final code SHA directly. A document cannot
contain its own final Git hash without changing that hash: identify the report
commit and final remote SHA in the chat handoff. If push is performed after the
report is written, report the attempt as pending until actually verified; final
chat must state the observed result. Never pre-write a successful push.

## Implementation report

Classification: **Implemented and locally verified, with listed gaps.** Human,
physical-device and live-provider checks were not run. The repository's production
NOT READY verdict is unchanged. Nothing was merged to `main` or deployed.

### Base, branch and commits

- Branch `sprint/mira-companion-48h`. Documentation base `9640f1b`; application base
  `7ac26b3`. The worktree was clean on arrival and no other work existed to preserve.
- Commits, in order:
  1. `594dec3` feat(companion): lead home with outing and local-context actions
  2. `58c7854` fix(companion): enforce evidence and fallback boundaries
  3. `ef5fc6c` fix(companion): make saving and private context predictable
  4. `a2e497e` feat(companion): prioritise sourced context and next actions
  5. `5b6336c` fix(companion): align support and contribution with actual capabilities
  6. `0f0308a` test(companion): follow the follower page's corrected invite wording
     (final code commit)
- Commits 2 and 3 were each type-checked and unit-tested on their own in a temporary
  worktree (931 and 937 unit tests passed).

### Delivered, by outcome

- **M1 Home** (`src/app/(app)/HomeNow.tsx`, `src/components/mira/Situations.tsx`): order
  is purpose, then the ask input ("Ask Mira"), then "Plan an outing" and "Around a
  place". Run/travel presets follow. One row offers an open journey first, then this
  tab's plan, then the latest saved plan. Removed from Home: the first-open
  `LocationAsk`, Help Point ratio stats, the contribution card and the automatic
  local-update digest. The live card appears only after she has chosen location, and
  only below her own job. "I'm with you until you check in" is gone; the row names
  "I'm here" as the real end. "Use my location" inside a flow is now a one-time request
  (`requestLocation`). Only the You → App setting turns location on at every open, and
  an existing affirmative setting is kept.
- **M2 Plan/Around** (`plan/PlanDecision.tsx`, `around/AroundNow.tsx`): the named-place
  path works for a guest without GPS. Around says "Around <place>, not your current
  position" and opens place search in place. When Mira learns the place's time zone,
  "Now" keeps the same instant (`departureForZone`). Before this fix, a phone on UTC
  planning "now" in Delhi was shifted 5½ hours, which caused the baseline
  `v-phase1-core` failure at UTC.
- **M3 short answer** (`src/domain/companion-brief.ts`, `planBrief` in `src/lib/brief.ts`,
  `BriefSummary` in `src/components/mira/Evidence.tsx`):
  - Shows an acknowledgement, at most three qualified items and one limitation line.
    Item order is her constraint, then what the next action needs, then
    time-sensitive context, then one secondary fact. Unknowns stay in the detail.
  - Labels daylight as "Calculated · Solar calculation, not weather or visibility".
    Transit carries "This is a route estimate; I haven't verified services at <time>".
  - Plan: the map sits behind "View map". The action bar has two actions; "Change
    time" and "Ask Mira" sit in the answer. "What Mira checked" keeps every claim.
- **M4 actions**: GoSheet, Trip, sharing and SafetyAccess were not changed. Existing
  consent and foreground-location wording was checked and kept (Trip: "location updates
  are paused" while hidden).
- **M5 continuity**:
  - `src/domain/plan-save.ts` gives the save-eligibility reason before the tap in both
    PlanDecision and PlanScreen. The server guard in `saved-plans.ts` uses the same
    rules and stays authoritative.
  - `queryFor` keeps what she typed (or her saved-place label) as the plan's query, so
    a Google display name is never stored as hers. This covers the main, return and
    stop paths and Around.
  - A remembered travel mode is the default for a new outing; her own choice wins.
  - Help Point exclusions now apply on Home, Plan and Around.
  - A reopened plan whose time has passed asks for a new time.
- **M6 contribution**: Around shows an optional "Correct this information" action after
  the context (`src/components/app/PlaceCorrection.tsx`, existing correction endpoint and
  rules). Contribution moved after the detail. Private reports say "Submitted privately".
- **M7 failure and privacy**:
  - `/api/mira` decides on the server whether a turn is stored
    (`src/server/providers/companion/history.ts`). Turns with a plan, a movement
    sentence (including the first one, sent with `plan: null`), the device location,
    or the validated `ephemeral: true` flag are not stored.
  - Trip cards are never stored.
  - Home, Plan and Around hand-offs set the flag. After the review pass, a conversation
    that becomes private stays private until "New conversation" (see the review pass
    below).
  - Offline saves say nothing was saved.
- **C1/T03**: a new always-on `unsupported_assurance` output check for chat. The first
  pass matched only asserted shapes (place verdicts, "safest route", "no incidents",
  help "on its way", "you're safe with Mira"). The review pass made it default-deny;
  see below.
- **C3**: `companionNewsEligibility` implements 03 §C. Current `SafetyUpdate` data has no
  source-supplied current action or expiry, so automatic news is **absent** from
  summaries by design.
  - The detail says "indexed for this area", "first indexed" and "location as reported".
  - An empty result no longer reads as an absence of incidents.
- **C2/C4/C5**: no live provider is configured, so all runs use the existing OSM pilot,
  community and email paths. Mailpit delivery is simulated.

### Verification, first pass (local container, Node 22.22.0)

These were the results at `0f0308a`. The review pass below supersedes the browser
results.

Environment:
- Local PostGIS and Mailpit via `docker compose` on fresh volumes.
- `mira_test` and `mira_e2e` were confirmed as the test targets.
- `.env.local` was generated once with `npm run env:local` because it was missing. Its
  output was kept out of Git and out of this report.

| Check | Result |
| --- | --- |
| T00 baseline at `9640f1b` | lint 0; typecheck 0; unit 87/87 files, 903/903 (04's two failures did **not** reproduce here); integration 36/36, 200/200; build 0; 8/9 core mobile e2e |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm run test:unit` | exit 0; 90/90 files, 956/956 tests |
| `npm run test:integration` | exit 0; 36/36 files, 201/201 tests |
| `npm run build` / `npm run audit:bundle` | exit 0 / exit 0 (130 files, no secrets) |
| Playwright mobile (Pixel 7), full suite | 68 passed, 2 failed, 1 skipped; plus 4 local screenshot-only tests |
| Playwright desktop (1280×900), full suite | 63 passed, 3 failed, 5 skipped; plus 4 local screenshot-only tests |
| a-share-trip, rerun after the assertion fix | 4/4 passed (mobile and desktop) |

Browser runs used:
- Chromium 1194 at `/opt/pw-browsers/chromium`, via an untracked
  `playwright.local.config.ts`, because the pinned headless shell 1243 is not
  installed here.
- Fixture mode: the deterministic companion, the sourced pilot import, labelled
  sample news and Mailpit. This is simulation, not live or device evidence.

e2e failures in the first pass:
- `o-phase-four-journey.spec.ts:113` (S1 loop start after a permission is granted
  mid-test) failed identically at base `9640f1b` under the full Chromium binary. The
  review pass resolved it as a browser substitution effect (below).
- `f-mobile-extras.spec.ts:76` on desktop reported the installability error
  `in-incognito` under the full Chromium binary. The review pass resolved it the same
  way.
- `a-share-trip.spec.ts:5` asserted the old follower invite wording. It is fixed in
  `0f0308a` and passed on rerun.
- `d-reports.spec.ts:14` failed before `.env.local` existed, because the release CLI
  couldn't validate its env. It passed afterwards.

Screenshots:
- Home, Plan and Around at 320×568 and 390×844 were captured and inspected (dark
  theme, which follows the late-night clock).
- They were taken locally under the session scratchpad and shared in the session
  handoff. They are not committed.

Acceptance IDs (updated after the review pass):

| Result | IDs and evidence |
| --- | --- |
| **Pass** | A01 (`y-companion-entry`; `q-phase-seven-go` guest, 0 geolocation calls) |
| | A04, A08 (`y-companion-flows`, `companion-brief.test.ts`) |
| | A05 (`y-companion-entry`) |
| | A07 (unit transit caveat; `p-phase-five-travel`) |
| | A09, A11 (`companion-news-gate.test.ts`) |
| | A13 (existing `companion.test.ts`) |
| | A16, A21, A22, A23 (existing suites) |
| | A24, A25 (`companion-save.test.ts`; `y-companion-flows`) |
| | A31 (`v2.test.ts`, `audit.test.ts`, `companion-private.test.ts`, `y-companion-flows`) |
| | A32 (`e-privacy`) |
| | A06, A17 (S1 passes under the 1194 headless shell; unit daylight and missing-loop cases) |
| | A35 (full mobile and desktop suites; see the review pass) |
| **Partial** | A03: send-once from Home passes; browser back was not separately exercised. |
| | A12: existing community tests pass; no new surfacing. |
| | A14: scripted only; no live model evaluation. |
| | A15: a headline carrying instructions is withheld by the guard; no new tool-mock test. |
| | A19: Mailpit-simulated delivery only. |
| | A26: mode precedence is tested in e2e; the Help Point exclusion filter has no automated test. |
| | A27: the optional correction, its account requirement and per-place state (A→B delayed and completed) are tested; a durable-account submit was not driven in a browser. |
| | A28: denied-location path tested; no device test. |
| | A29: zone helper and keyed responses are tested; no slow-response browser test. |
| | A33: 320/390 overflow and screenshots checked; 200% text relies on the existing `t-urgent-text-zoom`; keyboard-only was not walked. |
| **Not run** | A02 (no participants) |
| | A10: blocked by data; no `SafetyUpdate` establishes present action, so the gate is always ineligible. |
| | A18, A20 (device) |
| | A30 (offline interception) |
| | A34 (screen reader) |
| | Every live-provider check (L) |

### Deviations, deferred scope and limitations

- Google-backed account saving is still unsupported; it is explained before the
  save. Identifier rehydration is deferred.
- Card places now carry provenance (review pass). Trip **journeys** started from a card
  still record the destination name on the server, as before this sprint; journey
  storage was outside this scope.
- Old chat history is untouched; no bulk deletion was authorised. Signed-in turns sent
  with location are now never stored, so "nearby" questions no longer appear in
  history.
- Automatic news stays out of summaries until the source data can establish present
  relevance. The labelled source browser is unchanged.
- Notifications and tracking are unchanged:
  - Location updates only while the page is visible.
  - Email alerts only with a configured provider (Mailpit locally).
  - WhatsApp is a manual send.
  - No dispatch.
- Stretch scope was not attempted.

### Review pass (correctness fixes on top of `347b822`)

Each issue was reproduced before it was fixed:
- Guard: by the review probes.
- Private mode: by an integration request sequence; the new tests also fail when the
  old route is restored.
- Correction: by the new component tests, which failed first.
- Provenance: by tracing. The old `comparePlace` built a `selected_point` without an
  id, which save eligibility accepts; the "her own map point stays savable" test shows
  that acceptance.

1. **Unsupported assurances bypassed the chat guard** (`112bfe5`).
   - Reproduced: "You'll be safe on this route.", "This street is well-lit and safe."
     and "The route has no safety concerns." returned no issue with
     `checkVerdicts: false`.
   - Chat mode is now default-deny. A verdict word is withheld unless it sits in a
     construction that asserts nothing: a refusal, a question, her own feeling, a
     movement imperative, a condition, or a chat-only wish ("stay safe", "safe
     travels", "safe rehna").
   - "well-lit", "no safety concerns" and "nothing to worry about" were added.
   - The fixed fallback now says what Mira can check and where to see it.
   - A mocked stream proves the rejected text is never sent: one rewrite is tried,
     then the fixed line. Neither list is claimed to be complete. Consequential facts
     still come from deterministic, sourced cards.
2. **Private mode leaked on follow-ups** (`6df6df3`).
   - Reproduced: "I am going to dinner at Hauz Khas." was `not_saved`; "I mean near
     Science Faculty." was `saved` and stored.
   - MiraChat now keeps a conversation private once any turn can't be kept, deciding
     before the first request and also following the server's `not_saved`, until
     "New conversation". The notice says that nothing is saved and that Mira remembers
     it only while the screen is open.
   - The server treats a signed-in request carrying its own context as private.
3. **Private follow-ups lost context** (`6df6df3`).
   - Signed-in private turns now send their own in-memory turns (8 turns, 2,000
     characters each — the existing limits).
   - The server uses those turns only for unsaved replies and reads stored history only
     for saved ones, so unrelated stored chats don't mix in.
   - Integration: neither turn is stored, and the clarification receives the first
     private turn but not the saved chat. Unit: the context reaches the model. e2e:
     the real client flow and the new-conversation boundary.
4. **Correction state crossed places** (`fe276bc`).
   - `PlaceCorrection` renders one form per place identity, so late answers are dropped.
   - Component tests cover A→B during a delayed success and failure, A→B after a
     completed submission, and B→A. All failed before the fix.
5. **Card provenance was lost** (`2dd980a`).
   - Trip, places and Help Point cards now carry `placeId` (never sent to the model).
   - It travels through compare/show, the pending destination, Around, the map,
     SafetyAccess and `planGoingTo`.
   - A card place without an id is marked `x:unknown` and treated like Google content:
     tab-only, scrubbed from session storage, blocked from account saving, and labelled
     "Place you chose" instead of the provider's name.
   - OSM results, saved places and points she picks on the map stay savable.
   - This also fixed an empty query from a Google pick without typed text, which made
     the plan's intent invalid.
6. **Test wait** (`7fc1352`): the new private-flow e2e now waits for Send to be enabled
   before each message (MiraChat correctly ignores a submit while a reply streams).

S1 and installability investigation:
- Both tests pass when Playwright launches the installed **1194 headless shell**
  (`/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`).
- Both fail under the full Chromium 1194 binary used in the first pass. That includes
  S1 at base `9640f1b`, and installability reports `in-incognito`.
- Conclusion: browser substitution, not application behaviour.
- The pinned 1243 headless shell is still not installed, and this environment forbids
  `playwright install`. The runs are therefore against 1194, not the pinned version.

Review-pass verification:
- Full browser suites ran at `2dd980a`, with the 1194 headless shell and the same
  fixture mode as before.
- `7fc1352` changed only the e2e test; after it, the flows spec was rerun on both
  projects.

| Check | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm run test:unit` | exit 0; 92/92 files, 987/987 tests |
| `npm run test:integration` | exit 0; 37/37 files, 204/204 tests |
| `npm run build` / `npm run audit:bundle` | exit 0 / exit 0 (130 files, no secrets) |
| Playwright mobile (Pixel 7), full suite | 70 passed, 1 failed (the private-flow test's own wait, fixed in `7fc1352`), 1 skipped |
| Playwright desktop (1280×900), full suite | 66 passed, 1 failed (the same test), 5 skipped (the specs' own project skips) |
| Rerun after `7fc1352` | the private-flow test passed on mobile and desktop |

Mobile layout:
- The private-conversation notice in Mira and the open correction in Around were
  captured at 320×568 and 390×844 and inspected.
- Nothing overflows horizontally (asserted), and the notice and "New conversation" sit
  above the tab bar without covering the input.
- Screenshots are local and shared in the session handoff, not committed.

Remaining gaps after the review pass:
- No live model evaluation of the guard.
- No real device, screen reader or human comprehension checks.
- No durable-account correction submit in a browser.
- Private-conversation context lives only in the open screen. Leaving Mira ends it,
  which the notice says.

### Git and push

- Pushes went to `refs/heads/sprint/mira-companion-48h` only, without force. The
  remote SHA was compared with `HEAD` after each push.
- The commit that adds this report, and the final remote SHA, are given in the
  session handoff.
- `main` is untouched, and nothing was deployed.
