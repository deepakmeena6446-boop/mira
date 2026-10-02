# Phase 7 coarse outcome events — proposal, collection disabled

The V1 north-star measure is a **useful movement decision**, not an app open. This is a schema for owner/privacy review before any analytics code or vendor is enabled. No event in this proposal is currently sent or stored by the vNext plan flow. The paired S1–S7 research protocol in [27](27_PHASE_7_VALIDATION_PROTOCOL.md) supplies the first outcome evidence.

## Allowed shape

Each event may have only a random per-task token that expires within 24 hours, a day bucket, an enumerated scenario class (`early_local`, `late_return`, `local_destination`, `event_return`, `remote_arrival`, `multi_leg`, `active_change`, `other`) chosen from the user's current explicit task, a surface (`go`, `plan`, `around`, `ask`, `journey`), an enumerated event name, and an enumerated result/failure code. Count totals may be aggregated by day and surface. Do not derive or retain a stable user identifier for this schema.

| Event | Meaning | Allowed result |
|---|---|---|
| `plan_started` | Person made an explicit plan edit or asked a planning question | `structured`, `ask` |
| `option_checked` | Deterministic resolver returned an option state | `mapped`, `manual`, `unknown`, `provider_failed` |
| `action_confirmed` | Server returned a receipt for a chosen journey or change | `start`, `change`, `arrival`, `end` |
| `correction_submitted` | Narrow correction request was accepted | `accepted`, `rejected` |
| `task_abandoned` | Only in an explicitly consented research task, reported by the observer | `left`, `timed_out` |

`action_confirmed` cannot be emitted for a button tap alone; the receipt must exist. `option_checked` does not mean the suggestion was correct or useful. Those outcomes require moderated task scoring, correction review or a user-approved follow-up. Provider errors are counted by class only, without request arguments.

## Prohibited and launch gate

Never include coordinates, route geometry, precise time, query/destination/activity text, chat text, country/area/geohash, contact name/address/token, account/session ID, IP address, raw user agent or a third-party provider response. Do not read a saved plan merely to assign an event class. No advertising identifier, cross-device join or push-triggered routine inference. A daily counter must not expose a single person's movement pattern at low volume.

Before implementation, the privacy owner must approve notice/consent, lawful basis by launch jurisdiction, processor/transfer terms, aggregation threshold, 30-day-or-shorter raw-event retention, deletion and access controls. The research owner must approve whether the event actually measures task success. Test the emitted payload allowlist and absence from server/proxy logs. If those approvals are missing, keep collection off and use only the consented study score sheet. [Privacy contract](16_DATA_AND_PRIVACY_CONTRACT.md), [V1 acceptance](20_ACCEPTANCE_TESTS.md).
