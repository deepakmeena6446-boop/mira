# MIRA public beta — code freeze record

## Revision

| | |
|---|---|
| Branch | `main` (also `release/beta-rc`, same commit) |
| Frozen commit | **the commit that adds this file** — `git log -1 --format=%H -- docs/PUBLIC_BETA_FREEZE.md`. It changes documentation only; its code is identical to the verified revision below. |
| Verified code revision | `f208ea332ce085a1a0f0adfa7a69e9a64b26af1b` |
| Timestamp | 2026-09-27T14:11Z |
| Node (verification) | v26.4.0 locally; production pins Node 24 (`.nvmrc`, `RAILPACK_NODE_VERSION=24`); `engines` ≥ 22.11 |
| npm | 11.17.0 (`package-lock.json` v3; installs with `npm ci`) |

## Release gates

| Gate | Result | Evidence |
|---|---|---|
| `npm ci` | PASS | clean install, 521 packages; production dependencies: 0 known vulnerabilities (4 moderate, dev-only tooling) |
| `npm run lint` | PASS | 0 errors, 0 warnings |
| `npm run typecheck` | PASS | `next typegen` + `tsc --noEmit` |
| `npm test` | PASS | 764/764 (59 files, unit + integration against PostGIS) |
| `npm run build` | PASS | Next production build, `dist/worker.mjs`, `dist/migrate.mjs`, `dist/pilot-import.mjs` |
| Worker | PASS | From an isolated copy of the shipped files with a scrubbed environment: missing config → exit 1 listing the variables; valid production config → `worker.started`, own heartbeat and `job:journeys` pass recorded. Every bundle external is a production dependency. |
| Migration artifact | PASS | `node dist/migrate.mjs`, scrubbed env: no `DATABASE_URL` → exit 1; fresh database → 20 migrations; re-run → no-op; unreachable database → retries ~90 s (first-boot wait), then exit 1. Migrations are forward-only and additive (0018 indexes, 0019 nullable email + phone columns). |
| Secret scan | PASS | Tree and full history: no Google, Anthropic, Resend, Mapillary, OAuth or GitHub keys, private keys, or production database URLs. Only `.env.example` (empty values) has ever been tracked; `.env*` is ignored. The one Argon2 hash in history is a unit-test fixture, not a real moderator hash. |
| Strict mode | PASS | `PUBLIC_BETA_STRICT=on` requires Google Maps (server + browser), Google sign-in, Anthropic, Mapillary, VAPID, `OVERPASS_URL`, `CLIENT_IP_HEADER`, `GOOGLE_PLACES_HOURS=on`, https `APP_BASE_URL`; refuses `ALLOW_DEMO_SIGNIN=on`, `PUBLIC_AGGREGATE_RELEASES=on`, `SAFETY_UPDATES=fixture`. `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH` are always required. Email is optional by the release contract. Verified live: a refused config serves 500 on every route including `/api/health/live`. |
| Health contract | PASS | Verified on `next start` with `PORT=3171`: `/api/health/live` 200; `/api/health/ready` 200 with a fresh worker, 503 once the worker heartbeat is gone, 200 again after the worker restarts. |

## Deployment contract

Production and staging must deploy this exact commit SHA. No code modifications are permitted during deployment unless this freeze is formally broken.

## Known risks (non-blocking)

- **CI did not run** on GitHub: Actions refused to start the job ("account is locked due to a billing issue"). The gates above were run locally.
- **Node version:** verified on Node 26; production runs Node 24 (the supported LTS), which is inside `engines` but was not run locally.
- **Strict-mode refusal is not a process exit:** the web process stays up returning 500, so Railway's deploy healthcheck is what stops a misconfigured release (docs/DEPLOY.md describes this).
- **Not verified on real phones or live providers from Railway:** iPhone/Android, installed PWA, Web Push delivery, Google sign-in, Google tiles with a referrer-restricted key, GDELT from Railway egress (it throttles shared IPs).
- **WhatsApp is tap-to-send:** a WhatsApp-only contact gets no automatic missed-arrival alert; email (optional) adds that. The app states this on every relevant screen.
- **Email provider optional and currently absent:** without Resend there are no invites or automatic emails; boot logs a `config.warning`.
- **Mira** was not re-evaluated against the live model after the persona/filter changes; the deterministic filter is strict and may replace harmless replies.
- **Safety updates relevance** on fresh unseen headlines scored precision 0.875; results can be partial or "couldn't check".
- **Coverage:** reviewed emergency profiles for 60 of 195 countries; others show no guessed number. Lighting and Help Point evidence varies by area.
- **Cost ceilings are per process** (Google 600/min and 20,000/day; Mira and classifier token budgets); Google Cloud budget alerts remain the backstop.
- **Migrator on an unreachable database** waits ~90 s before failing the pre-deploy step.
- `MAPBOX_TOKEN` is dead configuration (no adapter); harmless.

## Blockers

None
