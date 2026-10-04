# Staging deployment record — 2026-10-04

**Status: target web/worker deployed; automated staging checks pass; free-plan worker policy differs from the required topology; moderator/phone smoke test pending.**

Target commit: `a2c853e34c06314238effb1fe442b4e89287fccb`.
Staging URL: https://mira-beta.up.railway.app.
Date uses the owner's Asia/Kolkata time zone. No application code was changed.

## Source and local checks

- `git fetch origin` confirmed `origin/main` is the exact target commit.
- Clean deployment checkout: `/tmp/mira-deploy`, detached at the target commit; `git status --short` empty after checks.
- `npm ci`, `npm run lint`, `npm run typecheck`: pass.
- `npm run test:unit`: 873/873 pass, 87/87 files. The first sandbox run returned `EPERM` for the localhost migration-wait test; rerunning with local network access returned the expected connection refusal and passed.
- `npm run build`: Next.js 16.3.6 Webpack production build and worker/migrator/import bundles pass. Railway package installation also reports 9 audit findings (4 moderate, 5 high) and install-script approval notices. No dependency/code changes or automatic audit fixes were made; review before public release.
- Integration/E2E were not rerun in this deployment session. The owner's prior result in the deployment prompt is separate evidence.

## Railway inspection and saved configuration

Project `Mira`: `29b72709-5ec7-45d8-afa9-a99b43bdfe20`.
Staging environment: `ea7f1599-1f8a-497f-815b-aaaff161d0bf`.
Production is empty; no production services were created.

- Target web deployment `32abe255-4371-43bb-87a0-173d8a075e82` was uploaded from the clean target checkout at 2026-10-04 20:25:46 IST and reached SUCCESS. Target worker upload `9d723023-6b96-4f57-abfd-25b91e65b546` reached SUCCESS and emitted `worker.started` at 20:29:48 IST. PostGIS was not redeployed.
- Web: desired build/start commands, pre-deploy `node dist/migrate.mjs`, liveness path, 120-second healthcheck and active ON_FAILURE ×10 policy verified; one replica.
- Worker: desired build/start commands verified. Free/Trial does **not** support ALWAYS and caps ON_FAILURE at 10 retries. This was confirmed in Chrome: the Always option is disabled with “Not supported by your plan”, and in [Railway's restart-policy documentation](https://docs.railway.com/deployments/restart-policy). API updates reported success but the platform dropped the unsupported setting on deployment, including after a staged configuration commit. Final worker deployment `150297d4-d046-48a5-935a-661877cc29f9` reuses the uploaded target build, reached SUCCESS and emitted `worker.started` at 20:35:59 IST. Its active manifest confirms ON_FAILURE ×10. No upgrade was performed, respecting the owner's choice to stay free. This is a known staging reliability limitation and a production topology gate, not a corrected ALWAYS policy.
- Worker `APP_BASE_URL` corrected to reference web, and `GOOGLE_MAX_CALLS_PER_MIN` added by reference. All non-email entries in `.railway/railway.ts`'s `fromWeb` subset now reference web.
- Added web fallback URLs for Photon, Nominatim and OpenFreeMap with `--skip-deploys`.
- Saved ceilings with `--skip-deploys`: Google 300/min and 10000/day, Mira 1500/day.
- `PUBLIC_BETA_STRICT=on`, `PUBLIC_AGGREGATE_RELEASES=off`, expected NODE_ENV/PORT/client-IP settings, `MIRA_MODEL` unset and absence of forbidden SMTP/demo/fixture settings confirmed without printing secrets.
- No PostGIS public TCP proxy. Volume `postgis-volume` is mounted at `/var/lib/postgresql/data`.
- Owner chose to leave email off. `RESEND_API_KEY` and `EMAIL_FROM` remain unset on web/worker. Invites and automatic missed-check-in emails are unavailable; WhatsApp sharing requires the traveller to press Send.

## Target deployment HTTP checks

| Check | Observed result |
|---|---|
| `/api/health/live` | 200 |
| `/api/health/ready` | 200, status ready |
| `/` | 200 |
| HSTS and CSP on `/` | Both present |
| `/offline.js` | 200 after target deployment (was 404 on the old deployment) |

These HTTP checks passed after target web and worker deployments, including the restart-policy attempts. They do not replace moderator readiness or the physical-phone smoke test. Desktop Chrome also loaded Home with unsafe, emergency, Mira and report controls, with no browser console errors/warnings observed; no phone step is marked passed from this desktop check.

## Blocking owner decisions and provider checks

- Chrome Railway dashboard: current plan is Trial. Staging PostGIS has **No Backups**. Creating volume backups/PITR requires Pro. The owner chose to keep the free trial and approved a private encrypted local database dump instead. No upgrade or payment was performed.
- Private encrypted backup completed at 2026-10-04 19:55:48 IST. AES-256-GCM authenticated decryption, plaintext digest and PostgreSQL archive listing were verified (247 archive entries). This was an archive validation, not a database restore rehearsal. No plaintext dump was written to disk. The owner should retain an offline copy of the encrypted dump and store its encryption key separately. The temporary Railway SSH key was revoked and its local identity/symlinks removed after verification; Railway reports no registered SSH keys.
- Chrome Google Cloud: the configured staging server and browser keys were traced to **Podium (`podium-1f234`) → MIRA Test API**. Both staging variables and the local configuration use the same key, verified internally by SHA-256 comparison without revealing it. It permits 35 APIs, including the required server APIs and Map Tiles. Podium already has Time Zone API enabled and allowed. The original key has not been changed.
- MIRA (`mira-510115`) has no API keys, Maps APIs or linked billing account. The owner's attempt to link the existing Podium billing account failed because Google reached its limit on billing-enabled projects (owner supplied the error screenshot). The owner then explicitly chose to keep using the **existing Podium key** and defer the project migration/separate-key restrictions. No new billing account, subscription, quota increase or key was created. This shared 35-API key remains a known security limitation and is not the final public-launch credential setup.
- The owner signed in to Anthropic. The dashboard shows an existing monthly spend limit; it was not changed. The provider's API-key ownership and live calls still need verification during staging smoke.
- The verified backup, existing Time Zone API setup and owner choice to retain the Podium key satisfied staging deploy prerequisites. Pre-deploy log at 20:27:59 IST says **Migrations applied.** The exact uploaded journal ends at `0026_alert_delivery_sending`, `0027_report_network`, `0028_email_suppressions`. The migrator completes all pending journal entries before printing that success line; it does not log individual migration names. No separate database-journal query or restore was performed. Credential separation/project migration is deferred by the owner.
- New-release logs show `worker.started` and no `EnvValidationError` in the inspected startup logs. The only distinct `config.warning` is: “No email provider (RESEND_API_KEY + EMAIL_FROM, or SMTP_*): contact invites, missed-arrival emails and email sign-in are OFF; WhatsApp contacts and share links still work.” This is expected from the owner's email-off decision and appeared on both web and worker (web more than once).
- Direct API readiness navigation in automated Chrome returned `ERR_BLOCKED_BY_CLIENT`; public readiness was verified by HTTP instead. No browser protection was bypassed.
- Moderator readiness still needs `mira: "claude"`, worker heartbeat under 60 seconds and `contactEmailProvider: "none"` verified in the owner's signed-in admin browser.

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

Production remains blocked until the required worker reliability topology is supported, staging smoke passes and the owner approves production creation and deployment. Release gates in `../PUBLIC_BETA_RELEASE.md`, support/security contact, primary and backup responder, and policy review remain open.

Rollback after a future deployment: Dashboard → web → Deployments → previous → Rollback, then worker. The target's three migrations are additive; no schema reset or destructive rollback is authorized.
