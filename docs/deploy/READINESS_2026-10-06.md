# MIRA deployment preparation — 2026-10-06

**Status: application checks pass; production deployment is blocked by unresolved security, account, infrastructure and acceptance gates. No deployment was performed in this preparation session.**

Approved source remains `a2c853e34c06314238effb1fe442b4e89287fccb` on `origin/main`. The clean release checkout is `/tmp/mira-deploy`; documentation is on `deploy/a2c853e-docs` in `/tmp/mira-deploy-docs`. The original working directory contains separate local work and was not changed. Do not upload the docs checkout as the approved application revision.

## Verified evidence

| Check | Observed result on October 6 |
|---|---|
| Source | Fetch confirmed origin/main is the exact approved SHA; release checkout was clean |
| Dependency installation | `npm ci` passed |
| Lint / types | `npm run lint` and `npm run typecheck` passed |
| Unit tests | 873/873 across 87 files passed with localhost access. The sandbox-only first attempt returned EPERM in the database-wait test; no test was weakened |
| Production build | Next.js 16.3.6 Webpack build and worker/migrator/pilot-import bundles passed |
| Client secret audit | `npm run audit:bundle` passed: 130 files, 10 patterns |
| GitHub CI | [Run 37490651058](https://github.com/deepakmeena6446-boop/mira/actions/runs/37490651058) did not start its job: “The job was not started because your account is locked due to a billing issue.” This is not a green CI result |
| Existing staging | All three services online, one running replica each; no recent failures or staged/applying work reported |
| Staging HTTP | `/api/health/live` 200; `/api/health/ready` ready; `/` 200 with HSTS/CSP; `/offline.js` 200 |
| Web settings | Expected build/start/pre-deploy/healthcheck settings; one replica |
| Worker settings | Expected build/start. Active deployment manifest is ON_FAILURE with 10 retries, not required ALWAYS |
| Worker references | All 15 non-email entries in `.railway/railway.ts`'s fromWeb list match web references; email names remain absent |
| PostGIS | Correct image, private network enabled, volume mounted at `/var/lib/postgresql/data`, no public TCP proxy |
| Production | Empty: no services, volumes, buckets, shared variables or staged changes |

Integration and E2E were not rerun here. The owner's earlier 1,073 unit/integration and 126 Playwright result remains supplied evidence on the original commit; it cannot certify a future dependency candidate. No database reset, migration, service restart, account upgrade or real notification was performed.

## Existing deployed revision and migrations

Staging URL: https://mira-beta.up.railway.app.

- Web deployment `32abe255-4371-43bb-87a0-173d8a075e82`, successful October 4.
- Worker deployment `150297d4-d046-48a5-935a-661877cc29f9`, successful October 4; `worker.started` confirmed in the historical startup attributes.
- Historical web pre-deploy output re-read this session: `2026-10-04T14:57:59.314116818Z Migrations applied.` The release journal ends at 0026, 0027 and 0028. The migrator does not print each individual migration; no database journal query was performed here.
- Upload provenance and earlier backup/provider decisions are in [the October 4 staging record](STAGING_RESULT_2026-10-04.md). No new revision was uploaded today.

The only distinct startup `config.warning` in the inspected web/worker startup window is:

> No email provider (RESEND_API_KEY + EMAIL_FROM, or SMTP_*): contact invites, missed-arrival emails and email sign-in are OFF; WhatsApp contacts and share links still work.

No EnvValidationError appeared in that startup window. A filtered current log query returned no matching entries; that does not prove the absence of errors outside the inspected windows. Public readiness does not expose the moderator-only Claude, heartbeat age or email-provider detail.

## Blockers and concrete resolution

### 1. Dependency security: original commit and reviewed candidate

The fresh npm audit reports **11 affected package entries: 7 high, 4 moderate, 0 critical**. These entries include transitive chains and are not 11 distinct exploits. This table records the original a2c853e audit. Its packages were not changed in that clean checkout because the owner originally required the exact SHA and no application changes. The owner subsequently approved preparing a separate dependency candidate, without deployment: [draft PR #2](https://github.com/deepakmeena6446-boop/mira/pull/2), branch codex/deployment-security, dependency commit 7d0ef7d8146a1a0cae3761f3f9580226f2e65be6. It patches sharp/source-map-js and removes unused drizzle-kit; production-only audit is now zero, with the unpatched braces development chain still present. Validation and remaining release holds are recorded in docs/deploy/DEPENDENCY_CANDIDATE_2026-10-06.md on that candidate branch. This does not change the commit currently running in staging.

| Root advisory | Installed dependency | Exposure assessment / next action |
|---|---|---|
| [sharp / librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | sharp 0.35.4 through Next.js, optional runtime dependency | Advisory recommends 0.35.5. Runtime-specific SVG decoding conditions can be serious on Linux. No next/image use or remote-image configuration was found in app source, but that is not a complete production reachability proof. Prepare the patched dependency on a separate candidate branch if approved |
| [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | 1.2.1 through PostCSS and build/test tools; also a production dependency path through Next.js | Patched in 1.2.2. Attacker-controlled indexed source maps can block the event loop. No application ingestion of untrusted source maps was found; patch and recheck the lockfile rather than treating this as cleared |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 3.0.3 through eslint-config-next → fast-glob → micromatch | Development/lint dependency chain. Deeply nested patterns can exhaust the stack. The advisory lists no patched version; review exposure and an upstream fix. Do not accept npm's unrelated Next.js 14 downgrade as a safe automatic fix |
| [esbuild development-server advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | 0.18.20 under drizzle-kit → deprecated esbuild-kit loader | Development tool chain. MIRA starts Next.js and a bundled worker, not this esbuild development server. Retain the finding for review; investigate a supported tooling update without downgrading drizzle-kit automatically |

A dependency change produces a new SHA. Before that candidate can replace a2c853e: fresh install, lint, types, unit/integration/E2E, production build, bundle audit, clean-SHA CI and staging acceptance are required. Staging would need a later separately authorized deployment of the candidate before production promotion. Neither the original release nor a changed candidate is marked security-approved here.

### 2. GitHub billing lock: owner action

Sign in as the repository/account owner. Open **GitHub → Settings → Billing and licensing**, identify and resolve the account's billing lock. Review any charge before accepting it; the agent will not change payment settings. If the account is managed by an organisation, its billing owner must resolve the lock.

After GitHub confirms the account is unlocked, rerun the selected candidate check (this run was blocked by the same billing annotation):

```bash
gh run rerun 37490651058 --repo deepakmeena6446-boop/mira --failed
gh run watch 37490651058 --repo deepakmeena6446-boop/mira --exit-status
```

Do not execute that rerun while preparation-only/no-cost instructions are still in effect without owner clearance. Verify CI on the final reviewed candidate SHA, including any later commit; this command refers to the dependency commit run. Clearing billing alone is not proof the code checks passed.

### 3. Railway restart reliability and backups: owner action

The current worker manifest remains ON_FAILURE ×10. [Railway's restart policy documentation](https://docs.railway.com/deployments/restart-policy), re-read October 6, confirms Free/Trial cannot use ALWAYS. A paid plan supports it; no code edit can unlock a platform feature. The prior record reports Trial and backups unavailable without Pro; current plan entitlement and backup availability were not re-inspected in the dashboard today.

Owner: inspect **Railway → workspace billing/plan** and **Mira → staging → postgis → Backups**. Confirm a plan that supports both the required restart policy and the selected backup mechanism, then explicitly approve any cost. No plan or settings were changed here.

For a later approved configuration/deployment, set worker ALWAYS and web ON_FAILURE ×10 using the corrected guide. Inspect the active deployment manifest after it settles: the configuration API previously appeared to accept ALWAYS while the live deployment fell back to ON_FAILURE.

For the ≤30-day retention policy, select **Daily** (currently 6 days), optionally **Weekly** (27 days), and leave **Monthly** disabled (89 days). [Railway backup schedule](https://docs.railway.com/volumes/backups). A new staging backup is needed before any future migration. The October 4 encrypted local archive validation is historical evidence; it is neither a fresh backup nor a completed restore rehearsal. Recovery/rollback rehearsal remains pending and must happen in staging under separate approval.

### 4. Provider identity and production setup: owner action

The October 4 owner decision left email off and retained the shared Podium Google key with 35 APIs. Do not silently change this existing staging key: it is also shared with local configuration. Before public launch:

1. Google Cloud → selected project → APIs & Services: enable **Places API (New), Routes API, Geocoding API, Time Zone API and Map Tiles API**. Set quotas and a budget alert.
2. Credentials: prepare a separate server key restricted to the first four APIs, and a browser key restricted to **Map Tiles API** plus HTTP referrer `https://<final-domain>/*`. Do not add Railway egress IP restrictions without verified static IPs and cost approval.
3. OAuth web client: JavaScript origin `https://<final-domain>`; redirect `https://<final-domain>/api/auth/google/callback`. Staging keeps its own registered origin/redirect.
4. Anthropic console → organisation limits: confirm the monthly spend limit. The earlier record observed an existing limit; it was not rechecked today. Leave MIRA_MODEL unset; default is claude-sonnet-5-5. Guests consume Claude budget (25 replies per network/day).
5. Decide the production domain and optional email. If enabling email, Resend → Domains: verify the sending subdomain's displayed SPF/DKIM and DMARC records. The owner sets the API key directly through `railway variable set RESEND_API_KEY --stdin --service web --environment <environment> --skip-deploys`, never in chat. Set EMAIL_FROM and worker references only when both web email variables are ready.

Production secrets must be new. Keep an offline copy of DATA_ENCRYPTION_KEY; losing it makes contact emails and private report text unreadable. Never rotate it in place. No production services, domain or credentials were created in this session.

### 5. Moderator and real phones: owner action

Existing staging is available for acceptance without a new deploy. Sign in at https://mira-beta.up.railway.app/admin/login and open `/api/health/ready` in the same browser. Report `mira: claude`, worker heartbeat age under 60 seconds, and `contactEmailProvider: none` while email is off. Do not send passwords, tokens or keys.

Run [the corrected smoke test](../../PRODUCTION_SMOKE_TEST.md) with an iPhone Safari traveller and Android/other-browser follower, using only the owner's own inbox/phones. Supply the test date, phone/browser versions and pass/fail for every step. Never share live links or coordinates in chat.

All 16 physical-phone steps remain **pending**: Home/location/Report, country/dialler, route evidence, Help Point, Google sign-in, Circle, journey/WhatsApp, follower dot/rough Home, arrival/expiry, unsafe sheet/urgent Mira, Emergency, guest/signed-in Claude, contribution, missed check-in/ended link, sign-out, and offline call buttons. Email steps are unavailable while email is off, not passed. Desktop HTTP checks do not substitute for these results.

Before public traffic, complete [all public beta gates](../PUBLIC_BETA_RELEASE.md): live-provider evidence, historical-receipt checks, support/security contact, named primary and backup responders, staffed moderation, policy review, uptime monitor and staging outage/restore/rollback rehearsal.

## Preparation fixes made

Deployment docs now use the installed CLI's actual syntax: `volume add` takes a linked service rather than `--service`; `domain`, `add` and `status` use the linked environment rather than unsupported `--environment` flags. The guide explicitly verifies the project/environment first, uses explicit production targeting where supported, reuses the existing project and keeps the owner approval gates. The PostGIS creation sequence now configures an empty service with its fresh password and volume before attaching the bootable image, removing the first-boot race. Backup schedule guidance now excludes 89-day Monthly retention.

The earlier docs branch already corrects the model, Time Zone API, guest spend, optional email and 16-step smoke flow. This preparation adds current evidence and blockers; it does not convert pending results into passes.

## Hold and rollback

Do not run railway up, accept-deploy, redeploy, restart, service creation, custom-domain attachment, migrations or pilot import during this preparation-only request. Leave the clean approved checkout available for a later authorised action.

If a later release fails: Dashboard → web → Deployments → previous → Rollback, then worker. The original release migrations are additive, so prior compatible code runs on the newer schema. Do not reset or drop the database. A restore changes data and needs a separate recorded recovery decision.
