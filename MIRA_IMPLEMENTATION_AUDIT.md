# MIRA — Implementation Audit

*2026-09-26 · branch `feat/execute-approved-plan` · compared against `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md` §9/§14 and `MIRA_EXECUTION_GAP_ANALYSIS.md` §2 (P0). Day-by-day detail is in `MIRA_EXECUTION_STATUS.md`.*

## EXECUTIVE RESULT

All thirteen **product (code) P0s** in the gap analysis are implemented and tested. The launch-week MVP flow from blueprint §14 now exists end to end: Where are you going? → one route (or up to three options) with its context → Start with MIRA → journey with *I feel unsafe* + Emergency → arrival → one tap. Two items from P1 were pulled forward because the approved execution brief asked for them and they needed no new backend: route alternatives and the viewer → user line. A third, the widened "Was the way lit?", was also pulled forward for the same reason.

What remains is **operations, not code**: hosting, production SMTP, key rotation and budgets, the uptime monitor, and real-device checks (gap analysis P0 1–4 and 13). Until production SMTP is verified, the app already tells the truth on its own: without SMTP it says email alerts aren't switched on and leads with the Share link.

## WHAT WAS IMPLEMENTED

| Gap-analysis P0 | Status | Where |
|---|---|---|
| 5. Promise-led welcome, no "coming soon" | Done | `welcome/Welcome.tsx`, `SignInSheet.tsx`, metadata, manifest |
| 6. "Where are you going?" headline; Start with MIRA; honest private journeys; alerts stated as email | Done | `HomeScreen.tsx`, `TripScreen.tsx`, `MeScreen.tsx`, invite email |
| 7. Emergency pill on Home + journey | Done | `EmergencyPill.tsx`, `domain/emergency.ts` |
| 8. "I feel unsafe" instant sheet, deterministic, no LLM | Done | `UnsafeSheet.tsx` |
| 9. Help Points v0 replacing "Along the way" | Done, plus deterministic ranking | `domain/help-points.ts`, `server/help-points`, provider `helpPlaces()`, `/api/geo/help` |
| 10. "Mapped as lit" wording | Done, plus walker-confirmed share | `LightingSummary.tsx`, `domain/lighting.ts` |
| 11. Mira: options on "uneasy"; no legal/medical instructions | Done | `claude.ts`, `persona.ts` |
| 12. Privacy page accuracy | Done (chat claim fixed; unsafe sheet and on-device route explained) | `privacy/page.tsx` |
| 3 (code part). Mira cap 60/day | Done, plus global daily ceiling | `api/mira/route.ts` |
| 13 (code part). `npm run check` + E2E green | See TEST RESULTS | — |
| P1 pulled forward: route alternatives | Done (Google alternatives verified live in Delhi; OSM alternate) | `google.ts`, `placeholder.ts`, `RouteOptions.tsx`, `routeMinutes` |
| P1 pulled forward: widen "Was the way lit?" | Done (arrived **or** ended, route kept on device) | `TripScreen.tsx`, `lib/trip-route.ts` |
| P1 pulled forward: viewer → user line | Done | `SharedTripView.tsx` |
| Hardening from the audit | Done: alert-send ordering, stale-claim notice, worker watchdog, statement timeout, Google budget with OSM fallback, IPv6 /64 buckets, safety-net status on the journey screen | `journey/worker.ts`, `worker/main.ts`, `geo/budget.ts`, `ratelimit`, `health/safety-net.ts` |

## WHAT CHANGED IN THE USER EXPERIENCE

- **First screen:** "Walk home. Your people will know.", with Before / On the way / If something feels wrong. No AI character headline, and no "coming soon".
- **Home:** the sheet leads with **Where are you going?** (saved places, search) and one line saying who follows and by which channel. *I feel unsafe* and **Emergency 112** sit under the greeting on every Home state, signed in or not. Mira and Report are quiet links; "Around you" is lower.
- **Route sheet:** time · distance · arrive-around. Then a lighting line ("88% mapped as lit · 5% streetlights mapped · 7% not known") and a Help Points line ("12 Help Points along the way · first: Vishwavidyalaya, at the start"). Then **Start with MIRA** with *Share with Mum* / *Just me*, and an honest line about who is alerted. Details follow: lighting sources, the Help Point list in passing order, and save place. When there are alternatives, a comparison appears: time, lighting with its unknown share, Help Points; "Fastest" is the only label, plus "Not a safety rating".
- **I feel unsafe:** opens instantly, with:
  - the nearest Help Point, ranked for right now, plus two more;
  - Send my live link (or start a walk to the destination / Home);
  - Call someone (phone contact picker or typed number);
  - Emergency 112 (the phone's dialler);
  - Talk to Mira, then I'm okay now.

  It makes no model call and waits on no network.
- **Journey:** ETA → **I'm here** → **Send my live link** → I feel unsafe / +10 min → who can follow (honest) → nearest Help Point ahead, with "Directions in Maps". The Emergency pill is under the header. It says "Missed-arrival checks are paused" when the worker is down.
- **After:** "Was the way lit?" (Lit / Partly / Not lit) after night journeys that arrived *or* ended. The viewer page offers "Want MIRA with you on your journeys? Get MIRA".
- **Fixed along the way** (pre-existing, found in browser testing):
  - route fits silently failed on phones (MapLibre padding);
  - the sign-in sheet, search and new sheets rendered under the tab bar;
  - Start was disabled while slow lighting data loaded;
  - Google "hospital" results included labs and doctors, and "hotel" results included PGs (strict primary type plus a conservative name rule).

## WHAT EXISTING BEHAVIOUR WAS PRESERVED

Search, drop pin, and long-press report / walk-here. Saved places (max 10) and trusted contacts (invite, accept, revoke, max 5, encrypted email). Per-contact live links and the Share link. The live viewer (latest point only; arrived → dark after 30 min). Auto-arrival (75 m, 45 s, ≤ 50 m accuracy), +10 min, and end trip. The missed-arrival email exactly once, with the arrived follow-up. The paused-location nudge. The inbox. Reports, PII detection and moderation. Aggregation thresholds and lit-vote trust rules (unchanged values and tables). Account deletion and demo sign-out. The time-of-day theme. The PWA (service worker never caches private paths). The CSP, CSRF and allowlisted public keys (extended only with place and route fields). No new tables, no migrations, no new stored personal data. The planned route stays on the device.

## TEST RESULTS

| Check | Baseline (before) | Final |
|---|---|---|
| `npm run lint` | pass | pass |
| `npm run typecheck` | pass | pass |
| Unit + integration (`npm test`) | 24 files, 169/169 | **27 files, 191/191** |
| Production build | pass | pass |
| E2E (`npm run test:e2e`, mobile + desktop) | 32 passed, 2 skipped | **40 passed, 2 skipped, 0 failed** (9.0 min) |

New coverage:
- Help Point unit tests: classes, plausibility, projection, corridor, sampling, ranking, determinism, and copy without verdicts.
- Limits unit tests: /64 buckets, Google budget.
- `journey-context` integration tests: route order and hours, approximate routes claiming nothing, near-me, `routeMinutes` clamp, safety-net flip, stale-claim notice, Mira 60/day.
- E2E `g-unsafe-and-contribution`, both viewports: unsafe sheet complete in the same frame (< 300 ms) with zero Mira calls; journey sheet; night "Was the way lit?" after ending; location denied.
- `a-share-trip` extended: Emergency on Home and journey, channel line, share choice, viewer invitation.

Browser verification at 375×812 on the production build with live Google Maps: welcome, Home, location denied, the unsafe sheet on Home and on a journey, the Kamla Nagar route with context, the journey screen, and the search overlay. Real devices were **not** tested (see known risks).

## KNOWN RISKS

- **Help Point hours:** Google hours need the pricier Places SKU (owner decision, P1), so Google Help Points say "hours not known". At night, pharmacies, stations and fuel stations are demoted and labelled "may be closed".
- **Place-type quality varies** by city. The conservative rules drop obvious non-Help Points, but a "hospital" may still be a small nursing home. Everything is labelled with its source.
- **Google spend:** up to 5 Nearby calls per route and 2 per near-me lookup. This is bounded per process (default 600/min, then OSM fallback), but not globally. Google Cloud quotas are the hard backstop (ops).
- **Browser limits:** no background location, so the journey needs the screen on (honest copy, wake lock). Call someone's contact picker is Android Chrome only; elsewhere it's a typed number.
- **Unverified on real devices:** iPhone installed-PWA session persistence, Android contact picker, and the Web Share → WhatsApp handoff (audit Phase 6).
- **Community notes** are still drawn as map dots (P1; none exist yet).

## EXTERNAL / OPS BLOCKERS

1. Host web + worker (always-restart supervisor) + Postgres/PostGIS with HTTPS. Run migrations on deploy. Put an uptime monitor on `/api/health/ready`.
2. Production SMTP with a verified domain (SPF/DKIM). Send a real invite and a real missed-arrival email, and confirm both land in a Gmail inbox. **If not verified: launch Share-link-only.** The app already states "Email alerts aren't switched on yet" when SMTP is unset.
3. Rotate all four demo keys and restrict them:
   - Google server key: Places / Routes / Geocoding, plus server IP.
   - Google browser key: domain, plus Map Tiles.
   - Anthropic and Mapillary keys rotated.
   - Set quotas, budgets and alerts, and an Anthropic spend limit.
4. Set `TRUSTED_PROXY_HOPS`. Check that the proxy doesn't log `/t/` or `/invite/` paths.
5. Someone commits to checking `/admin` during the beta.
6. Real-device checks (Android + iPhone + a friend's phone as the contact).

## P1 REMAINING

The P1 list was implemented in a second round (see `MIRA_EXECUTION_STATUS.md` → P1 EXECUTION). What's left of Horizon 1 needs you or a partner, not code:
- **Google sign-in:** needs OAuth credentials. Email sign-in works now.
- **Google Help Point hours:** a pricier SKU, behind `GOOGLE_PLACES_HOURS=on`.
- **The official Google logo asset** on the map.
- **Reviewer sign-off** on `data/locales/IN.json`.

## P2 / P3 NOT TOUCHED

WhatsApp/SMS alerts, native shell / background location, deviation detection, place confirmations, source registry / CAP / GTFS / official feeds, news-derived incidents, transit journeys, locale profiles beyond India, advice cards / Q&A / briefings, itinerary review, emergency-service integration, AI calling, and the Women's Mobility / Safety Index. None was started, and no scaffolding was added for them.

## PRODUCT WALKTHROUGH

1. **First-time user (A):** the link opens to "Walk home. Your people will know." She taps Let's go → Use my location → first name, and lands on Home under **Where are you going?**
2. **Known destination (B):** 🏠 Home → walking time · "arrive around …" → lighting line → Help Points line → **Start with MIRA** (Share with Mum / Just me).
3. **Unfamiliar destination (C):** search "Kamla Nagar Market". The route is drawn and framed; "88% mapped as lit · 7% not known"; "12 Help Points along the way". Alternatives appear when the provider returns them.
4. **Walking alone (D):** Start → **Send my live link** → WhatsApp → her friend opens `/t/…` and sees the dot and ETA. On arrival: "You made it 🎉", and the link says arrived.
5. **Uncomfortable (E):** *I feel unsafe* → the nearest Help Point ("Vishwavidyalaya · Metro / train station · about 5 min · hours not known") → Show / Walk there. Also Send my live link, Call someone, Emergency 112. There's no wait.
6. **Emergency (F):** the pill opens the dialler with 112, from Home or the journey screen, in one tap.
7. **Contribution (G):** a night journey ends → "Was the way lit?" → Partly → "Thank you".
8. **Viewer (H):** after arrival, "Want MIRA with you on your journeys? Get MIRA".
9. **Location denied (I):** a banner explains what's missing (the way from here, Help Points near you) and says search still works. Emergency and *I feel unsafe* stay available ("Turn on location to see the nearest Help Point").
10. **Weak network (J):** route failure → "Couldn't get the walking time — you can still start with MIRA". Upload failure → a banner. A failed Help Point lookup says so, and never "none nearby".
11. **Worker failure (K):** trip start is refused ("paused for a moment"). An open journey shows "Missed-arrival checks are paused". Readiness returns 503. The worker exits for its supervisor to restart it.

## Can a real woman use the current MIRA public beta and experience its actual USP without relying on community scale?

**Yes, once the ops blockers above are cleared, and in the Share-link form even before production email.** The USP is: know the way, keep your people with you until you arrive, and have help one tap away. None of it depends on other users:

- **Route context** comes from Google/OSM routes, OSM lighting and Mapillary poles, with the unknown share always shown (integration-tested; browser-verified on a Delhi route).
- **Help Points** come from Google Places / OSM classes and a deterministic ranking (13 unit tests, integration tests, E2E), not from community data.
- **The journey companion** needs her plus one person with a link. The Share link works with zero setup (E2E `a-share-trip` private journey, viewer test).
- ***I feel unsafe* and Emergency** are local and deterministic (E2E: all actions visible in < 2 s, zero `/api/mira` requests, `tel:112`).
- **Community** only adds: walker lighting votes need ≥ 3 agreeing people before they show. Until then the lighting line honestly reads "mapped as lit" / "not known".

The automatic missed-arrival net is the one piece that depends on something outside the repo, production SMTP. Where it isn't verified, the product already says so rather than promising it.
