# Phase 7 validation protocol — prepared, not executed

This protocol applies to the new Go/Journeys/You entry and the seven scenarios in [20](20_ACCEPTANCE_TESTS.md). It is a proposed study gate, not evidence that people completed the tasks. A research owner must approve recruitment, consent, comparison tools and thresholds before a session. No participant movement, contact, account or live link belongs in this repository.

## Paired task comparison

- Recruit adult women with varied local familiarity and mobility needs. Include people who use screen readers or keyboard navigation if available. Do not ask a participant to enact a real emergency or share a real journey.
- Give each person the same scripted S1–S7 planning tasks in two counterbalanced conditions: Mira and current Maps plus a general AI assistant. Use synthetic names, places and times. Each condition gets the same available facts and time budget.
- Record the first actionably grounded choice, time to first useful option, explicit unknowns noticed, factual correction count, false assurance, task abandonment, perceived control and unwanted anxiety. Two reviewers independently score the choice against the [20](20_ACCEPTANCE_TESTS.md) rubric without seeing which interface produced it; adjudicate disagreements before unblinding.
- Proposed pre-registered success rule for owner review: Mira improves the paired share of defensible choices by at least 15 percentage points, does not increase the false-assurance rate, and has no critical privacy, emergency or contact-consent finding. Do not revise the threshold after seeing results. A small exploratory run can reveal issues but cannot establish a launch claim by itself.
- Stop immediately for an incorrect emergency number, unexpected contact notice, raw movement disclosure, unsupported operating-service assurance or a participant who wishes to stop. Log the exact observed screen state and disable the affected path for review.

## Operational evidence still required

| Gate | Required owner evidence | Current state |
|---|---|---|
| Real device | iOS Safari/PWA and Android Chrome/PWA active, hidden, locked, wake/resume, battery, dialler, contact view | User skipped physical phones for this build session; no pass claim |
| Provider and worker outage | Staging source quota/no-route, malformed/stale data, delayed worker heartbeat, Mailpit/provider failure, rollback and recovery receipts | Local fixtures only |
| Accessibility | Keyboard order/focus, screen reader labels and announcements, 375 px layout, text alternative for map, urgent action in every state | Automated browser checks only; manual audit open |
| Privacy and security | Independent plan/chat/link/log/third-party review, pen test, age and public policy review | Internal tests only |
| Outcome events | Approve the allowlist, notice, retention and low-volume aggregation in [28](28_PHASE_7_EVENT_SCHEMA.md) before collection | Proposal only; collection disabled |
| Comparative study | Approved recruitment, consent, paired score sheet and threshold, signed result | Not run |
| Public beta | Every gate in [public beta release checklist](../PUBLIC_BETA_RELEASE.md), production smoke, staffed operations | Not ready; no deployment authorized by build plan |

Keep [D23](22_DECISION_LOG.md) separate from release evidence: the instruction to skip physical phones authorizes continuing local work and does not make a device result true. Phase 6 community enrichment remains disabled under [09](09_COMMUNITY_DATA_LOOP.md).

## Local candidate evidence and staging checks (2026-10-02)

The local Phase 7 candidate passed 841 unit/integration tests across 78 files, a production web and worker build, 81 full-suite browser tests with seven intentional skips, four focused Go/saved-plan browser cases, and two legacy-entry rollback cases. These are engineering checks, not observed participant outcomes. The first focused saved-plan run failed only because an existing `newUser` test helper expected the full account name on a root screen that now displays a first-name greeting; the test used a one-word name and the rerun passed on both profiles.

The later Phase 0–7 closeout audit added a manual check-in-only start for an unmapped walking loop and an explicit return-leg selection. Its final local suite passed 843 unit/integration tests and 87 production browser tests with seven intentional skips; a rebuilt start-flow check passed 6/6. [The scenario record](20_ACCEPTANCE_TESTS.md#phase-07-closeout-audit--known-risk-2026-10-02) distinguishes this from S1/S4 participant evidence. Before scoring S1, observe whether guests understand that planning needs neither account nor GPS, while an actual live journey currently asks for sign-in and a fresh position. Do not treat browser permission emulation as a real-device or research result.

Before any staging rehearsal, record counts of accounts with the old `remember_habits` value and `journey_habits` rows. Apply `0020–0021` through the normal migrator and verify: all accounts have learning off; the old value remains in `legacy_remember_habits`; old rows remain reviewable but produce no suggestion or new count; new accounts default off; an explicit opt-in records `habit_choice_reviewed_at`; off deletes rows. Check saved-plan ciphertext, owner-only list/delete, 30-day worker purge and account cascade, then restore a staging backup. The current local integration fixtures cover the behaviour but do not replace this rehearsal or independent review.
