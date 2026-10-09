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

Not started. This package is documentation preparation only; no application
features have been changed. The preparation verification baseline is in 04.
