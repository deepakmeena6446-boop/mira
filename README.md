# MIRA — your walking companion

An installable, mobile-first web app (PWA) that works anywhere in the world. Open it and it already knows the time and where you are. Three taps to let the people you trust follow your walk home live:

1. **Where to?** Search, or tap a saved place like 🏠 Home. You get the walking route, the ETA, what's open along the way and any community notes.
2. **Share my trip.** Your trusted contacts get a live link. You get a trip screen with "I'm here" and "+10 min".
3. **Arrive.** Arrival is auto-detected. The link goes dark and the live points are deleted. If you don't check in, each accepted contact gets **one** email.

**Mira** is the in-app AI companion: warm, brief and practical. She knows your saved places, the time and your area. She can start a trip, find what's open nearby, or help you report something. She is not an emergency service and says so, pointing to 112 when someone says they're in danger.

**It follows the time of day.** The theme shifts from sunrise to day to evening to night (dark mode with a dark map), set before first paint from the phone's clock. You can pin Light or Dark under Me → App. Mira knows the hour too: brisk in the morning, and after dark she leads with sharing your walk home.

**Updates inbox** (bell on Home): a contact accepted your invite, you missed a check-in (and who was told), or your live location paused mid-trip. Push notifications replace the in-app inbox later.

**Press and hold the map** on any spot to report something there or walk to it.

**Reports** take three taps: pick one of six tiles, then send. The location defaults to "here" and the time to "just now". Reports are private and reviewed by a person. They appear publicly only as calm, template-worded community notes once enough independent people report the same thing in a ~1.2 km area.

> MIRA 2.0 deliberately moved away from the V0 spec documents (`MIRA_*.md`). Those documents describe the V0 pilot; this README describes the current app.

---

## Placeholders now, real providers later

Every external service sits behind an interface in `src/server/providers/`. The app is fully usable with **no API keys**. `GET /api/me` reports which mode each capability is in, and the Me screen shows a small "Demo" pill while any placeholder is active.

| Capability | Placeholder (today) | Real (later) | Env to set |
|---|---|---|---|
| Maps (search, routes, nearby) | MIRA's OSM snapshot where it has data. Elsewhere, live OpenStreetMap: Photon for search, Overpass for "Around you" (server-side, ~100 m rounded, cached). Routes outside the snapshot are straight-line, flagged *approximate* (dashed) | Mapbox Search + Directions | `MAPBOX_TOKEN` (placeholder: `PLACE_SEARCH_URL`, `OVERPASS_URL`; unset = off) |
| Area names | Nearest locality from the map's own vector tiles, then a server-side Nominatim lookup (~100 m rounded, cached, ≤ 1 req/s) | Mapbox reverse geocoding | `REVERSE_GEOCODER_URL` (placeholder only; unset = off) |
| Basemap | OpenFreeMap vector style ("dark" style at night) | Mapbox day + night styles | `MAP_STYLE_URL`, `MAP_STYLE_URL_NIGHT` (optional) |
| Sign-in | "Continue" with a first name creates a real local account | Google OAuth | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Mira | Scripted persona engine over the real tools, streamed as NDJSON (English + Hinglish) | Claude (`claude-opus-5`, streaming, tool use, same persona and tools) | `ANTHROPIC_API_KEY` |
| Contact delivery | SMTP (Mailpit locally) + in-app notifications | Production SMTP / WhatsApp / SMS | `SMTP_*` |
| Push | In-app only | Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

Wiring a real adapter takes three steps: implement it next to `placeholder.ts`, flip its flag in `REAL_ADAPTERS` (`src/server/providers/modes.ts`), and set the env vars. A capability reports "real" only when **both** the adapter exists and its key is present, so setting a key alone never pretends a feature works.

## Run locally

Prerequisites: Node.js ≥ 22.11 (Node 24 LTS recommended; verified on Node 26), npm, and Docker (Compose v2).

```bash
docker compose up -d            # PostGIS (127.0.0.1:54329) + Mailpit (SMTP 1025, UI http://localhost:8025)
npm install                     # also copies the MapLibre worker into public/maplibre
npm run env:local               # writes an ignored .env.local with fresh secrets; prints a one-time moderator password
npm run db:migrate
npm run pilot:import            # imports the committed OSM extract used by the placeholder maps provider
npm run dev                     # web on http://localhost:3100 (open it on your phone via your LAN IP to install)
npm run worker:dev              # second terminal: missed arrivals, deletion, weekly release
```

- Moderator area: `http://localhost:3100/admin/login`, using the password printed by `env:local`. To get a new one, run `npm run env:local -- --force`.
- Walkthrough: open `/`, follow the three welcome steps, save a place as Home from its route sheet, add a trusted contact on **Me**, open their invite from Mailpit in another browser, then tap Home → **Share my trip**.
- All mail, including contact invites, trip links and missed-arrival alerts, is captured in Mailpit at http://localhost:8025. Nothing reaches a real inbox.
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
| `pilot:fetch`, `pilot:import` | Fetch the sourced OSM extract; validate checksums and import (placeholder map data) |
| `aggregate:run -- --at <ISO Monday>` | Operator tool: run the weekly community-notes release (idempotent) |
| `lint`, `typecheck`, `test` | ESLint; route typegen + `tsc`; Vitest unit + integration (uses DB `mira_test`) |
| `test:e2e` | Production build + Playwright: share-a-trip loop, missed alerts, Mira, reports and moderation, privacy; mobile and desktop (uses DB `mira_e2e` and Mailpit) |
| `audit:bundle` | After build: scan client assets for secrets |

## How it's built

- **Next.js 16 App Router + TypeScript + Tailwind v4.** Screens live in `src/app/(app)`: Home (map + sheet), Trip, Mira, Report and Me. `/welcome` handles onboarding, `/t/[token]` is the contact's live view, `/invite` accepts a contact invite, and `/admin` is moderation.
- **PWA**: `src/app/manifest.ts`, icons in `public/`, and `public/sw.js` (an offline shell that never caches `/api`, `/t` or `/invite`).
- **PostgreSQL 17 + PostGIS 3.5**: SQL migrations in `db/migrations` (`0006_accounts_trips` and `0007_trip_share` are the 2.0 schema).
- **Separate Node worker** (`src/worker`): missed-arrival alerts (at most once), expiry, purge, retention and aggregation. Heartbeat every 30 s; trips can't start while it's unhealthy.
- **Pure domain rules** in `src/domain`: geohash cells, journey state machine, PII detection, moderation, aggregation, routing.
- **MapLibre GL** (`src/components/map/WorldMap.tsx`) with route, community-note and "you" layers. Everything on the map is also in the sheet as text.

### API map

| Area | Routes |
|---|---|
| Account | `POST /api/auth/demo`, `POST /api/auth/signout`, `GET/PATCH/DELETE /api/me`, `/api/me/places[/id]`, `/api/me/contacts[/id]`, `GET/POST /api/me/notifications` (inbox / mark read) |
| Maps | `POST /api/geo/search`, `POST /api/geo/reverse`, `POST /api/geo/route`, `POST /api/geo/nearby` (coordinates go in POST bodies, never URLs) |
| Trips | `POST /api/trips`, `GET /api/trips/current`, `POST /api/trips/[id]/location`, `POST /api/trips/[id]/{arrive,end,extend}`, `GET /api/t/[token]` (contact view) |
| Mira | `GET/DELETE /api/mira` (history), `POST /api/mira` (NDJSON stream: `text` / `card` / `done`) |
| Reports | `POST /api/reports`, `/api/admin/*` (moderator session) |

### Privacy design (summary)

| Data | Stored as | Deleted |
|---|---|---|
| Live location | Last 20 points of an open trip. Each accepted contact gets **their own** unguessable link (hashed), revoked the moment you remove them; you can also send your own link to anyone you choose. After the trip, links show only "arrived/ended" + first name for 30 min, then nothing | **The moment the trip closes**; the trip row within 6 h |
| Home screen location | In browser memory only; refreshed while the app is visible, paused when hidden. A long-pressed spot goes to Report in memory, never in the URL | Never stored |
| Offline cache (service worker) | Only an offline page and static files. Pages are never cached, because they carry your name, places and contacts | Replaced on each app update |
| Inbox | Short in-app updates (contact accepted, missed check-in, location paused) | With your account |
| Anonymous reports sent before signing in | Linked to your account on sign-in and re-keyed to one pseudonym (so you never count as two people); the browser's anonymous cookie is then discarded | With the report (≤ 30 days) |
| Saved places | Label, emoji and point, for your account only (max 10) | With your account |
| Trusted contacts | Encrypted email + keyed hash; they accept once, with no account needed | On removal or with your account |
| Mira chat | Your messages and Mira's replies — minus anything about where you were (area names, walking times, nearby-place lists are shown live but never saved) | 30 days, or instantly with "Clear" |
| Report | ~1.2 km geohash cell only, recency bucket, time band, hour-truncated time; text AES-256-GCM encrypted | ≤ 30 days |
| Public community notes | `aggregate_releases` only: ≥ 5 independent contributors, fixed wording, no counts, points or times | 35 days |

There's no location history, no public profile, no safety score and no heatmap. Emails never contain coordinates. Deleting your account (Me → Delete) removes places, contacts, trips, chat and sessions. Public responses are covered by an allowlist test, and client bundles by a secret scan.

## Production prerequisites

- **HTTPS** (`APP_BASE_URL=https://…`, enforced at startup). Cookies become `__Host-` + `Secure`, and HSTS is sent.
- **Two services from the same build**: `npm run start` (web) and `npm run worker:start` (worker), against one PostGIS database. Serverless-only or static hosting is not supported.
- **Reverse proxy** that *appends* the client address to `X-Forwarded-For`; set `TRUSTED_PROXY_HOPS` to match (default 1). It must not log full request URLs for `/invite/*` or `/t/*`, which carry bearer tokens.
- **Secrets from a secret store**, never from files in the repo. Required: `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`, `PILOT_MANIFEST_PATH`, `MAP_TILE_URL`. Optional provider keys are listed in the table above. See `.env.example`, which documents each variable and the dotenv-safe `b64:` hash form.
- **Backups**: expire in 30 days or less. After any restore, run the worker (or `purgeExpired`) **before** serving traffic, so expired reports and journeys are removed again. Use database disk encryption.
- **Monitoring**: poll `/api/health/ready`. It returns 503 when the worker's journeys job hasn't completed a pass in 3 minutes (a running-but-failing worker counts as down). Publicly it returns only `{status}`; a signed-in moderator also sees the checks, including `contactAlertProblems24h` (a count only). Warnings are logged as `health.worker_stale` and `health.contact_alert_delivery_problems`; per-trip failures as `journey.failed`.
- **Map tiles and geocoding**: OpenFreeMap and the public Nominatim, Photon and Overpass servers are fine for development and demos only. Switch to Mapbox (or another provider with an SLA) before real traffic.

## Not yet real (placeholders, clearly labelled)

| Item | Today | To complete |
|---|---|---|
| Google sign-in | Demo sign-in with a first name (real local account and session) | Add the Auth.js Google adapter, flip `REAL_ADAPTERS.google`, set `AUTH_GOOGLE_*` |
| Mapbox | OSM snapshot + approximate straight-line routes elsewhere; Nominatim area names | Add the adapter, flip `REAL_ADAPTERS.mapbox`, set `MAPBOX_TOKEN` |
| Claude for Mira | Scripted persona engine | Add the streaming adapter (same tools and persona), flip `REAL_ADAPTERS.claude`, set `ANTHROPIC_API_KEY` |
| Production SMTP / push | Mailpit + in-app | Set `SMTP_*` / `VAPID_*` |
| Background location on iOS | Browsers can't track in the background. Contacts see the last spot and time, and the missed-arrival alert still fires | Native app shell |
| Hosting, HTTPS, backups | Not provisioned | See Production prerequisites |

## Implementation decisions (where the documents left room)

1. **PII blocks approval.** A report with detected identifying content can't be approved until the moderator redacts it (deterministic replacement in the private copy) or rejects it. This is the stricter privacy reading.
2. **Fixed reason codes, not free text,** for hold, reject and withdraw, so the audit trail can't capture narrative.
3. **Trip purge 6 h after close; live points deleted at close.** Trip *start* is disabled entirely while the worker is unhealthy, because alerts, expiry and deletion depend on it.
4. **"Other" reports are never published** (there's no factual template). Transport issues are grouped as environmental rather than incident observations.
5. **Emergency release suppression** gets a small moderator page (`/admin/releases`). Withdrawing a report automatically suppresses any active release that drops below five contributors.
6. **Stable place IDs** are derived from the OSM identity, so saved references survive re-imports.
7. **`TRUSTED_PROXY_HOPS`** fixes rate-limit IP spoofing.
8. **`ADMIN_PASSWORD_HASH` accepts a `b64:` form.** Next's dotenv expansion mangles `$` in a variable that appears in both the process env and a `.env` file.
9. **Consequential actions need a tap.** Mira proposes trips, reports and SOS as cards. Nothing is shared or sent until you tap.
10. **Relative times in emails** ("in about 18 minutes"). The app is worldwide and MIRA doesn't know the contact's timezone.
11. **Security hardening from the A–Z audit:** per-request script nonces in the CSP (`src/proxy.ts`); rate limits per person/link with only a high per-IP ceiling (campus Wi-Fi and carrier NAT share IPs); invite emails have a fixed subject, names can't contain links, invites are single-use and expire in 7 days; walking routes are capped at 25 km.
12. **Honest delivery:** the trip screen only claims contacts whose link email actually went out; a failed missed-arrival email is followed by an in-app correction; contacts who got a "missed" email get an "arrived" email once.
13. **Demo sign-out deletes the demo account** (there's no way back in), and retention removes any demo account whose session expired.
