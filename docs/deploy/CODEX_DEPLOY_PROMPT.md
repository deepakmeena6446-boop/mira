# Prompt for Codex: deploy MIRA (staging, then production)

Copy everything below the line into Codex. It is written for an agent with shell access to this repository and the
Railway CLI already logged in on this machine.

---

You are deploying **MIRA**, a Next.js 16 PWA that is a safety companion for women travelling. It runs as three
Railway services: **web** (Next.js), **worker** (missed check-in alerts, purges, aggregation) and **postgis**
(PostgreSQL 17 + PostGIS 3.5). The repository is `/Users/jarvis/Developer/MIRA`; its GitHub remote is
`https://github.com/deepakmeena6446-boop/mira`. People will rely on this app when they are scared, so a broken
deploy is worse than a late one: go slowly, verify each step, and stop when something doesn't match this prompt.

## What to ship

- **Commit `a2c853e`** on `main` (already pushed to origin). Staging and production must run this exact commit.
  If `main` has moved past it when you start, stop and ask the owner which commit to ship.
- Since the last deploy it adds **migrations 0026, 0027 and 0028**. All three are additive: a check constraint
  rebuild, one nullable column and one new table. The web service's pre-deploy step applies them automatically.

## What already exists (verified 2026-10-04; re-check it yourself)

- Railway project **"Mira"** (ID `29b72709-5ec7-45d8-afa9-a99b43bdfe20`) has two environments: `staging` and `production`.
- **Staging:**
  - `web`, `worker` and `postgis` (Postgres with volume `postgis-volume`) are all online at https://mira-beta.up.railway.app.
  - `/api/health/ready` returns `{"status":"ready"}`.
  - The last deploy was 2026-10-01, which is older than everything you are shipping.
  - **staging/web variable names:** ADMIN_PASSWORD_HASH ANTHROPIC_API_KEY APP_BASE_URL AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET
    CLIENT_IP_HEADER DATABASE_URL DATA_ENCRYPTION_KEY GOOGLE_MAPS_BROWSER_KEY GOOGLE_MAPS_SERVER_KEY GOOGLE_PLACES_HOURS
    MAPILLARY_TOKEN MAP_TILE_URL NODE_ENV OVERPASS_URL PILOT_MANIFEST_PATH PORT PUBLIC_AGGREGATE_RELEASES PUBLIC_BETA_STRICT
    RAILPACK_NODE_VERSION SESSION_SECRET TRUSTED_PROXY_HOPS VAPID_PRIVATE_KEY VAPID_PUBLIC_KEY VAPID_SUBJECT
  - **Missing on staging:** RESEND_API_KEY, EMAIL_FROM (email), PLACE_SEARCH_URL, REVERSE_GEOCODER_URL, MAP_STYLE_URL, and the
    spend ceilings (GOOGLE_MAX_CALLS_PER_MIN, GOOGLE_MAX_CALLS_PER_DAY, MIRA_GLOBAL_DAILY_MAX).
- **Production** shows no services and no variables yet. Treat it as empty until `railway status --environment production` shows otherwise.

## Read these first (they are the source of truth; this prompt only adds what changed since they were written)

1. `docs/DEPLOY.md`: the step-by-step guide, with every Railway CLI command verified for CLI 4.57.3.
2. `DEPLOYMENT_CHECKLIST.md`: the exact order.
3. `.railway/railway.ts`: the desired topology, settings and which variables the worker references from web.
4. `PRODUCTION_SMOKE_TEST.md`: the phone smoke test.
5. `docs/PUBLIC_BETA_RELEASE.md`: the release gates.
6. `docs/INCIDENT_RESPONSE.md`.

**Changes since those docs were written.** Apply them, and correct the docs on a branch (see Phase 5):

- **Model.** The code default for Mira is now `claude-sonnet-5-5` (`DEFAULT_MIRA_MODEL` in
  `src/server/providers/companion/claude.ts`). Leave `MIRA_MODEL` **unset**. The docs still say `claude-sonnet-5`.
- **Time Zone API.** The Google **server** key now also calls the **Time Zone API**
  (`src/server/providers/geo/zone.ts`). Its allowed APIs must be Places API (New), Routes API, Geocoding API **and Time Zone API**.
- **Guests and Claude.** Guests (not signed in) can now talk to Mira through Claude, capped at 25 replies a day per network,
  and every Mira message goes to Claude. Set `MIRA_GLOBAL_DAILY_MAX`. The owner must confirm that a monthly spend limit
  is set in the Anthropic console.
- **Email links.** Email now carries a "Stop all MIRA emails" link to `/invite/stop/<token>`. It needs no configuration,
  but it only exists if email is configured.

## Hard rules

- **Secrets:**
  - Never print, echo, log or paste a secret value, including in your final report.
  - To set one, use `railway variable set KEY --stdin`.
  - To inspect variables, list **names only**. For example:
    `railway variables --service web --environment staging --json | python3 -c "import sys,json; print(sorted(json.load(sys.stdin)))"`.
- **Production secrets** must be newly generated (`docs/DEPLOY.md` §0). Never copy staging's SESSION_SECRET,
  DATA_ENCRYPTION_KEY, POSTGRES_PASSWORD or ADMIN_PASSWORD_HASH into production. Tell the owner to keep an **offline copy of
  production's `DATA_ENCRYPTION_KEY`**: losing it makes contact emails and private report text unreadable. Never rotate it in place.
- **Databases:**
  - Never run a destructive command against any Railway database: no `DROP`, no reset, no `scripts/e2e-server.mjs`
    (it drops the schema), no `TRUNCATE`.
  - Never add a public TCP proxy to `postgis`.
  - Never point staging at production's database, or production at staging's.
- **Settings to keep:**
  - Keep `web` at **1 replica**.
  - Keep `PUBLIC_AGGREGATE_RELEASES=off`.
  - Never set `ALLOW_DEMO_SIGNIN=on`, `SAFETY_UPDATES=fixture` or any `SMTP_*` variable on Railway.
- **Code:** don't change application code. If a deploy fails because of the code, stop and report the error with log lines.
- **Git and messages:**
  - Don't push or force-push to `main`; doc fixes go on a branch.
  - Don't send email, WhatsApp or push messages to real people, apart from the owner's own test inbox and phones during the smoke test.
- **Stop and ask the owner** before:
  - creating production services;
  - attaching a custom domain;
  - deploying to production;
  - any action that costs money (plan upgrades, static IPs, backups beyond the plan).
- **Owner-only steps** (you can't do these): Google Cloud console, Anthropic console, Resend domain verification, DNS at the
  domain registrar, the uptime-monitor account, and tests on real phones. Give the owner exact, copy-pasteable instructions,
  then wait for them to confirm.

## Phase 0: Preflight (read-only)

1. `git -C /Users/jarvis/Developer/MIRA fetch origin && git -C /Users/jarvis/Developer/MIRA rev-parse origin/main`. Confirm it is `a2c853e…`.
2. Make a clean checkout so nothing untracked is uploaded: `git worktree add /tmp/mira-deploy a2c853e`.
   Work from `/tmp/mira-deploy` from here on, and link it to the project there with
   `railway link --project 29b72709-5ec7-45d8-afa9-a99b43bdfe20 --environment staging`.
3. In `/tmp/mira-deploy`, run `npm ci && npm run lint && npm run typecheck && npm run test:unit && npm run build`. All must pass.
   Integration and E2E tests need local Docker services; the owner ran them on this commit and they passed:
   unit and integration 1,073/1,073, Playwright E2E 126 passed, 0 failed.
4. `railway status`, `railway environment config --environment staging --json` and the variable-name listing for
   staging web and worker. Compare the service settings with `.railway/railway.ts`:
   - **web:** build `npm run build`; start `node_modules/.bin/next start`; pre-deploy `node dist/migrate.mjs`;
     healthcheck `/api/health/live`, timeout 120; restart ON_FAILURE ×10.
   - **worker:** build `npm run worker:build`; start `node dist/worker.mjs`; restart ALWAYS.

   Report any drift before changing anything.
5. Ask the owner to confirm, or create in the dashboard, a **backup of the staging postgis volume** before migrating
   (*postgis → volume → Backups*). Wait for a yes.

## Phase 1: Bring staging up to date

1. Add the missing optional variables to **staging web**, with `--skip-deploys`:
   - `PLACE_SEARCH_URL=https://photon.komoot.io`
   - `REVERSE_GEOCODER_URL=https://nominatim.openstreetmap.org`
   - `MAP_STYLE_URL=https://tiles.openfreemap.org/styles/positron`
   - `GOOGLE_MAX_CALLS_PER_MIN=300`
   - `GOOGLE_MAX_CALLS_PER_DAY=10000`
   - `MIRA_GLOBAL_DAILY_MAX=1500`

   Ask the owner if they want different ceilings.
2. **Email (owner decision).** Ask whether to enable Resend on staging now. Email is what sends invites and the
   *automatic* missed check-in alert; without it, only WhatsApp links the traveller sends herself reach her contacts.
   - **If yes:** the owner verifies a sending subdomain in Resend (`docs/DEPLOY.md` §6: SPF, DKIM, DMARC) and gives you
     nothing in chat. They set `RESEND_API_KEY` themselves with `railway variable set RESEND_API_KEY --stdin --service web --environment staging`.
     You then set `EMAIL_FROM` (for example `MIRA <alerts@mail.their-domain>`) and add both names to the worker by reference:
     `railway variable set 'RESEND_API_KEY=${{web.RESEND_API_KEY}}' --service worker …`.
   - **If no:** leave both unset and note it in the report.
3. Check that the worker references every variable listed in `fromWeb` in `.railway/railway.ts` (by `${{web.NAME}}`), and add any that are missing.
4. **Owner action:** in Google Cloud, enable the **Time Zone API** and add it to the **server** key's allowed APIs. Wait for confirmation.
5. Deploy:
   ```bash
   railway up --service web --environment staging --detach -m "MIRA beta a2c853e"
   railway up --service worker --environment staging --detach -m "MIRA beta a2c853e"
   railway deployment list --service web --environment staging --json   # wait for SUCCESS
   ```
6. In the web deploy logs, confirm the pre-deploy migration ran and applied 0026, 0027 and 0028 without error.
   If the pre-deploy fails, the old version keeps serving: stop and report.
7. Logs:
   - `railway logs --service worker --environment staging --lines 100` must show `{"event":"worker.started"}`.
   - Web logs must show no `EnvValidationError` and no `config.warning` you can't explain. List every `config.warning` in the report.

## Phase 2: Verify staging

```bash
BASE=https://mira-beta.up.railway.app   # or staging's APP_BASE_URL if it differs; check the variable *name* exists, and ask the owner for the value if needed
curl -si $BASE/api/health/live | head -1                          # 200
curl -s  $BASE/api/health/ready                                    # {"status":"ready"} within ~1 min
curl -sI $BASE/ | grep -iE 'strict-transport|content-security'    # both present
curl -s  $BASE/offline.js | head -c 200                            # the offline call-buttons script is served
```

- **Moderator check.** Ask the owner to sign in at `$BASE/admin/login`, open `/api/health/ready` in the same browser and tell you
  what they see. You need:
  - `mira: "claude"`
  - a worker heartbeat under 60 s
  - `contactEmailProvider`: `resend` if email was enabled, otherwise `none`
- **Owner smoke test on staging.** Give the owner `PRODUCTION_SMOKE_TEST.md` to run with two real phones (an iPhone
  Safari traveller, plus an Android or any-browser follower). Point out these steps, which changed since the doc was written:
  - The first open now shows "Let Mira use your location?" on Home. Allow → the Emergency pill shows the local number (India: 112).
  - With location on, Report starts at "Around where you are now". With location off, it asks "Where did it happen?".
  - Mira answers everyday questions, guests included. Typing "help me pls" or "bachaoo" opens the I feel unsafe sheet straight away.
  - Live links show a saved Home only roughly (~100 m).
  - A missed check-in: the follower link says "<Name> didn't check in". After the journey ends it says
    "This live link has stopped working", not a 404.
  - Offline (airplane mode after one online visit): tapping a tab shows the offline page **with call buttons** for the
    remembered country.
- Record the date, commit, phones and pass/fail for each step in `docs/deploy/STAGING_RESULT_<date>.md` on your branch.
  **Do not go to Phase 3 until the owner says the staging smoke test passed.**

## Phase 3: Create production (only after the owner approves)

Follow `docs/DEPLOY.md` §1–§3 with the production environment (`--environment production` on every command):

1. **postgis:**
   - Create it from image `postgis/postgis:17-3.5` with `POSTGRES_USER=mira`, `POSTGRES_DB=mira` and
     `PGDATA=/var/lib/postgresql/data/pgdata`.
   - Set a **new** `POSTGRES_PASSWORD` via `openssl rand -hex 32 | railway variable set POSTGRES_PASSWORD --stdin …`
     **before** its first boot, and attach a volume at `/var/lib/postgresql/data`.
   - No public TCP proxy. Ask the owner to enable **daily backups, retention ≤ 30 days**.
2. **web and worker:** create both with exactly the settings from Phase 0 step 4, then verify them with
   `railway environment config --environment production --json`.
3. **Variables:** set every web variable before the first deploy (`--skip-deploys`), with **newly generated**
   SESSION_SECRET, DATA_ENCRYPTION_KEY and VAPID keys and a new ADMIN_PASSWORD_HASH (the owner runs `npm run admin:hash`
   and pastes the value into `--stdin` themselves).
   - **Shared provider keys.** Whether production reuses the staging Google, Anthropic and Mapillary keys is the
     owner's choice. Recommend separate keys or at least separate quotas.
   - **Worker:** give it the `fromWeb` subset by reference.
4. **Domain (owner decision):**
   - Ask for the production domain. If they have one, run `railway domain <domain> --service web --port 3000 --environment production`,
     give the owner the printed CNAME/TXT records, and wait until the domain serves HTTPS.
   - Set `APP_BASE_URL=https://<domain>` (no trailing slash).
   - If there's no domain yet, use the generated `*.up.railway.app` domain and say clearly in the report that the
     production URL will change later (OAuth, email links and the browser key referrer will all need updating then).
5. **Owner actions for production:**
   - **Google OAuth:** a separate OAuth client (or extra redirect URIs) with JavaScript origin `https://<prod domain>`
     and redirect `https://<prod domain>/api/auth/google/callback`.
   - **Browser Maps key:** HTTP referrer restriction `https://<prod domain>/*`, Map Tiles API only.
   - **Google Cloud:** quotas and a budget alert.
   - **Anthropic:** a monthly spend limit.
   - **Resend:** the production sending domain, if email is used.

## Phase 4: Deploy production and verify (only after the owner approves)

1. Run `railway up` for web, then worker, from `/tmp/mira-deploy` (still commit `a2c853e`), with `--environment production`.
2. Run the same checks as Phase 2 against the production URL: live 200, ready 200, HSTS and CSP present, worker started,
   migrations 0000–0028 applied on a fresh database, and no `EnvValidationError`.
3. **Pilot data (optional).** The OpenStreetMap snapshot is the fallback when Google is off or over budget. Load it with
   `railway ssh --service web --environment production -- node dist/pilot-import.mjs`, only if the owner wants it.
4. **Uptime monitor (owner).** Set one up on `https://<prod>/api/health/ready` every 1–5 min, alerting the owner's phone.
   Help them rehearse it once on **staging**:
   - stop the worker deployment;
   - confirm ready turns 503 and starting a trip is refused;
   - restart the worker and confirm the monitor turns green.
5. The owner runs `PRODUCTION_SMOKE_TEST.md` on production with two phones. Record the result.

## Phase 5: Report and tidy up

- On a branch `deploy/a2c853e-docs` (never `main`), fix the outdated docs:
  - **Model default:** `docs/DEPLOY.md` and `DEPLOYMENT_CHECKLIST.md` should say `claude-sonnet-5-5`.
  - **Server key APIs:** add the Time Zone API.
  - **Guest Claude usage:** add a note on guest use and its spend.
  - **Smoke test:** update the welcome and location steps in `PRODUCTION_SMOKE_TEST.md`.

  Add the staging and production results files. Commit them, push the branch, and open a PR. Do not merge it.
- `git worktree remove /tmp/mira-deploy`.
- **Final report to the owner, short and in plain words:**
  - what is live where (URLs);
  - which commit;
  - which migrations ran;
  - every `config.warning`;
  - what is not configured (for example email);
  - what each smoke-test step showed;
  - what the owner still has to do: release gates in `docs/PUBLIC_BETA_RELEASE.md`, the support/security contact,
    a named responder and backup responder, the policy review;
  - how to roll back: *Dashboard → web → Deployments → previous → Rollback*, then the worker. Migrations are additive,
    so the previous code runs on the new schema.

  No secret values anywhere in the report.
