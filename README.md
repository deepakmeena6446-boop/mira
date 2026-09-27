# MIRA — with you until you arrive

An installable, mobile-first web app (PWA) for adults 18 or older. It helps a woman understand the way before she goes, keeps the people she chooses with her until she arrives, and puts help one tap away. It never says a route, place or person is safe; it shows what's known, where it's from, and what isn't known.

1. **Where are you going?** Search, or tap a saved place like 🏠 Home. You get the walking route (and up to two alternatives when the maps provider has them), the time, how much of the way is **mapped as lit**, and the **Help Points** along it (hospitals, police, stations, pharmacies, fuel, hotel receptions), each with hours exactly as the source lists them or "hours not known".
2. **Start with MIRA.** Share with your trusted contacts (by email), or keep it to yourself and send your **live link** with the phone's share sheet (WhatsApp, SMS…). The journey screen has *I'm here*, *+10 min*, the nearest Help Point, *I feel unsafe* and Emergency.
3. **Arrive.** Arrival is auto-detected. The link goes dark and the live points are deleted. If you miss a check-in, MIRA attempts **one** email per accepted contact when email is configured; the app shows failed or unconfirmed delivery honestly. After a journey at night, one tap: "Was the way lit?"

**Walking, by auto/cab, or by metro/bus.** Walks get routes and context; for rides she picks the ETA (and they can be longer than a walk). "Tell my people now" can also start a journey that just shares where she is.

**Navigation is Home · Circle · Me.** Circle holds trusted contacts; Me holds places, Help Point filters (e.g. no police), notifications on this phone, and adding an email to keep the account. Mira is a button (Home, "I feel unsafe"), and Report is reached from long-press, Home, after a journey, and Me.

**I feel unsafe** (Home and journey screen) opens instantly, with no AI and no network wait: the nearest Help Point ranked for right now (listed as closed now → left out), **Tell my people now** (attempts to email accepted contacts her live link and shows the result), send your live link, call someone (the phone's own contacts or a typed number, never stored), **Emergency** with the number from the country's cited profile (`data/locales/`; service-specific numbers are labelled; every one of the 195 countries is in `data/countries/registry.json`, and one without a reviewed profile is named but has no guessed number: see [docs/COUNTRY_COVERAGE.md](docs/COUNTRY_COVERAGE.md)), her location in words to read out, and Mira last. **Emergency** is also a pill on Home and the journey screen.

**Safety updates** (Home, and a destination's card): recent published news and official advisories about women's safety in that city, strictly filtered, with the publisher, age, allegation status and a link for each. One story told by several outlets is one update. It is never a rating of an area, and a failed check says so ([docs/SAFETY_UPDATES.md](docs/SAFETY_UPDATES.md)).

**Mira** is the in-app AI companion: warm, brief and practical. She knows your saved places, the time and your area. She can propose a trip, find nearby Help Points, or help you report something; actions require your tap. She is not an emergency service and says so, pointing to reviewed local emergency options when available.

**It follows the time of day.** The theme shifts from sunrise to day to evening to night (dark mode with a dark map), set before first paint from the phone's clock. You can pin Light or Dark under Me → App. Mira knows the hour too: brisk in the morning, and after dark she leads with sharing your walk home.

**Updates inbox** (bell on Home): a contact accepted your invite, you missed a check-in (and who was told), or your live location paused mid-trip. Web Push can also notify the traveller when configured and enabled on a supported device; the in-app inbox remains available.

**Press and hold the map** on any spot to report something there or walk to it.

**Street lighting on the route.** The route sheet shows how much of the way is *mapped as lit* (map data can be old; only MIRA walkers who agree can say a stretch is actually lit), with the share that's not known, and the map glows warm along lit stretches. Sources, strongest first: MIRA walkers' one-tap "Was the way lit?" after a walk in the dark (shown only when ≥ 3 people agree), OpenStreetMap `lit` tags, and streetlight poles detected in Mapillary imagery (optional `MAPILLARY_TOKEN`). Mira mentions it after dark. It's lighting information, never a safety rating.

**Reports** take three taps: pick one of six tiles, then send. The location defaults to "here" and the time to "just now". Reports stay private while publication is off. If staffed moderation and the release job are enabled later, only sufficiently corroborated, reviewed observations can become template-worded community notes.

> MIRA 2.0 deliberately moved away from the V0 spec documents, now archived in [`docs/archive/v0/`](docs/archive/v0/). Those documents describe the V0 pilot; this README describes the current app.

---

## Provider modes

Every external service sits behind an interface in `src/server/providers/`. Local development works with no external API keys; the public beta requires live provider configuration and verification. `GET /api/me` reports which mode each capability is in, and the Me screen shows a small "Demo" pill while any placeholder is active.

| Capability | Local fallback | Connected mode | Env to set |
|---|---|---|---|
| Maps (search, routes, nearby, area names, basemap) | MIRA's OSM snapshot + live OpenStreetMap (Photon, Overpass, Nominatim) — used when no Google key is set, and as automatic fallback | **Connected:** Google Maps Platform — Places API (New), Routes API (walking), Geocoding API, Map Tiles API (day + dark night style) — `src/server/providers/geo/google.ts`, `tiles.ts` | `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_BROWSER_KEY` |
| Area names | Vector-tile locality and bounded OpenStreetMap reverse lookup | Google Geocoding when Maps is configured | `GOOGLE_MAPS_SERVER_KEY`; `REVERSE_GEOCODER_URL` only for the fallback |
| Basemap | OpenFreeMap vector style | Google Map Tiles when configured; custom vector styles can be supplied | `GOOGLE_MAPS_BROWSER_KEY`; optional `MAP_STYLE_URL`, `MAP_STYLE_URL_NIGHT` |
| Sign-in | First-name account lives in one browser; email links can make it durable | Google OAuth is implemented; sign-in methods require an 18+ self-attestation in production | `RESEND_API_KEY` + `EMAIL_FROM` for email links; `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` |
| Mira | Scripted persona engine over the real tools, streamed as NDJSON (English + Hinglish) — used when no key is set, and as the automatic fallback if Claude fails before replying | **Connected:** Claude (`claude-opus-5`, low effort, streaming tool loop, cached persona; never sees coordinates; location details scrubbed from saved history) — `src/server/providers/companion/claude.ts` | `ANTHROPIC_API_KEY` |
| Contact delivery | SMTP (Mailpit locally) + in-app notifications | **Connected:** Resend HTTPS API (`src/server/mail/resend.ts`); WhatsApp / SMS later | `RESEND_API_KEY` + `EMAIL_FROM` (production), `SMTP_*` (local) |
| Push | In-app inbox | **Connected:** Web Push to the traveller (worker outbox; payloads never carry location) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

Runtime modes come from configured adapters and keys (`src/server/providers/modes.ts`). Production readiness also requires successful live checks; a configured key alone is not proof of provider availability.

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
- Walkthrough: open `/`, follow the three welcome steps, save a place as Home from its route sheet, add a trusted contact on **Me**, open their invite from Mailpit in another browser, then tap Home → **Start with MIRA**. The *I feel unsafe* button and the Emergency pill are on Home and the journey screen.
- All mail, including contact invites, trip links and missed-arrival alerts, is captured in Mailpit at http://localhost:8025. Nothing reaches a real inbox.
- To re-fetch a newer OSM snapshot (one rate-respecting Overpass request), run `npm run pilot:fetch -- --refresh`, then `npm run pilot:import`.

Production mode locally: `npm run build && npm run start` and `npm run worker:start`.

### Scripts

| Script | Purpose |
|---|---|
| `dev` / `start` | Next.js web (port 3100); `start:prod` honours `$PORT` (Railway) |
| `worker:dev` / `worker:start` | Background worker (bundled to `dist/worker.mjs` by `build`) |
| `env:local` | Generate `.env.local` with random secrets and an Argon2id moderator hash |
| `admin:hash` | Hash a moderator password for a secret store (prints the dotenv-safe `b64:` form) |
| `db:migrate`, `db:new-migration -- <name>` | Apply or create reviewed, forward-only SQL migrations (`db:migrate:prod` runs the bundled `dist/migrate.mjs`, no `tsx`) |
| `pilot:fetch`, `pilot:import` | Fetch the sourced OSM extract; validate checksums and import (placeholder map data; `pilot:import:prod` in production) |
| `aggregate:run -- --at <ISO Monday>` | Operator tool: run the weekly community-notes release (idempotent) |
| `lint`, `typecheck`, `test` | ESLint; route typegen + `tsc`; Vitest unit + integration (uses DB `mira_test`) |
| `test:e2e` | Production build + Playwright: share-a-trip loop, missed alerts, Mira, reports and moderation, privacy; mobile and desktop (uses DB `mira_e2e` and Mailpit) |
| `audit:bundle` | After build: scan client assets for secrets |

## How it's built

- **Next.js 16 App Router + TypeScript + Tailwind v4.** Screens live in `src/app/(app)`: Home (map + sheet), Trip, Mira, Report and Me. `/welcome` handles onboarding, `/t/[token]` is the contact's live view, `/invite` accepts a contact invite, and `/admin` is moderation.
- **PWA**: `src/app/manifest.ts`, icons in `public/`, and `public/sw.js` (an offline shell that never caches `/api`, `/t` or `/invite`).
- **PostgreSQL 17 + PostGIS 3.5**: SQL migrations in `db/migrations` (`0006_accounts_trips` and `0007_trip_share` are the 2.0 schema).
- **Separate Node worker** (`src/worker`): missed-arrival alerts (at most once), expiry, purge, retention and aggregation. Heartbeat every 30 s; trips can't start while it's unhealthy, and an open journey tells the traveller when missed-arrival checks are paused. The worker exits (for its supervisor to restart it) if the journeys job stalls past the readiness window or the database stays unreachable; every statement is capped at 30 s.
- **Help Points** (`src/domain/help-points.ts`): classes, the deterministic ranking (walking time, tier, hours known at night, ahead/behind on a trip) and conservative name checks. No model ranks or filters them. Providers implement `helpPlaces()`; `src/server/help-points` samples along routes.
- **Pure domain rules** in `src/domain`: geohash cells, journey state machine, PII detection, moderation, aggregation, routing.
- **MapLibre GL** (`src/components/map/WorldMap.tsx`) with route, community-note and "you" layers. Everything on the map is also in the sheet as text.

### API map

| Area | Routes |
|---|---|
| Account | `POST /api/auth/demo`, `POST /api/auth/signout`, `GET/PATCH/DELETE /api/me`, `/api/me/places[/id]`, `/api/me/contacts[/id]`, `GET/POST /api/me/notifications` (inbox / mark read) |
| Maps | `POST /api/geo/search`, `POST /api/geo/reverse`, `POST /api/geo/route` (route + alternatives, lighting, Help Points), `POST /api/geo/nearby`, `POST /api/geo/help` (Help Points near a point) — browser-to-MIRA coordinates go in POST bodies; some server-to-provider requests use rounded coordinates in GET URLs (see `docs/LOCATION_PRIVACY.md`) |
| Trips | `POST /api/trips` (optional `routeMinutes` for a chosen alternative, clamped), `GET /api/trips/current` (+ `safetyNet`), `POST /api/trips/[id]/location`, `POST /api/trips/[id]/{arrive,end,extend}`, `GET /api/t/[token]` (contact view) |
| Mira | `GET/DELETE /api/mira` (history), `POST /api/mira` (NDJSON stream: `text` / `card` / `done`) |
| Reports | `POST /api/reports`, `/api/admin/*` (moderator session) |

### Privacy design (summary)

| Data | Stored as | Deleted |
|---|---|---|
| Live location | Last 20 points of an open trip. Each accepted contact gets **their own** unguessable link (hashed), revoked the moment you remove them; you can also send your own link to anyone you choose. After the trip, links show only "arrived/ended" + first name for 30 min, then nothing | **The moment the trip closes**; the trip row within 6 h |
| Planned route of a journey | On the device only (sessionStorage, this tab), for Help Points ahead and the lighting question | When the journey is done |
| Home screen location | In browser memory only; refreshed while the app is visible, paused when hidden. A long-pressed spot goes to Report in memory, never in the URL | Never stored |
| Offline cache (service worker) | Only an offline page and static files. Pages are never cached, because they carry your name, places and contacts | Replaced on each app update |
| Inbox | Short in-app updates (contact accepted, missed check-in, location paused) | With your account |
| "Was the way lit?" answers | Per ~40 m street cell + the day only; a keyed per-cell hash stops double votes without linking cells into a route; no user, trip or time | Stop counting after 90 days, deleted after 120 |
| Anonymous reports sent before signing in | Linked to your account on sign-in and re-keyed to one pseudonym (so you never count as two people); the browser's anonymous cookie is then discarded | With the report (≤ 30 days) |
| Saved places | Label, emoji and point, for your account only (max 10) | With your account |
| Trusted contacts | Encrypted email + keyed hash; they accept once, with no account needed | On removal or with your account |
| Mira chat | Your messages as typed; Mira replies are scrubbed of location-derived fragments before storage | 30 days, or instantly with "Clear" |
| Report | ~1.2 km geohash cell only, recency bucket, time band, hour-truncated time; text AES-256-GCM encrypted | ≤ 30 days |
| Public community notes | `aggregate_releases` only: ≥ 5 independent contributors, fixed wording, no counts, points or times | 35 days |

There's no location history, no public profile, no safety score and no heatmap. Emails never contain coordinates. Deleting your account (Me → Delete) removes places, contacts, trips, chat and sessions. Public responses are covered by an allowlist test, and client bundles by a secret scan.

## Deploy

MIRA's production target is **Railway**: a `postgis` service (`postgis/postgis:17-3.5` + volume), a `web` service (`npm run build`, `next start` on `$PORT`, pre-deploy `node dist/migrate.mjs`, deploy healthcheck `/api/health/live`) and a `worker` service (`node dist/worker.mjs`, restart always). Email goes through Resend's HTTPS API. The step-by-step guide, with the exact CLI commands, variables table, Resend/Google setup, monitoring and rollback, is **[docs/DEPLOY.md](docs/DEPLOY.md)**. The same setup is declared as Railway Infrastructure as Code in [`.railway/railway.ts`](.railway/railway.ts).

## Production prerequisites

- **HTTPS** (`APP_BASE_URL=https://…`, enforced at startup). Cookies become `__Host-` + `Secure`, and HSTS is sent.
- **Two services from the same build**: `npm run start:prod` (web, on `$PORT`) and `npm run worker:start` (worker), against one PostGIS database. Serverless-only or static hosting is not supported.
- **Reverse proxy**: rate limits key on `CLIENT_IP_HEADER` when the edge overwrites one header with the client address (Railway: `x-real-ip`), otherwise on the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` from the right (default 1). It must not log full request URLs for `/invite/*` or `/t/*`, which carry bearer tokens.
- **Secrets from a secret store**, never from files in the repo. Required: `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`, `PILOT_MANIFEST_PATH`, `MAP_TILE_URL`. Optional provider keys are listed in the table above. See `.env.example`, which documents each variable and the dotenv-safe `b64:` hash form.
- **Backups**: expire in 30 days or less. After any restore, run the worker (or `purgeExpired`) **before** serving traffic, so expired reports and journeys are removed again. Use database disk encryption.
- **Monitoring**: poll `/api/health/ready`. It returns 503 when the worker's journeys job hasn't completed a pass in 3 minutes (a running-but-failing worker counts as down). Publicly it returns only `{status}`; a signed-in moderator also sees the checks, including `contactAlertProblems24h` (a count only). Warnings are logged as `health.worker_stale` and `health.contact_alert_delivery_problems`; per-trip failures as `journey.failed`.
- **Maps**: use restricted Google Maps keys with quotas and budget alerts for the public beta. Public OpenStreetMap endpoints remain fallback sources and must be presented as unavailable when a lookup fails.

## Public beta release status

The Railway architecture and beta-hardening code are present, but a public launch requires owner-held domain and provider credentials, live inbox and device tests, backups, monitoring, moderation staffing and policy review. Follow [the release gates](docs/PUBLIC_BETA_RELEASE.md) and [Railway runbook](docs/DEPLOY.md). A green local test suite alone is not a launch verdict.

Known device limit: browsers may pause location updates in the background, especially on iOS. The shared view shows the last position and its age; the worker still watches the check-in deadline.

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

## Contributing & license

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, tests, the review flow and protected areas. Every change is checked against the [product principles](PRINCIPLES.md). Community reports are handled under the [moderation policy](MODERATION_POLICY.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

MIRA is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version as a network service, you must offer its source code, under the same license, to the people who use it.
