# Public beta incident response

Complete the owner, backup responder, contact channel, monitor URL and escalation time in the private release record before launch. The monitor must check the production `/api/health/ready` endpoint every 1–5 minutes and page both responders on a sustained non-200. Railway's deployment healthcheck is not continuous monitoring. Keep a separate staging monitor and rehearse the actions below there.

## First five minutes

1. Acknowledge the page and record UTC start time, affected environment, failing endpoint, and last successful deployment SHA. Open `railway logs --service web` and `railway logs --service worker`; do not paste live share or invite tokens into an incident ticket.
2. Check `/api/health/live` and `/api/health/ready`. A live 200 with ready 503 usually means a database or worker problem. Check the Railway database, worker and web deployment status and the latest backup. If both endpoints fail, check the web deployment and domain first.
3. Pause public signup or traffic at the edge if the app is serving misleading trip, alert, or emergency information. Keep the incident record current. Confirm resolution with a real trip/contact flow, not only a green health endpoint.

## Failure playbooks

| Failure | Immediate action | Recovery proof |
|---|---|---|
| Worker stopped or heartbeat stale | Check worker logs for `worker.watchdog_exit`, `journey.failed` and migration errors. Restart or roll back the worker to the last compatible tested SHA. Do not start new trips while readiness is 503. Inspect overdue journeys and notification attempts before clearing the incident. | Worker pass fresh, readiness 200, one staged overdue trip produces exactly one contact alert. |
| PostGIS unavailable or data corrupt | Stop write traffic. Check Railway volume and database logs; use the most recent tested backup only after recording the recovery point and expected data loss. Restore to staging first when time allows. Keep the private database endpoint private. | Migrations/schema, trip reads and writes, worker pass, and backup age verified. |
| Resend failure or uncertain delivery | Check `mail.send_failed`, provider status and rate limits. Do not claim an alert was sent for an unconfirmed response. Fix the domain/key/quota or use the previously tested rollback. Inspect idempotency keys and retry records so a contact is not alerted twice. | Invitation and overdue alert reach real inboxes; the overdue test sends exactly once. |
| Google Maps, Mapillary or lighting source failure | Check quota, billing, key restrictions and provider status. Preserve the UI's failed/unknown evidence state; do not describe a failed lookup as no nearby help or no mapped lighting. Restore the verified provider or disable the affected claim until it is retested. | Search, route, tile, hours, Help Points and lighting tests pass in the affected region. |
| Google sign-in failure | Check the exact redirect URI, OAuth client status and session errors. Preserve existing signed-in sessions while fixing the provider. Verify demo-to-account transition and a returning account separately. | Real sign-in and account transition pass on production. |
| Claude or Web Push failure | Check key validity, quotas and delivery logs. State that assistance or notification is unavailable when it is; never imply a message was delivered without provider acceptance. | Live adversarial chat and push received on a subscribed physical device. |
| Bad release | Roll back web and worker to the last tested compatible SHA. Migrations are forward-only; confirm old code tolerates the applied schema. Restore a backup only when rollback cannot safely recover data. | Smoke tests, worker pass and readiness 200 on the restored SHA. |

## Phase 4 journey and consent checks (local implementation; release gate open)

Before enabling the plan-linked journey path outside a local test, verify on real iOS and Android browsers: screen visible, hidden/locked, resumed, wake-lock denied/granted, battery use and the displayed fix/upload age. A browser emulator is only a regression test. Confirm that an omitted `share` field creates no `trip_contacts` rows, “Just me” is selected initially, an explicit Circle selection shows the exact recipients, and a destination change keeps the same token/recipient set without new mail. Exercise one missed check-in, close, token grace and six-hour purge against a healthy worker. The local gate is recorded in [vNext acceptance tests](mira-vnext/20_ACCEPTANCE_TESTS.md).

For a bad Go entry release, build the last tested code with `NEXT_PUBLIC_MIRA_GO_ENTRY=legacy` and verify `/` shows Today plus the old five tabs; preserve `/today`, `/plan`, `/trips`, trip links and Emergency. This flag changes the entry hierarchy only. Migrations `0020–0021` are forward-only: do not revert habit consent or delete saved-plan ciphertext during a UI rollback. Check owner-scoped saved-plan list/delete and the retention worker after a rollback, then record the tested SHA and readiness result. The local entry-rollback flag test is in [vNext acceptance](mira-vnext/20_ACCEPTANCE_TESTS.md); staging rollback and backup restore remain untested.

If active journey text implies fresh tracking after the screen is hidden, or sharing/ETA changes reach an unchosen contact, stop new journey starts and roll back the web/worker pair to the last tested compatible revision. Preserve existing open-trip close and Emergency actions while triaging. Check `/api/health/ready`, worker heartbeat and journey logs; inspect only trip IDs and counts in operational records, never bearer links or coordinates. A failed OSM route review must leave the existing ETA unchanged and show a manual/external map fallback. Recovery proof includes the same phone hidden/resume task and a private-to-shared consent test, not only health 200.

## After recovery

Record the detection time, affected users and trips, alert-delivery status, root cause, data impact, recovery time and corrective owner. Review logs without exporting personal data or bearer-link tokens. Test the monitor and the relevant playbook in staging after each material change. Do not reopen public signup until the failed release gate has new evidence.
