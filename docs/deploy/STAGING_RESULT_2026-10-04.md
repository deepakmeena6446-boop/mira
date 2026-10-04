# Staging deployment record — 2026-10-04

**Status: preflight passed; deployment and phone smoke test pending.**

Target commit: `a2c853e34c06314238effb1fe442b4e89287fccb`.
Staging URL: https://mira-beta.up.railway.app.
Date uses the owner's Asia/Kolkata time zone. No application code was changed.

## Source and local checks

- `git fetch origin` confirmed `origin/main` is the exact target commit.
- Clean deployment checkout: `/tmp/mira-deploy`, detached at the target commit; `git status --short` empty after checks.
- `npm ci`, `npm run lint`, `npm run typecheck`: pass.
- `npm run test:unit`: 873/873 pass, 87/87 files. The first sandbox run returned `EPERM` for the localhost migration-wait test; rerunning with local network access returned the expected connection refusal and passed.
- `npm run build`: Next.js 16.3.6 Webpack production build and worker/migrator/import bundles pass.
- Integration/E2E were not rerun in this deployment session. The owner's prior result in the deployment prompt is separate evidence.

## Railway inspection and saved configuration

Project `Mira`: `29b72709-5ec7-45d8-afa9-a99b43bdfe20`.
Staging environment: `ea7f1599-1f8a-497f-815b-aaaff161d0bf`.
Production is empty; no production services were created.

- Existing staging web, worker and PostGIS deployments are online. Web/worker deployment timestamps are 2026-10-01; this session has not deployed the target commit.
- Web: desired build/start commands, pre-deploy `node dist/migrate.mjs`, liveness path, 120-second healthcheck and active ON_FAILURE ×10 policy verified; one replica.
- Worker: desired build/start commands verified. Restart configuration corrected from the default ON_FAILURE to ALWAYS; applies on the next deployment.
- Worker `APP_BASE_URL` corrected to reference web, and `GOOGLE_MAX_CALLS_PER_MIN` added by reference. All non-email entries in `.railway/railway.ts`'s `fromWeb` subset now reference web.
- Added web fallback URLs for Photon, Nominatim and OpenFreeMap with `--skip-deploys`.
- Saved ceilings with `--skip-deploys`: Google 300/min and 10000/day, Mira 1500/day.
- `PUBLIC_BETA_STRICT=on`, `PUBLIC_AGGREGATE_RELEASES=off`, expected NODE_ENV/PORT/client-IP settings, `MIRA_MODEL` unset and absence of forbidden SMTP/demo/fixture settings confirmed without printing secrets.
- No PostGIS public TCP proxy. Volume `postgis-volume` is mounted at `/var/lib/postgresql/data`.
- Owner chose to leave email off. `RESEND_API_KEY` and `EMAIL_FROM` remain unset on web/worker. Invites and automatic missed-check-in emails are unavailable; WhatsApp sharing requires the traveller to press Send.

## Existing deployment HTTP checks

| Check | Observed result |
|---|---|
| `/api/health/live` | 200 |
| `/api/health/ready` | 200, status ready |
| `/` | 200 |
| HSTS and CSP on `/` | Both present |
| `/offline.js` | 404 on the old deployment; must be 200 after deploying the target commit |

These checks describe the existing deployment, not acceptance of the target commit.

## Blocking owner decisions and provider checks

- Chrome Railway dashboard: current plan is Trial. Staging PostGIS has **No Backups**. Creating volume backups/PITR requires Pro. The owner chose to keep the free trial and approved a private encrypted local database dump instead. No upgrade or payment was performed.
- Private encrypted backup completed at 2026-10-04 19:55:48 IST. AES-256-GCM authenticated decryption, plaintext digest and PostgreSQL archive listing were verified (247 archive entries). This was an archive validation, not a database restore rehearsal. No plaintext dump was written to disk. The owner should retain an offline copy of the encrypted dump and store its encryption key separately. The temporary Railway SSH key was revoked and its local identity/symlinks removed after verification; Railway reports no registered SSH keys.
- Chrome Google Cloud: the configured staging server and browser keys were traced to **Podium (`podium-1f234`) → MIRA Test API**. Both staging variables and the local configuration use the same key, verified internally by SHA-256 comparison without revealing it. It permits 35 APIs, including the required server APIs and Map Tiles. Podium already has Time Zone API enabled and allowed. The original key has not been changed.
- The owner requested that MIRA use credentials owned by **MIRA (`mira-510115`)**, with separate restricted server/browser keys and no duplicate billing setup. MIRA currently has no API keys, no Maps APIs enabled and no linked billing account. Podium uses the existing **My Billing Account 1**; that account is available to link to MIRA. The link has not been submitted, provider keys have not been created, and Railway Maps variables have not been replaced. Google Maps bills actual usage across projects on the same billing account; creating separate keys does not itself duplicate requests or subscriptions.
- The owner signed in to Anthropic. The dashboard shows an existing monthly spend limit; it was not changed. The provider's API-key ownership and live calls still need verification during staging smoke.
- Migrations 0026, 0027 and 0028 have not run in this session. Backup prerequisite is satisfied; Google project/key migration remains pending.
- New-release web/worker logs, `worker.started`, all `config.warning` events and moderator readiness details remain pending.

## Real-phone smoke test

Traveller phone: **not supplied**. Follower phone: **not supplied**.
No physical-phone step has been observed or passed in this session.

| Step from PRODUCTION_SMOKE_TEST.md | Result |
|---|---|
| 1. Home, location permission and Report location flow | Pending |
| 2. Country context and emergency dialler | Pending |
| 3. Route context and provider evidence | Pending |
| 4. Help Point | Pending |
| 5. Google sign-in | Pending |
| 6. Circle | Pending; email off |
| 7. Journey and WhatsApp sharing | Pending |
| 8. Follower dot and approximate saved Home | Pending |
| 9. Arrival and link expiry | Pending |
| 10. Unsafe sheet and urgent Mira messages | Pending |
| 11. Emergency | Pending |
| 12. Guest and signed-in Claude replies | Pending |
| 13. Contribution | Pending |
| 14. Missed check-in and ended-link view | Pending; automatic email unavailable |
| 15. Sign out and log review | Pending |
| 16. Offline call buttons | Pending |

Production remains blocked until staging smoke passes and the owner approves production creation and deployment. Release gates in `../PUBLIC_BETA_RELEASE.md`, support/security contact, primary and backup responder, and policy review remain open.

Rollback after a future deployment: Dashboard → web → Deployments → previous → Rollback, then worker. The target's three migrations are additive; no schema reset or destructive rollback is authorized.
