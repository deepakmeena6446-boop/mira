# MIRA — deployment checklist

The exact order to take a tested commit to production on Railway. Every step is configuration: no code change should be needed. The long-form reasoning for each step lives in [docs/DEPLOY.md](docs/DEPLOY.md); the release gates live in [docs/PUBLIC_BETA_RELEASE.md](docs/PUBLIC_BETA_RELEASE.md). After deploying, run [PRODUCTION_SMOKE_TEST.md](PRODUCTION_SMOKE_TEST.md).

Never paste a secret into chat, a commit, CI logs or this file. Read values from stdin (`railway variable set KEY --stdin`).

## 0. Pick the revision

- [ ] `git status --short` is empty and the commit to ship is recorded (`git rev-parse HEAD`).
- [ ] On that commit: `npm ci && npm run lint && npm run typecheck && npm test && npm run build` all pass (see BETA_RELEASE_REPORT.md for the last recorded run).
- [ ] Staging and production deploy the **same** commit.

## 1. Owner accounts (start these first — DNS and reviews take time)

- [ ] Railway plan and billing approved. Volume backups and point-in-time recovery require Pro (dashboard verified 2026-10-04); verify the current plan rather than assuming a trial has expired.
- [ ] A domain you control, e.g. `mira.example.org` (plus `staging.mira.example.org`).
- [ ] Optional: Resend account with a verified sending domain (SPF, DKIM, DMARC) — only for invites and the automatic missed-arrival email. WhatsApp contacts need nothing.
- [ ] Google Cloud: the existing Maps keys get API + referrer restrictions (step 5), a budget alert and per-API quotas; create the sign-in OAuth client (step 6).
- [ ] Anthropic: the existing key gets a monthly spend limit.
- [ ] Mapillary: the existing token.

## 2. Generate secrets locally

```bash
openssl rand -hex 32               # POSTGRES_PASSWORD
openssl rand -base64 32            # SESSION_SECRET
openssl rand -base64 32            # DATA_ENCRYPTION_KEY  (keep an offline copy: losing it makes contact emails unreadable)
npm run admin:hash                 # ADMIN_PASSWORD_HASH  (use the printed "b64:…" form)
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

## 3. Create the production database

- [ ] `railway init --name mira`
- [ ] `postgis` service from image `postgis/postgis:17-3.5` with `POSTGRES_USER=mira`, `POSTGRES_DB=mira`, `PGDATA=/var/lib/postgresql/data/pgdata`.
- [ ] Set `POSTGRES_PASSWORD` **before** its first boot; attach a volume at `/var/lib/postgresql/data`.
- [ ] No public TCP proxy on `postgis` (private network only).
- [ ] On Pro, enable daily volume backups, retention ≤ 30 days. Take and verify a staging backup before migrations; stop for an owner decision if backups are unavailable on the current plan.

## 4. Create `web` and `worker` with their settings

| Service | Build | Start | Pre-deploy | Healthcheck | Restart |
|---|---|---|---|---|---|
| `web` | `npm run build` | `node_modules/.bin/next start` | `node dist/migrate.mjs` | `/api/health/live` (timeout 120) | ON_FAILURE ×10 |
| `worker` | `npm run worker:build` | `node dist/worker.mjs` | — | — | ALWAYS |

Commands: docs/DEPLOY.md §1. Verify with `railway environment config --json`.

## 5. Environment variables

Set on **web** (all before the first deploy, with `--skip-deploys`), then reference the worker's subset from web.

**Required — boot fails without them**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://mira:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/mira` |
| `APP_BASE_URL` | `https://<your domain>` — no trailing slash; the site must be served on exactly this origin |
| `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH` | from step 2 |
| `PILOT_MANIFEST_PATH` | `data/pilot/manifest.json` |
| `MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `PORT` | `3000` |

**Required for the public beta — `PUBLIC_BETA_STRICT=on` refuses to boot without them**

| Variable | Value / note |
|---|---|
| `PUBLIC_BETA_STRICT` | `on` (web only) |
| `PUBLIC_AGGREGATE_RELEASES` | `off` (web and worker) |
| `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` | `x-real-ip` / `1` |
| `GOOGLE_MAPS_SERVER_KEY` | Enable and allow Places API (New), Routes API, Geocoding API and Time Zone API |
| `GOOGLE_MAPS_BROWSER_KEY` | Map Tiles API only; HTTP referrer `https://<your domain>/*` (must match `APP_BASE_URL`) |
| `GOOGLE_PLACES_HOURS` | `on` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | both or neither |
| `ANTHROPIC_API_KEY` | Mira + Safety update relevance check |
| `MAPILLARY_TOKEN` | street-imagery lighting source |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `mailto:` or `https:` contact |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` (OpenStreetMap lighting source) |
| `ALLOW_DEMO_SIGNIN` | leave **unset** (strict mode refuses `on`) |

**Recommended / optional**

| Variable | Default | Note |
|---|---|---|
| `PLACE_SEARCH_URL`, `REVERSE_GEOCODER_URL` | unset | Photon / Nominatim fallbacks (`https://photon.komoot.io`, `https://nominatim.openstreetmap.org`) |
| `MAP_STYLE_URL` | OpenFreeMap positron | fallback basemap |
| `RAILPACK_NODE_VERSION` | — | `24` on web and worker |
| `GOOGLE_MAX_CALLS_PER_MIN` / `GOOGLE_MAX_CALLS_PER_DAY` | 600 / 20000 per process | over → OpenStreetMap fallback |
| `MIRA_GLOBAL_DAILY_MAX` / `MIRA_DAILY_TOKEN_MAX` | 5000 msgs / 2M tokens | over → scripted Mira |
| `MIRA_MODEL` | `claude-sonnet-5-5` | leave unset for this release |
| `SAFETY_UPDATES` | `gdelt` | `off` hides the section honestly |
| `SAFETY_CLASSIFIER_MODEL` | `claude-opus-5` | |
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | `MIRA <alerts@your-verified-domain>`; adds invites + automatic missed-arrival email |
| `SAFETY_CLASSIFIER_DAILY_TOKEN_MAX` | 300000 | separate from Mira's budget; over → updates marked partial, never "none" |

**Development only — never in production:** `SMTP_*` (Mailpit), `ALLOW_DEMO_SIGNIN=on`, `SAFETY_UPDATES=fixture`, `MAPBOX_TOKEN` (unused).

With Claude configured and budget available, every Mira message uses Claude, including guest and everyday questions. Guests are capped at 25 replies per network per day; signed-in users at 60/day. Guest traffic also spends the shared budget. Set `MIRA_GLOBAL_DAILY_MAX` explicitly and confirm the Anthropic monthly spend limit. Staging ceilings: Google 300/min and 10000/day per process, Mira 1500/day.

**Worker** (by reference `${{web.NAME}}`): `DATABASE_URL APP_BASE_URL SESSION_SECRET DATA_ENCRYPTION_KEY ADMIN_PASSWORD_HASH PILOT_MANIFEST_PATH MAP_TILE_URL PUBLIC_AGGREGATE_RELEASES VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT GOOGLE_MAPS_SERVER_KEY GOOGLE_PLACES_HOURS GOOGLE_MAX_CALLS_PER_MIN OVERPASS_URL`, plus `NODE_ENV=production` and `RAILPACK_NODE_VERSION=24`. Add `RESEND_API_KEY EMAIL_FROM` by reference only when email is configured on web. The map keys let the worker prepare MIRA Checks; without them checks are silently dropped.

## 6. Google sign-in

- [ ] OAuth client type *Web application*.
- [ ] Authorised JavaScript origin: `https://<your domain>`.
- [ ] Authorised redirect URI (exactly): `https://<your domain>/api/auth/google/callback`.
- [ ] Consent screen scopes: `openid`, `userinfo.email`, `userinfo.profile`. Publish the app (or add testers).
- [ ] Staging gets its own client/redirect URI.

## 7. Email (Resend) — optional

- [ ] Domain shows *Verified* in Resend.
- [ ] API key with *Sending access* for that domain only.
- [ ] Test send to your own inbox with the `curl` in docs/DEPLOY.md §6 — arrives in the inbox, not spam.

## 8. Domain and HTTPS

- [ ] `railway domain --service web --port 3000`, then `railway domain <your domain> --service web --port 3000`; add the printed CNAME/TXT.
- [ ] Every subdomain of an apex domain already serves HTTPS (HSTS `includeSubDomains`).

## 9. Deploy

```bash
railway up --service web --detach -m "MIRA beta <sha>"
railway up --service worker --detach -m "MIRA beta <sha>"
railway logs --service web --lines 100       # expect no config.warning you didn't intend
railway logs --service worker --lines 100    # expect {"event":"worker.started"}
```

Pre-deploy runs `node dist/migrate.mjs` (forward-only, additive; `0000` creates the PostGIS, pg_trgm and pgcrypto extensions; a failure stops the deploy with the old version serving). Never run a destructive reset against production.

## 10. Health

```bash
BASE=https://<your domain>
curl -si $BASE/api/health/live | head -1        # HTTP/2 200
curl -s  $BASE/api/health/ready                 # {"status":"ready"} within ~1 min (needs a worker pass)
curl -sI $BASE/ | grep -iE 'strict-transport|content-security'
```

- [ ] Sign in at `/admin/login`, open `/api/health/ready` in the same browser: `contactEmailProvider: "resend"` if enabled, otherwise `"none"`; `mira: "claude"`, worker heartbeat < 60 s.
- [ ] Uptime monitor on `/api/health/ready` (1–5 min, phone alert).

## 11. Smoke test

- [ ] Run [PRODUCTION_SMOKE_TEST.md](PRODUCTION_SMOKE_TEST.md) on a real phone plus a second phone for the follower. Record date, commit and results in the owner's release record.

## 12. Optional

- [ ] Pilot OpenStreetMap snapshot (fallback when Google is off/over budget): `railway ssh --service web -- node dist/pilot-import.mjs`.

## Rollback

Dashboard → web → Deployments → previous → Rollback (then the worker). Migrations are additive, so the previous code runs on the new schema. Restore the volume backup only if data must be undone; let the worker run one pass before serving traffic after a restore.
