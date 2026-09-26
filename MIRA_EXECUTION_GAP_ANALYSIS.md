# MIRA — Execution Gap Analysis

*2026-09-26 · commit `ba671c3`. For every capability in `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md`: what exists, what kind of work closes the gap, and its priority. It builds on `MIRA_LAUNCH_AUDIT.md` Part 6 (whose P0/O-tasks are still undone: no code changed since the audit) and doesn't repeat its detail.*

### Legend

| Tag | Meaning |
|---|---|
| **EXISTS** | Already exists and works (locally) |
| **UI** | Requires a UI change |
| **LOGIC** | Requires a logic change in existing code |
| **DATA** | Requires a data source MIRA doesn't use yet |
| **BACKEND** | Requires new backend (tables, jobs, services) |
| **NATIVE** | Requires a native app |
| **PARTNER** | Requires a partnership, registration or approval from a third party |
| **RESEARCH** | Requires research before design is final |
| **LONG** | Long-term only |

**Priorities:** **P0** = required before public beta (this week) · **P1** = first iteration after launch, H1 completion · **P2** = after real-world usage evidence, H2 · **P3** = research / H3.

**Where AI sits in this plan** (owner's rule: AI may determine relevance, prioritise, personalise and recommend actions; it never independently determines whether a safety claim is true). Evidence work (sources, rules, thresholds, confidence) is deterministic and statistical. AI relevance and recommendations reach users through Mira (existing), then the route card, advice Q&A and briefings with the engine's relevance layer (P2). Route-card metrics are always deterministic, and until P2 the card uses rule order. The *I feel unsafe* sheet and Emergency pill stay deterministic for speed.

**Coverage:** no row here promises equal depth everywhere. Depth depends on local data, and where reliable information is missing the product says "not known".

---

## 1. Capability-by-capability

### Before (context and navigation)

| Capability | Tags | The gap, exactly | Where | Priority |
|---|---|---|---|---|
| "Where are you going?" as the Home headline | EXISTS · UI | Search + chips exist; Home leads with the map and "Around you" | `HomeScreen.tsx` | **P0** (copy + order) |
| Walking route | EXISTS | — | `google.ts walk()` | — |
| Lighting context | EXISTS · UI | "Lit" reads as tonight's truth → "Mapped as lit" when the source is OSM/Mapillary | `LightingSummary.tsx` | **P0** (wording; audit had it P1) |
| Lighting freshness | LOGIC · DATA | Read OSM way edit dates (`out meta`) and Mapillary detection dates; show age; label old tags | `server/lighting/index.ts`, `domain/lighting.ts` | P1 |
| Help Points v0 | LOGIC · UI | Sample places along the whole route (not the midpoint); restrict to Tier 1–2 classes; label hours unknown; replace "Along the way" | `api/geo/route/route.ts`, `HomeScreen.tsx` | **P0** |
| Help Points with hours + ranking | DATA · LOGIC | Add opening hours (Places `currentOpeningHours`, a higher SKU, *or* parse OSM `opening_hours`); deterministic ranking (blueprint §5E); per-locale class weights | `google.ts` field mask, new `domain/help-points.ts` | P1 |
| "Help Points near me" entry on Home | UI | A secondary link to the same ranked list around her current position (blueprint §9) | `HomeScreen.tsx` | P1 |
| Help Point filters ("no police") | UI · LOGIC | A preference stored with the account | Me, `domain/help-points.ts` | P1 |
| Route alternatives | LOGIC · UI | `computeAlternativeRoutes` (verify WALK support per region); lighting + Help Points per option; comparison card; sort by time by default | `google.ts`, `api/geo/route`, route sheet | P1 |
| Road-class description ("main road most of the way") | DATA · LOGIC | OSM `highway` class along the route (Overpass, same bbox cache) | `server/lighting`-style module | P2 |
| Community notes display | UI · LOGIC | Remove notes from the map and from "Around you"; a released note appears only as a dated text line on a route card when it passes the incident gates (engine §7.7), with "Why am I seeing this?" (supersedes audit P1-4) | `WorldMap.tsx`, `HomeScreen.tsx`, `api/geo/nearby` | P1 |
| ContextItem read-model | LOGIC | `domain/context.ts` type + templates; adapters for lighting, Help Points, notes (engine S1) | new | P1 |
| Transit route options | DATA · LOGIC | Routes API `TRANSIT` or an open router; mode-aware context | `providers/geo` | P2 |
| Official alerts and incidents on route (warnings, disruptions, closures) | DATA · BACKEND | CAP + GTFS-RT + police/municipal notices in the worker; `sources` + `context_items` tables (engine S4); incident gates (engine §7.7) | worker, migrations | P2 |
| Hyperlocal incident intelligence from news (incidents as evidence inputs, never a feed) | DATA · BACKEND · RESEARCH (extraction quality) | Extraction → quarantine → clustering → corroboration → incident gates (engine §7.7); reviewer UI | worker, admin | P2, after the official-feed pipeline works |
| Destination briefing | DATA · BACKEND · UI | Locale profiles + advice cards + advisories | new | P2 |
| Local advice Q&A | BACKEND · DATA · PARTNER (reviewers) | Advice cards store + RAG with citation enforcement + evals | `providers/companion`, new store | P2 |
| Itinerary review | BACKEND · UI | Combines all of the above | new | P2 (late) |

### During (journey companion, trusted circle)

| Capability | Tags | The gap, exactly | Where | Priority |
|---|---|---|---|---|
| Live journey, per-contact links, Share link, auto-arrival, missed alert | EXISTS · **PARTNER (hosting, SMTP)** | Nothing runs in production: hosting, PostGIS, HTTPS, production SMTP with a verified domain (audit O1–O9) | ops | **P0** |
| "Start with MIRA" framing; honest private journeys | UI | Rename the share action; private copy states "nobody is alerted" (audit P0-3) | `HomeScreen.tsx`, `TripScreen.tsx` | **P0** |
| Alert channel stated ("by email") | UI | Audit P0-4 | Home, Me, invite email | **P0** |
| Next Help Point ahead on the trip screen | LOGIC · UI | Keep the route polyline on the device for the trip; nearest ranked Help Point ahead | `TripScreen.tsx` | P1 |
| Widen "Was the way lit?" | LOGIC | Ask after "End trip" too; fetch the route on close if missing (audit P1-1) | `TripScreen.tsx` | P1 |
| Viewer → user line | UI | "Want your people to see you home too? Get MIRA" on the viewer page (audit P1-2) | `SharedTripView.tsx` | P1 |
| Push to the traveller | BACKEND · PARTNER (VAPID only) | Web Push adapter (flag exists: `webPush: false`); iOS needs an installed PWA | `providers/notify`, `modes.ts`, `sw.js` | P1 |
| Durable accounts / recovery | BACKEND · PARTNER (Google OAuth) | Google / email sign-in; account migration from demo | `api/auth`, `session` | P1 |
| Non-walking journeys (manual ETA) | LOGIC · UI | Mode picker; custom ETA (`validateNewEta` exists); lift the 25 km refusal for non-walk modes; ETA copy per mode | `startTripSchema`, `api/trips`, `api/geo/route` | P1 |
| WhatsApp / SMS alerts to contacts | BACKEND · PARTNER | WhatsApp Business Platform (business verification, template approval, per-message cost); SMS in India needs DLT registration (entity, header, templates) | `providers/notify` | P2 |
| Lighter contact accept | UI · LOGIC | Accept via WhatsApp link rather than email | contacts | P2 (with WhatsApp) |
| Circle roles (arrivals only / travel only) | LOGIC · UI | Per-contact scope | contacts, trips | P2 |
| Deviation / unexpected stop (opt-in, on-device) | LOGIC · UI · RESEARCH (thresholds, false-positive rate) | Route kept on device; detection on the client; prompt her first; share only on her tap | `TripScreen.tsx` | P2 |
| Background location | **NATIVE** | Browsers can't; native iOS/Android shell with background location permission and store review | new | P2 (start), H2 |
| Contextual updates mid-journey | BACKEND · DATA | Engine + push + budgets | worker, notify | P2 |

### When something feels wrong

| Capability | Tags | The gap, exactly | Where | Priority |
|---|---|---|---|---|
| Emergency pill, always visible | UI | `tel:` link on Home + Trip, calm styling (audit P0-2) | `HomeScreen.tsx`, `TripScreen.tsx` | **P0** |
| "I feel unsafe" instant sheet | UI · LOGIC | Deterministic sheet: nearest Help Point, Share link / call someone, Emergency, Talk to Mira. **No LLM call** | new component, `HomeScreen`, `TripScreen` | **P0** |
| Mira "I feel uneasy" returns options | LOGIC | `TOOL_GUIDE` change (audit P0-6) | `claude.ts` | **P0** |
| Emergency number through one function | LOGIC | Replace the 7 hardcoded `112`s with `emergencyNumber(locale)` (India profile only at first) | 7 files (intelligence doc A.1) | P1 |
| Locale profiles (numbers, helplines) beyond India | DATA · PARTNER (reviewers) | Cited data files; protected review | `data/locales/*` | P1 (structure + IN), P2 (more countries) |
| "Tell my people now" | LOGIC · BACKEND (small) | User-triggered alert through the missed-alert pipeline; starts a trip if none; care-worded | `server/trips`, worker, mail templates | P1 |
| Location in words (to read to a call-taker) | LOGIC · UI | Reverse geocode (area + nearest named place) on the sheet | sheet, `api/geo/reverse` | P1 |
| Breadcrumb trail to contacts in unsafe/missed state | LOGIC · UI | Show the last N points (already stored) to contacts only in that state, with per-trip consent | `api/t/[token]`, `SharedTripView.tsx` | P2 |
| Emergency-service data integration | PARTNER · RESEARCH · LONG | ERSS-112 / PEMEA / RapidSOS-class | — | P3 (`MIRA_FUTURE_RESEARCH.md` R1) |
| AI calling on her behalf | RESEARCH · LONG | Not recommended (R2) | — | P3 |

### After (contribution and community)

| Capability | Tags | The gap, exactly | Where | Priority |
|---|---|---|---|---|
| Lit votes | EXISTS | Trigger too narrow (P1 above) | — | — |
| Reports + moderation + aggregation | EXISTS · PARTNER (a human moderator) | Someone must check `/admin`, or the "reviewed by a person" copy changes (audit) | ops | **P0** (commitment) |
| Aggregation timezone-aware | LOGIC | Week per locale time zone | aggregation job | P2 |
| Public moderation policy | — (document) | "Reports about who lives somewhere are rejected", defamation handling | docs | P1 |
| Place confirmations ("Was it open?") | BACKEND · UI | `context_signals` table (modelled on `lit_votes`); one question per journey | engine S3 | P2 |
| "Is this wrong?" on any item | BACKEND · UI | Contradiction input | engine S3 | P2 |
| Env-overridable abuse thresholds | LOGIC | Read `BURST_*` / `REPORT_LIMITS_*` from env with public defaults | `domain/moderation.ts`, `server/report/limits.ts` | P2 |
| Source reliability statistics | BACKEND | Engine S6 | — | P3 |

### Platform, privacy, global

| Capability | Tags | The gap, exactly | Where | Priority |
|---|---|---|---|---|
| Hosting, DB, HTTPS, monitor | PARTNER | Audit O1–O3, O7, O9 | ops | **P0** |
| Keys rotated, restricted, budgets; Mira cap 60/day | PARTNER · LOGIC | Audit O5, P0-7 | ops, `api/mira` | **P0** |
| Privacy page accuracy | UI | Chat claim (audit P0-5) | `privacy/page.tsx` | **P0** |
| Promise-led welcome, no "coming soon" | UI | Audit P0-1 | `Welcome.tsx` | **P0** |
| Real-device checks (Android, iPhone install/session) | — | Audit Phase 6 | — | **P0** |
| Encrypt saved places at rest | LOGIC · BACKEND (migration) | Like contact emails | `saved_places` | P1 |
| Time zone per place (not IST) | LOGIC | `lib/time.ts`, `domain/pilot.ts` | — | P1 |
| Hide "Demo mode" pill, OG image, Google attribution | UI | Audit P1-6, P1-7, P1-8 | — | P1 |
| Mira model choice (latency / cost) | LOGIC | Measure, then choose (audit P1-9) | `claude.ts` | P1 |
| Tabs: Home · Circle · Me; Mira as a button | UI | Blueprint §9 | `TabBar.tsx`, layouts | P1 |
| Open-source readiness | — (repo files) | LICENSE, CONTRIBUTING, SECURITY, CODEOWNERS, CI, archive V0 docs (audit Part 5 §8) | repo | P1 |
| Locale data contribution process | — (process) | Protected review + citation rules for `data/locales` | repo | P2 |
| Source registry + connectors framework | BACKEND | Engine S4 | worker | P2 |
| Multi-region hosting / data residency | BACKEND · PARTNER | When non-India users are material | ops | P3 |
| Women's Mobility / Safety Index | RESEARCH · LONG | R3; only with rigorous, transparent methodology | — | P3 |

---

## 2. Priority lists

### P0: before the public beta (this week)

**Operations (owner): the real gate**
1. Host web + worker + Postgres/PostGIS with HTTPS; uptime monitor on `/api/health/ready` (audit O1–O3, O6–O9).
2. Production SMTP with a verified sending domain; see a missed-arrival email land in a real inbox (O4). **If this fails, launch the Share-link-only flow and say so.**
3. Rotate and restrict all keys; budgets; Mira cap 60/day (O5, P0-7).
4. Commit to checking `/admin` during beta, or change the "reviewed by a person" copy.

**Product (code)**
5. Promise-led welcome, no "coming soon" (audit P0-1). Copy should align with the blueprint: a journey companion, with the walk home as the hero.
6. Home headline "Where are you going?"; "Start with MIRA" with share options; honest private-journey copy; alerts stated as email (P0-3, P0-4).
7. **Emergency pill** on Home + Trip (P0-2).
8. **"I feel unsafe" instant sheet**, deterministic, no LLM.
9. **Help Points v0** replacing "Along the way": sampled along the route, Tier 1–2 classes, "hours not known" labels.
10. "Mapped as lit" wording.
11. Mira: options on "uneasy"; no legal/medical instructions line (P0-6).
12. Privacy page fix (P0-5).
13. `npm run check` + E2E green; real-device tests (P0-8, Phase 6).

### P1: complete Horizon 1
1. Help Points with hours + deterministic ranking + filters; "Help Points near me" on Home.
2. "Tell my people now" + location in words on the sheet.
3. Route alternatives with a context comparison.
4. Next Help Point ahead on the trip screen.
5. Widen "Was the way lit?"; viewer → user line.
6. Web Push; durable sign-in.
7. Non-walking journeys with manual ETA.
8. Emergency number and time zone through the Location Context interface (India profile).
9. ContextItem read-model; lighting freshness.
10. Notes display fix; encrypt saved places; tabs restructure; demo pill, OG image, attribution; Mira model decision.
11. Public moderation policy; open-source readiness.

### P2: Horizon 2, driven by beta evidence
1. WhatsApp / SMS alerts; lighter contact accept; circle roles.
2. Native shell with background location.
3. Place confirmations + "Is this wrong?"; aggregation per time zone; env-tunable abuse thresholds.
4. Opt-in deviation / unexpected-stop detection (on-device); consented breadcrumb in unsafe state.
5. Source registry; CAP, GTFS / GTFS-RT and official notices for the first city; mid-journey updates; then news-derived incidents behind quarantine and corroboration.
6. Transit journeys; locale profiles for the first travel-corridor countries.
7. Advice cards for the first arrival points; local advice Q&A with citation enforcement; destination briefings.
8. Itinerary review (last).

### P3: research and long term
Emergency-service integration (R1) · AI emergency calling (R2, not recommended) · Women's Mobility / Safety Index (R3, only with rigorous, transparent methodology) · source reliability statistics · regional maintainers and moderation · multi-region hosting · public research datasets (R4–R5).

---

## 3. Critical path and dependencies

```
Hosting + SMTP ──► public beta ──► real usage evidence ──► P2 choices
       │
       └─► (none of the product P0s depend on it; build them in parallel)

Help Points v0 ──► hours + ranking ──► Help Point ahead on trip ──► I-feel-unsafe "nearest Help Point" quality
Location Context interface ──► locale profiles ──► travel (briefings, advice)
ContextItem read-model ──► context_signals (confirmations) ──► sources + context_items (ingestion) ──► advice Q&A
Durable accounts + push ──► travel companion (multi-day trips) ──► native shell
```

**The two things that most limit MIRA's usefulness, and their order:**
1. **Delivery channels** (SMTP now; push; then WhatsApp/SMS). A safety net nobody reads is not a safety net.
2. **Hours on Help Points.** Without them, "go to the nearest Help Point" at night is a guess.

---

## 4. Not building yet (explicit)

- Simplistic neighbourhood safety scores, unexplained 0–100 safety ratings, rankings driven by raw community sentiment, ratings of people or demographic groups, fear-based red/green maps, or "safe route" labels (never).
- Incident feeds, raw crime maps, incident map layers, news screens or sensational alerts (never). Incidents enter only as evidence inputs (P2).
- Area-perception ratings ("felt unsafe here") (never).
- AI emergency calls (research only; not recommended).
- Emergency-service integrations (research / partnership only).
- News-derived incident ingestion (P2, after the official-feed pipeline works).
- Itinerary planner (after briefings, transit and advice cards exist).
- Women's Mobility / Safety Index (P3 research only; built only if research supports it, with exposed dimensions, coverage, methodology, geography, data age, uncertainty, confidence and missing data).
- Passive location collection or history beyond a trip (never).
- Gamification (never, unless it demonstrably improves accuracy).
- Native app before the PWA beta produces evidence (P2).
