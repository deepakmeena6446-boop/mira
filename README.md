# MIRA — Know more. Move freely.

A privacy-first, mobile-first web app for one pilot area: **Delhi University North Campus around Vishwavidyalaya Metro** (28.6850–28.7050° N, 77.2020–77.2250° E). It offers three things:

- **Know**: mapped places and walking routes, with sources, freshness and uncertainty.
- **Accompany**: a temporary check-in with an optional, consented contact.
- **Report**: anonymous observations that are reviewed privately and published only as thresholded weekly summaries.

MIRA shares observed conditions, never safety guarantees.

The product, UX, architecture and execution contracts are in the four `MIRA_*.md` files. This README covers running and operating the implementation.

---

## Run locally

Prerequisites: Node.js ≥ 22.11 (Node 24 LTS recommended; verified on Node 26), npm, and Docker (Compose v2).

```bash
docker compose up -d            # PostGIS (127.0.0.1:54329) + Mailpit (SMTP 1025, UI http://localhost:8025)
npm install                     # also copies the MapLibre worker into public/maplibre
npm run env:local               # writes an ignored .env.local with fresh secrets; prints a one-time moderator password
npm run db:migrate
npm run pilot:import            # imports the committed, checksummed OSM extract (no network needed)
npm run dev                     # web on http://localhost:3100
npm run worker:dev              # second terminal: missed check-ins, deletion, weekly release
```

- Moderator area: `http://localhost:3100/admin/login`, using the password printed by `env:local`. To get a new one, run `npm run env:local -- --force`.
- All mail, including invitations and missed-check-in alerts, is captured in Mailpit at http://localhost:8025. Nothing reaches a real inbox.
- To re-fetch a newer OSM snapshot (one rate-respecting Overpass request), run `npm run pilot:fetch -- --refresh`, then `npm run pilot:import`.

Production mode locally: `npm run build && npm run start` and `npm run worker:start`.

### Scripts

| Script | Purpose |
|---|---|
| `dev` / `start` | Next.js web (port 3100) |
| `worker:dev` / `worker:start` | Background worker (bundled to `dist/worker.mjs` by `build`) |
| `env:local` | Generate `.env.local` with random secrets and an Argon2id moderator hash |
| `admin:hash` | Hash a moderator password for a secret store (prints the dotenv-safe `b64:` form) |
| `db:migrate`, `db:new-migration -- <name>` | Apply or create reviewed, forward-only SQL migrations |
| `pilot:fetch`, `pilot:import` | Fetch the sourced OSM extract; validate checksums and import |
| `aggregate:run -- --at <ISO Monday>` | Operator tool: run the weekly release for an IST Monday (idempotent) |
| `lint`, `typecheck`, `test` | ESLint; route typegen + `tsc`; Vitest unit + integration (uses DB `mira_test`) |
| `test:e2e` | Production build + Playwright flows A–G, mobile and desktop (uses DB `mira_e2e` and Mailpit) |
| `audit:bundle` | After build: scan client assets for secrets |

## How it's built

- **Next.js 16 App Router + TypeScript**: UI and same-origin route handlers (`src/app`).
- **PostgreSQL 17 + PostGIS 3.5**: SQL migrations in `db/migrations`, run through the Drizzle migrator.
- **Separate Node worker** (`src/worker`): the same code and database. Heartbeat every 30 s; readiness fails after 3 minutes without one.
- **MapLibre GL v6** with raster OSM tiles. Every fact is also available as text.
- **Pure domain rules** in `src/domain`: routing, OSM import, PII detection, moderation, aggregation, journey state machine, time bands.
- **Server integrations** in `src/server`: crypto, sessions, rate limits, mail, the optional AI adapter, and the KNOW, report, journey and aggregation services.

### Privacy design (summary)

| Data | Stored as | Deleted |
|---|---|---|
| Report | 500 m cell only (never the chosen place), recency bucket, time band, hour-truncated submission time; text AES-256-GCM encrypted; PII flags as types/counts | ≤ 30 days (text removed immediately on rejection; row within 24 h) |
| Journey | Destination place ID or encrypted label, ETA, state; **no origin, no track** | ≤ 24 h after close (6 h in practice) |
| Contact | Encrypted email; hashed single-journey bearer token | With the journey |
| Browser | Random HttpOnly cookie, stored only as a keyed hash; created on the first POST only | 30 days |
| Rate limits | Daily-rotated HMAC of IP/actor | 24 h |
| Public community data | `aggregate_releases` only: weekly, ≥ 5 independent contributors (≥ 5 *new* for a changed release), fixed wording, no counts, points or times | 35 days |

Logs contain IDs, states and counts only. Public responses are covered by an allowlist test, and client bundles by a secret scan.

## Production prerequisites

- **HTTPS** (`APP_BASE_URL=https://…`, enforced at startup). Cookies become `__Host-` + `Secure`, and HSTS is sent.
- **Two services from the same build**: `npm run start` (web) and `npm run worker:start` (worker), against one PostGIS database. Serverless-only or static hosting is not supported.
- **Reverse proxy** that *appends* the client address to `X-Forwarded-For`; set `TRUSTED_PROXY_HOPS` to match (default 1). It must not log full request URLs for `/invite/*`, which carry bearer tokens.
- **Secrets from a secret store**, never from files in the repo. Required: `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`, `PILOT_MANIFEST_PATH`, `MAP_TILE_URL`. See `.env.example`, which documents each variable and the dotenv-safe `b64:` hash form.
- **Backups**: expire in 30 days or less. After any restore, run the worker (or `purgeExpired`) **before** serving traffic, so expired reports and journeys are removed again. Use database disk encryption.
- **Monitoring**: poll `/api/health/ready`. It returns 503 when the worker is stale, and shows `contactAlertProblems24h` (a count only). Warnings are logged as `health.worker_stale` and `health.contact_alert_delivery_problems`.
- **Map tiles**: the public OSM tile server is acceptable only for low-volume pilot use. Switch `MAP_TILE_URL` (and `MAP_TILE_ATTRIBUTION`) to a provider before scale.

## External blockers (not presented as working)

| Item | Status | Fallback in place | To complete |
|---|---|---|---|
| Production SMTP | No credentials supplied. Verified end to end with Mailpit only. | Without SMTP, contact inputs are hidden ("Contact alerts are unavailable; you can still use a private check-in"), and journeys still work. | Set `SMTP_*`, send one invite plus one missed alert to a test inbox, and watch `contactAlertProblems24h`. |
| OpenAI suggestions (optional) | No key; provider data terms not accepted. Adapter verified against a mock provider only. | The control is hidden; manual reporting is complete. | Review retention terms, set `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PRIVACY_TERMS_ACCEPTED=true`, and run one live suggestion. |
| On-device voice input | Can't be verified to process audio on-device. | Text only; `microphone=()` permissions policy. | Ship only with verified on-device recognition. |
| "Stay with me" companion | No verified conversational provider. | Not shown anywhere (`src/domain/companion.ts`). | A privacy-reviewed provider plus the constraints in that module. |
| Hosting, HTTPS, backups | Not provisioned (deployment task). | Local and production-mode runs verified. | See Production prerequisites. |

## Implementation decisions (where the documents left room)

1. **PII blocks approval.** A report with detected identifying content can't be approved until the moderator redacts it (deterministic replacement in the private copy) or rejects it. This is the stricter privacy reading.
2. **Fixed reason codes, not free text,** for hold, reject and withdraw, so the audit trail can't capture narrative.
3. **Journey purge 6 h after close,** inside the 24 h limit. Journey *start* is disabled entirely while the worker is unhealthy, because expiry and deletion depend on it.
4. **"Other" reports are never published** (there's no factual template). Transport issues are grouped as environmental rather than incident observations.
5. **Emergency release suppression** gets a small moderator page (`/admin/releases`). Withdrawing a report automatically suppresses any active release that drops below five contributors.
6. **Stable place IDs** are derived from the OSM identity, so `/know/place/[id]` links survive re-imports.
7. **`OPENAI_PRIVACY_TERMS_ACCEPTED`** turns the "don't enable until terms are accepted" rule into configuration. **`TRUSTED_PROXY_HOPS`** fixes rate-limit IP spoofing.
8. **`ADMIN_PASSWORD_HASH` accepts a `b64:` form.** Next's dotenv expansion mangles `$` in a variable that appears in both the process env and a `.env` file.
