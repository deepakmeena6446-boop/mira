# Deploying MIRA on Railway

> **Public beta profile:** Use `PUBLIC_BETA_STRICT=on` on web for the 18+ worldwide beta. It fails startup/build if Resend, Google Maps, Google sign-in, Claude, Mapillary, Web Push or Google Places hours are unconfigured; keep `PUBLIC_AGGREGATE_RELEASES=off`. The older share-link-only option below is for local previews or a different, explicitly approved release. Complete [the public beta release gates](PUBLIC_BETA_RELEASE.md) before production traffic.


MIRA runs as **three Railway services** in one project, built from this repository:

| Service | What it runs | Restart | Health |
|---|---|---|---|
| `postgis` | `postgis/postgis:17-3.5` image + a volume (PostgreSQL 17, PostGIS 3.5; same as local dev) | on failure | — |
| `web` | `npm run build` → `node_modules/.bin/next start` on `$PORT`. **Pre-deploy:** `node dist/migrate.mjs` | on failure (10) | deploy healthcheck `/api/health/live` |
| `worker` | `npm run worker:build` → `node dist/worker.mjs` | **always** | `/api/health/ready` (via web) |

The worker is not optional: it sends missed-arrival alerts, purges journeys and runs retention. Trips refuse to start while it's unhealthy, and `/api/health/ready` returns 503.

The desired declarative topology is recorded in [`.railway/railway.ts`](../.railway/railway.ts). The installed Railway CLI 4.57.3 does not expose `railway config`, so use the verified CLI path below and compare it with this topology. Railway's older Config as Code (`railway.json` / `railway.toml`) is deprecated, **new services can't opt into it**, and it stops being read on 2026‑12‑01, so this repo has no `railway.json` ([docs](https://docs.railway.com/config-as-code)).

> **Email is required for this public beta.** A non-strict local or private preview can still boot without it and honestly offer share links only. With `PUBLIC_BETA_STRICT=on`, missing Resend configuration blocks startup.

---

## 0. Before you start (owner-held accounts)

- Railway account (Hobby or Pro). Railway CLI: `brew install railway` (or `npm i -g @railway/cli`), then `railway login`.
- A domain you control for the final production URL; staging uses a separate domain or subdomain.
- Resend account with that domain verified (step 6). Start DNS verification first: it can take a while.
- Google Cloud project: a **server** Maps key, a **browser** Maps key, and an OAuth client.
- Anthropic API key with a monthly spend limit, plus a Mapillary token.

Generate the secrets locally (never commit them, never paste them into chat):

```bash
openssl rand -hex 32      # POSTGRES_PASSWORD (hex: safe inside a URL)
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY
npm run admin:hash        # ADMIN_PASSWORD_HASH: use the printed "b64:…" form
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (required for this beta)
```

## 1. Create the project and services

Run from the repository root. Every command below exists in Railway CLI 4.57 (`railway <cmd> --help`). Values are read from stdin so they never land in shell history.

```bash
railway init --name mira                     # creates the project and links this directory

# --- Database: PostGIS image + volume (Railway's stock Postgres has no PostGIS) ---
railway add --service postgis --image postgis/postgis:17-3.5 \
  --variables "POSTGRES_USER=mira" --variables "POSTGRES_DB=mira" \
  --variables "PGDATA=/var/lib/postgresql/data/pgdata"
openssl rand -hex 32 | railway variable set POSTGRES_PASSWORD --stdin --service postgis
railway volume add --service postgis --mount-path /var/lib/postgresql/data

# --- App services (empty; code is uploaded with `railway up` in step 4) ---
railway add --service web
railway add --service worker
```

`PGDATA` points at a sub-directory because a Railway volume's root contains `lost+found`, and `initdb` needs an empty directory. Set `POSTGRES_PASSWORD` **before** the database first boots (it's read only by `initdb`); if the container crash-looped without it, it will start once the variable is set.

Service settings (the same fields `.railway/railway.ts` declares):

```bash
railway environment edit -m "MIRA service settings" \
  --service-config web build.buildCommand "npm run build" \
  --service-config web deploy.startCommand "node_modules/.bin/next start" \
  --service-config web deploy.preDeployCommand '["node dist/migrate.mjs"]' \
  --service-config web deploy.healthcheckPath "/api/health/live" \
  --service-config web deploy.healthcheckTimeout 120 \
  --service-config web deploy.restartPolicyType ON_FAILURE \
  --service-config web deploy.restartPolicyMaxRetries 10 \
  --service-config worker build.buildCommand "npm run worker:build" \
  --service-config worker deploy.startCommand "node dist/worker.mjs" \
  --service-config worker deploy.restartPolicyType ALWAYS
railway environment config --json   # verify every field above landed as intended
```

If a field didn't take (the CLI doesn't document how `--service-config` parses arrays and numbers), set it in the dashboard: *service → Settings → Build / Deploy*. Pre-deploy command: `node dist/migrate.mjs`.

### Staging environment

Create a separate `staging` Railway environment with its **own** PostGIS volume, secrets, sending address, OAuth redirect URI and staging domain. `railway environment new staging --json` is available in CLI 4.57.3. Verify the environment and service settings with `railway status --json` and `railway environment config --environment staging --json` before uploading code. Never point staging at the production database or reuse production share-link secrets. Run the same migrations and release checks there first; production uses the same tested Git revision.

## 2. Domain and HTTPS

```bash
railway domain --service web --port 3000     # prints https://<name>.up.railway.app
# later, your own domain (prints the CNAME + TXT records to add at your DNS host):
railway domain mira.example.org --service web --port 3000
```

Railway terminates TLS at its edge (TLS 1.2/1.3) and sets `X-Forwarded-Proto: https`. `web` listens on `PORT=3000` (set in step 3); `next start` reads `$PORT`.

In production the app sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` (only when `APP_BASE_URL` is `https://`). On an **apex** domain this forces HTTPS on every subdomain for a year: make sure they all serve HTTPS first.

## 3. Variables

Set on **web**; the worker gets the subset it needs by reference (`${{web.NAME}}`), so every secret is stored once.

```bash
S="--service web --skip-deploys"
railway variable set NODE_ENV=production PUBLIC_BETA_STRICT=on PUBLIC_AGGREGATE_RELEASES=off PORT=3000 RAILPACK_NODE_VERSION=24 $S
railway variable set 'DATABASE_URL=postgresql://mira:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/mira' $S
printf 'https://<your domain>' | railway variable set APP_BASE_URL --stdin $S
openssl rand -base64 32 | railway variable set SESSION_SECRET --stdin $S
openssl rand -base64 32 | railway variable set DATA_ENCRYPTION_KEY --stdin $S
railway variable set ADMIN_PASSWORD_HASH --stdin $S           # paste the b64:… value, then Ctrl-D
railway variable set PILOT_MANIFEST_PATH=data/pilot/manifest.json $S
railway variable set 'MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png' $S
railway variable set MAP_STYLE_URL=https://tiles.openfreemap.org/styles/positron $S
railway variable set CLIENT_IP_HEADER=x-real-ip TRUSTED_PROXY_HOPS=1 $S
# Email (Resend; required for this public beta; see step 6).
railway variable set RESEND_API_KEY --stdin $S
railway variable set 'EMAIL_FROM=MIRA <alerts@your-domain>' $S
# Live providers required for this public beta
railway variable set GOOGLE_MAPS_SERVER_KEY --stdin $S
railway variable set GOOGLE_MAPS_BROWSER_KEY --stdin $S
railway variable set GOOGLE_PLACES_HOURS=on $S
railway variable set MAPILLARY_TOKEN --stdin $S
railway variable set AUTH_GOOGLE_ID --stdin $S
railway variable set AUTH_GOOGLE_SECRET --stdin $S
railway variable set VAPID_PUBLIC_KEY --stdin $S
railway variable set VAPID_PRIVATE_KEY --stdin $S
railway variable set VAPID_SUBJECT --stdin $S
railway variable set ANTHROPIC_API_KEY --stdin $S

W="--service worker --skip-deploys"
railway variable set NODE_ENV=production RAILPACK_NODE_VERSION=24 $W
for k in DATABASE_URL APP_BASE_URL SESSION_SECRET DATA_ENCRYPTION_KEY ADMIN_PASSWORD_HASH PILOT_MANIFEST_PATH MAP_TILE_URL RESEND_API_KEY EMAIL_FROM PUBLIC_AGGREGATE_RELEASES VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
  railway variable set "$k=\${{web.$k}}" $W
done
```

| Variable | Service | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | web, worker | yes | Private network URL above. Never enable a public TCP proxy on `postgis`. |
| `APP_BASE_URL` | web, worker | yes | `https://…`, no trailing slash. Enforced at startup in production. Used in every emailed link. |
| `SESSION_SECRET` | web, worker | yes | ≥ 32 random bytes, base64. |
| `DATA_ENCRYPTION_KEY` | web, worker | yes | Exactly 32 bytes, base64. **Losing it makes contact emails and private report text unreadable.** Keep an offline copy. |
| `ADMIN_PASSWORD_HASH` | web, worker | yes | `b64:` form from `npm run admin:hash`. |
| `PILOT_MANIFEST_PATH` | web, worker | yes | `data/pilot/manifest.json` (committed). |
| `MAP_TILE_URL` | web, worker | yes | Raster fallback template. |
| `NODE_ENV` | web, worker | yes | `production` (Railpack also sets it at runtime). |
| `PUBLIC_BETA_STRICT` | web | public beta | `on`: require every advertised live provider at startup. |
| `PUBLIC_AGGREGATE_RELEASES` | web, worker | public beta | `off` until a staffed moderation release is approved. |
| `PORT` | web | yes | `3000`, matching the domain's target port. |
| `RAILPACK_NODE_VERSION` | web, worker | recommended | `24` (LTS). Without it Railpack resolves `engines.node` (`>=22.11.0`), which can pick a non-LTS major. |
| `CLIENT_IP_HEADER` | web | recommended | `x-real-ip`: Railway's edge overwrites it with the connecting address. Rate limits key on it. |
| `TRUSTED_PROXY_HOPS` | web | fallback | `1`. Used only when the header above is absent. |
| `RESEND_API_KEY`, `EMAIL_FROM` | web, worker | public beta | Both or neither. `EMAIL_FROM` = `MIRA <alerts@your-verified-domain>`. |
| `MAP_STYLE_URL`, `MAP_STYLE_URL_NIGHT` | web | optional | Vector basemap (OpenFreeMap placeholder by default). |
| `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_PLACES_HOURS` | web | public beta | See step 7. |
| `ANTHROPIC_API_KEY`, `MIRA_MODEL` | web | public beta | Mira on Claude; unset = scripted placeholder. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | web | public beta | **Both or neither** (startup fails otherwise). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web, worker | public beta | Web Push to the traveller. |
| `GOOGLE_MAX_CALLS_PER_MIN`, `MIRA_GLOBAL_DAILY_MAX` | web | optional | Spend ceilings (defaults 600/min per process, 5000/day). |
| `MAPILLARY_TOKEN` | web | public beta | Street-lighting layer. |
| `REVERSE_GEOCODER_URL`, `OVERPASS_URL`, `PLACE_SEARCH_URL` | web | optional | Public OSM services; set only if you accept their usage policies. |

Set all of these **before the first deploy** (`--skip-deploys` above), because `next build` and the pre-deploy step both run with the service's variables.

## 4. Deploy

No GitHub remote is required: `railway up` uploads this directory (respecting `.gitignore`, so `.env*`, `node_modules`, `.next` and `dist` are never uploaded).

```bash
railway up --service web --detach -m "MIRA beta"
railway up --service worker --detach -m "MIRA beta"
railway deployment list --service web --json     # wait for SUCCESS
railway logs --service web --lines 100
railway logs --service worker --lines 100        # expect {"event":"worker.started"}
```

What happens on `web`: Railpack installs dependencies (devDependencies included), `postinstall`/`prebuild` copy the MapLibre worker into `public/maplibre/`, `npm run build` runs `next build` and bundles `dist/worker.mjs`, `dist/migrate.mjs` and `dist/pilot-import.mjs`. Then the pre-deploy step runs `node dist/migrate.mjs` in a separate container on the private network. It waits up to ~90 s for the database, applies `db/migrations` (0000 runs `CREATE EXTENSION postgis, pg_trgm, pgcrypto`), and **a failure stops the deploy** with the old version still serving. Then Railway waits for `/api/health/live` → 200.

The runtime image contains the whole repo, including `data/` (locale profiles, read at runtime from `process.cwd()`), `db/migrations` and `public/`.

**Optional: pilot map data.** It's the OpenStreetMap placeholder for the original pilot area, used when Google is off or over budget. Import it once (it replaces itself idempotently):

```bash
railway ssh --service web -- node dist/pilot-import.mjs
```

## 5. Verify (smoke test)

```bash
BASE=https://<your domain>
curl -si $BASE/api/health/live | head -1                       # 200
curl -s  $BASE/api/health/ready                                 # {"status":"ready"} once the worker has done a pass (≤ 1 min)
curl -sI $BASE/ | grep -i -E 'strict-transport|content-security'  # HSTS + CSP present
```

Then sign in to `/admin/login` and open `/api/health/ready` in the same browser: a moderator sees `database`, `worker`, `workerHeartbeatAgeSeconds`, `contactEmail`, `contactEmailProvider` (`resend` / `smtp` / `none`) and `mira` (`claude` / `placeholder`). No keys or addresses are ever shown.

On a phone: open the site and install it (manifest + service worker, same origin, HTTPS). Walk the share-a-trip loop from `MIRA_LAUNCH_AUDIT.md` Part 6.

## 6. Email with Resend

1. Resend → **Domains → Add domain**: use a sending subdomain you control (e.g. `mail.your-domain`).
2. Add the DNS records Resend shows (**SPF** TXT + MX on the `send.` subdomain, **DKIM** TXT at `resend._domainkey`). Add a **DMARC** record (`_dmarc` TXT, start with `v=DMARC1; p=none;`). Wait for *Verified*.
3. Create an API key with **Sending access** for that domain only. Set `RESEND_API_KEY` and `EMAIL_FROM` (step 3), then redeploy web and worker.
4. Test send, straight to your own inbox (checks the key, the domain and spam placement):

   ```bash
   curl -sS https://api.resend.com/emails \
     -H "Authorization: Bearer $RESEND_API_KEY" -H 'Content-Type: application/json' \
     -d '{"from":"MIRA <alerts@your-domain>","to":["you@gmail.com"],"subject":"MIRA test","text":"If this is in your inbox, MIRA email works."}'
   ```

5. End to end: on the live site, add yourself as a trusted contact (invite arrives), accept, share a short trip, let it go overdue. Exactly one missed-arrival email should arrive, and the moderator readiness view should show `contactEmail: "ok"`.

How MIRA uses it (`src/server/mail/resend.ts`): `POST https://api.resend.com/emails` with a 10 s timeout and an `Idempotency-Key`. A 4xx is a definite failure (shown as "failed"). A 5xx, 408/409, timeout or dropped connection is retried once with the same key, then reported "couldn't confirm". Nothing is ever recorded `sent` unless Resend returned 2xx. Logs carry status codes only, never addresses. Check your Resend plan's daily and monthly limits against expected alert volume.

## 7. Google Maps and sign-in

- **Server key** (`GOOGLE_MAPS_SERVER_KEY`): API restrictions **Places API (New), Routes API, Geocoding API** only. Railway's egress IPs aren't static unless you enable static outbound IPs (Pro), so add an IP application restriction only if you have them. Set per-API **quotas** and a **budget alert** in Google Cloud.
- **Browser key** (`GOOGLE_MAPS_BROWSER_KEY`): application restriction **HTTP referrers** `https://<your domain>/*`; API restriction **Map Tiles API** only. The CSP already allows `https://tile.googleapis.com` when this key is set.
- **Google sign-in** (when enabled): OAuth client type *Web application*, authorised redirect URI **`https://<your domain>/api/auth/google/callback`**, authorised JavaScript origin `https://<your domain>`. The consent screen is a top-level navigation. The CSP adds `https://accounts.google.com` to `form-action` when `AUTH_GOOGLE_ID` is set, in case sign-in starts from a form POST.
- **Anthropic**: set a monthly spend limit in the console. MIRA also caps Mira at 60 messages per person per day and `MIRA_GLOBAL_DAILY_MAX` overall.

## 8. Monitoring

- **Uptime monitor** (UptimeRobot, Better Stack, …) on `https://<your domain>/api/health/ready` every 1–5 min, alerting your phone on any non-200. It's 503 when the database is unreachable or the worker's journeys pass is over 3 minutes old. Test it: `railway down --service worker` (removes the running worker deployment) → alert within ~5 min, and new trips are refused → `railway up --service worker --detach` → monitor green again.
- Railway's deploy healthcheck only runs during a deploy ([docs](https://docs.railway.com/guides/healthchecks)); it is not monitoring.
- Logs are structured JSON: `railway logs --service worker`. Watch for `worker.watchdog_exit`, `journey.failed`, `mail.send_failed`, `health.worker_stale`, `health.contact_alert_delivery_problems`, `config.warning`.
- Rate limits live in Postgres (`abuse_counters`), so they hold across restarts.

## 9. Backups, rollback, secrets

- **Backups**: *postgis → volume → Backups*: enable daily backups, retention ≤ 30 days (privacy policy). After any restore, let the worker run a pass **before** serving traffic, so expired journeys and reports are purged again.
- **Rollback**: dashboard → *web → Deployments → previous → Rollback* (and the same for worker). Migrations are forward-only: rolling code back across a migration is safe only if the old code tolerates the new schema (additive migrations do). There is no down-migration. Restore the volume backup if a migration must be undone.
- **Rotate** a secret by setting it again (it redeploys). Never rotate `DATA_ENCRYPTION_KEY` in place: existing ciphertext would become unreadable.
- Keep `web` at **1 replica** for the beta: the Google call budget is per process, and more replicas would also need `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and a `deploymentId` (see `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`).

## Known limits on Railway

- Railway's HTTP logs record request paths. `/t/<token>` and `/invite/<token>` carry bearer tokens (the app never logs them itself). Anyone with access to the Railway project can see them in HTTP logs; keep project membership minimal.
- Railway staff have given conflicting answers on `X-Forwarded-For` (appended vs rewritten), which is why MIRA keys rate limits on `X-Real-IP` via `CLIENT_IP_HEADER` ([specs](https://docs.railway.com/networking/public-networking/specs-and-limits)).
- The worker may start a few seconds before web's pre-deploy migration finishes on a schema-changing deploy. If it hits a missing column it exits, and the ALWAYS restart policy brings it back on the new schema.
