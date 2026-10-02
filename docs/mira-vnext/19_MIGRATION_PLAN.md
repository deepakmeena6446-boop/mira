# Incremental migration from the current product

This plan changes the user journey without a big-bang rewrite. It protects current emergency, sharing, contribution and deletion behaviour while a common plan is introduced. The active working tree already includes unrelated Mira API/provider/test edits; the implementing agent must inspect and preserve them.

## Sequence and reversibility

| Stage | Migration action | Compatibility and rollback |
|---|---|---|
| 0. Baseline | Record current routes, worker health, public-beta gates, data retention, API responses and device behaviour. Add tests for failure states before altering flows. | No user-visible change. If baseline fails, repair or document the pre-existing failure before attributing it to vNext. |
| 1. Shared plan | Introduce a versioned intent/plan representation and an adapter from current Around/Mira/trip entry points. Keep it ephemeral by default. | Existing routes remain functional. Turn off new plan entry if it drops intent or exposes location. |
| 2. Evidence/options | Add deterministic evidence eligibility and feasible comparison with explicit unknowns. Use existing route providers and reviewed country data. | Current place brief and route result remain available. A provider failure degrades to labelled partial/manual plan. |
| 3. Ask/action | Move Ask Mira onto the shared plan, with proposal/confirmation/receipt semantics. Preserve current signed-in chat until guest-mode privacy/rate limits are ready. | Legacy chat entry remains; fail closed to deterministic planning/support on model failure. |
| 4. Journey/adaptation | Attach a chosen plan to current trip flow; add change and discomfort actions. Preserve the worker's missed check-in, sharing, closure and purge until replacements pass parity. | Feature flag route-adaptation controls. Existing trip start/end/share path stays available. |
| 5. Entry/IA | Promote Go as primary and move map/Ask/contribution into journey context; preserve old URLs and notification links. | Flag restores current Today/Around/Mira tabs if task success or critical path regresses. |
| 6. Enrichment | Add only eligible community/local-development claims and per-claim coverage labels. | Source-class flag disables enrichment without breaking baseline plans. |
| 7. Release | Run scenario, accessibility, device, privacy, operations and external comparison gates. | No claim of global verified safety; keep public beta gate separate. |

## Data transition rules

- **No automatic intent archive.** A future journey request is transient until the user explicitly saves it. Schema additions are additive, with bounded retention and deletion before collection starts. Never store a free-text destination in analytics.
- **Existing habits require a consent transition.** Current migration `0012` has `remember_habits=true` by default. Set *new* collection/use to off by default, audit actual historical records and usage, and ask existing users before old habit data influences guidance. A declined decision stops inference; previously stored data follows a clear deletion/retention choice. Do not silently erase a preference or pretend an old default was consent.
- **Local implementation of that transition:** forward migration `0020` copies the prior setting to `legacy_remember_habits`, pauses all learning/suggestions, changes the default to false, and retains old summaries for review under the existing 400-day purge. An explicit preference PATCH records the review time; off deletes summaries. Run a staging pre/post count and verify the account notice before production migration. Do not run `0020` as an ad hoc SQL update.
- **Explicit saved plans:** forward migration `0021` adds owner-scoped encrypted plan payloads with a 30-day expiry and account cascade. The worker purges expired rows; Journeys permits open/delete. No old tab plans are imported. Rehearse save/delete/expiry and backup restore on staging; rollback the Go entry flag rather than deleting the table or restoring an old habit default.
- **Current trip data stays short lived.** Keep present active point cap, close/purge rules and per-recipient tokens unless a separately reviewed migration improves them. Moving a plan into a trip does not authorize a permanent route trace.
- **Current private reports remain private.** Do not bulk-convert narratives into public observations. Any derived community claim must pass the eligibility and release policy in [09](09_COMMUNITY_DATA_LOOP.md).
- **Provider data has licence boundaries.** Check storage/display rights before saving place hours, route geometry or review-derived facts. Store provenance/expiry rather than indefinite copied content.

## Route, API and operations compatibility

Do not delete `/around`, `/around/map`, `/mira`, `/contribute`, `/report`, `/trips`, `/trip`, `/circle`, token share, admin, or notification targets merely because a new screen exists. Compatibility adapters must preserve explicit origin, destination, selected trip and return navigation. A redirect is permitted only after deep-link tests. Version changed API payloads or maintain old clients until migration evidence permits removal. Existing `/api/mira` NDJSON streaming, safety output filter, daily limit and urgent card path need equivalent behaviour through the transition.

Any worker or migration change must include deploy/rollback notes, retention verification and an operator health check. Do not remove generated country coverage documentation; regenerate it from the registry if underlying country data changes. Follow [17](17_TECHNICAL_CHANGE_MAP.md) for affected files and [20](20_ACCEPTANCE_TESTS.md) for gates.
