# Public worldwide beta release gate

**Verdict today: NOT READY FOR DEPLOYMENT AND LAUNCH.** Local checks cannot substitute for live providers, a production domain, real devices, public policy review, staffed moderation, backup restore and monitored operations. Update the evidence table below before changing this verdict. The audience is adults 18 or older; global access does not promise local emergency-number or map-evidence coverage in every country.

**2026-10-03 local vNext update:** Go/Journeys/You, signed-in and guest ephemeral movement Ask, explicit encrypted saved plans, the habit opt-in transition, private guest timer, manual loop check-in and return-leg review are in the local code. [Scenario evidence and limits](mira-vnext/20_ACCEPTANCE_TESTS.md) distinguish implementation from full acceptance. The local development database has migrations `0020–0022`; staging/production have not been migrated. Phase 6 plan-linked community/news claims remain disabled. The user skipped physical-phone checks for the earlier build session, so no phone gate passed. Independent accessibility, privacy/security, live-provider and worker-outage evidence is still missing. External-user recruitment is not a build or launch gate. This verdict is unchanged.

## Release contract

- Keep the web, worker and private PostGIS services together on Railway. Use one tested Git revision for staging and production; do not upload an uncommitted or dirty tree. Set `PUBLIC_BETA_STRICT=on` on web and `PUBLIC_AGGREGATE_RELEASES=off` on web and worker.
- The production URL is an owner-controlled HTTPS domain. Google OAuth redirect, Resend sender, Web Push subject and `APP_BASE_URL` must use the final production identity; staging gets separate values and database secrets.
- Live Google Maps (search, routes, tiles and hours), Google sign-in, Claude, Web Push, and Mapillary must be configured. Resend is optional: trusted contacts get the live link on WhatsApp from her phone; email adds invites and the automatic missed-arrival alert. A present key is only a configuration check: a live successful flow is required for each. Missing, empty, failed and partial evidence must remain distinct on screen.
- MIRA never makes a safety verdict or promises delivery before the provider confirms acceptance. For a country without a reviewed profile, the local emergency number stays unknown. Reports stay private while publication is off.
- All 195 sovereign states are in the country registry, but only reviewed profiles carry numbers ([coverage report](COUNTRY_COVERAGE.md)). Never claim "verified emergency coverage in 195 countries". The accurate statement is: *MIRA recognises every country globally and uses reviewed local emergency information where available. Local evidence coverage varies by source and area.*
- Safety updates ([design](SAFETY_UPDATES.md)) are sourced context, never a rating. A provider failure must read "couldn't check", never "no incidents". News and community reports stay separate; community summaries stay off.

## Release sequence and evidence

| Gate | Required evidence | Status |
|---|---|---|
| Source | Reviewed diff; coherent commit; `git status --short` empty; CI green on that SHA | Pending |
| Automated checks | `npm run check`, browser suite, `npm run build`, `npm run audit:bundle` pass; only intentional cross-project Playwright skips | Current checkout: `npm run check` passed 852 unit/integration tests plus lint/typecheck. Webpack production and worker builds passed; the 2026-10-03 continuation reports 95/95 active browser cases with seven intentional skips, and a subsequent affected-suite rerun passed 18/18. The client-bundle scan passed 122 files after a successful Webpack build. The literal `npm run build` Turbopack command still fails on this host while spawning a CSS loader (`binding to a port: EPERM`); whether CI/deployment has the same issue is unverified. No clean-SHA CI, staging or live pass exists. |
| Historical receipts | On a production-like database, capture the counts below, apply migration 0016, and show that old place/correction rows remain but are marked and excluded from current impact and Steward; new rows remain eligible | Pending staging |
| Staging | Separate Railway staging environment, PostGIS volume, secrets and URL; migration, web and worker healthy; `/api/health/ready` is 200 after worker pass | Pending owner credentials |
| Providers | Restricted Google keys and quota/budget alerts; verified Resend domain and real inbox delivery; Google OAuth; Claude; Mapillary; Web Push. Save dated test results, not keys | Pending owner credentials |
| Core trip | On live staging, accepted-contact invite, walk, moving shared dot on another phone, auto/manual arrival, link revocation, overdue check-in and exactly one real missed-arrival email; confirm failed/unconfirmed states | Pending live test |
| Worldwide | Test coordinates and route/share flows in India, Japan, Nigeria, France and Brazil, plus an unknown-profile country. Show local number only where reviewed; show truthful provider gaps; use a manual ETA where a route is unavailable | Pending live test |
| Country coverage | `scripts/country-coverage.ts --check` passes; release copy uses the accurate statement above; spot-check Emergency options in one VERIFIED, one PARTIALLY_VERIFIED, one REGION_DEPENDENT and one unverified country | Local: 195/195 represented (49 verified, 9 partial, 2 region-dependent, 135 not yet verified); UI checked for IN, KE, PE. Live pending |
| Safety updates | From production egress: GDELT answers within its rate limit, a failure renders "couldn't check", classifier calls succeed and stay within the daily token ceiling; confirm no coordinates in logs | Local: pipeline, cache, failure states and 228 classification cases pass; one live GDELT response captured. Production egress pending |
| Phones | Real iPhone Safari and installed PWA, Android Chrome and installed PWA, and a separate contact phone; permission denial, background/resume, push where supported, dialer, 375 px route/evidence/help/arrival screens | Pending real devices |
| Security and policy | Review privacy, terms, third-party transfers, retention and age rule for the intended jurisdictions; publish the operator's support/security contact; verify link-token exposure and admin access | Pending owner review |
| Operations | Named primary and backup responder, staffed report queue, external monitor on `/api/health/ready` with phone alert, tested staging outage/restore/rollback using [the incident response guide](INCIDENT_RESPONSE.md), daily database backups with retention ≤ 30 days | Pending owner setup |
| Production | Promote the tested SHA, confirm same settings and a healthy worker, repeat the real inbox/core trip smoke test, watch logs and monitor during a controlled public opening | Pending all earlier gates |

For the migration rehearsal, query the same database immediately before and after applying 0016. The first query should be read-only; the migration must be applied by the normal migrator, not by an ad hoc update:

```sql
SELECT kind, status, count(*) AS rows, count(*) FILTER (WHERE counted) AS originally_counted
FROM contribution_receipts WHERE kind IN ('place_status', 'correction') AND claim_key IS NULL
GROUP BY kind, status ORDER BY kind, status;

SELECT kind, status, count(*) AS archived_rows, count(*) FILTER (WHERE counted) AS historically_counted
FROM contribution_receipts WHERE legacy_unverifiable
GROUP BY kind, status ORDER BY kind, status;
```

The archived records retain their original decision for audit until normal retention. The impact and Steward queries exclude them. Do not use the second query before migration 0016 exists.

## Owner inputs and launch record

Record the production domain, public support/security contact, provider account owners, billing/quota limits, moderator and backup responder, backup schedule, legal/policy reviewer, staging URL, production URL, tested Git SHA, test date and actual results in an owner-held release record. Never put provider secrets or live trip links in the repository, CI logs or this document. The Railway project has not been linked to this repository; see [DEPLOY.md](DEPLOY.md).

**Verdict rule:** Change the heading to `READY FOR DEPLOYMENT AND LAUNCH` only when every table gate is marked pass with evidence, no critical product issue remains open, and the production smoke test succeeds. Any failure or missing evidence keeps `NOT READY` with an owner and next action. A successful build or deployed service alone is not a Ready verdict.
