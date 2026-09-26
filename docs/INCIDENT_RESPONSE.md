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

## After recovery

Record the detection time, affected users and trips, alert-delivery status, root cause, data impact, recovery time and corrective owner. Review logs without exporting personal data or bearer-link tokens. Test the monitor and the relevant playbook in staging after each material change. Do not reopen public signup until the failed release gate has new evidence.
