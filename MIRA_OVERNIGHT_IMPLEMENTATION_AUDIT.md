# MIRA — Overnight Implementation Audit (Global Day-0 Beta)

*2026-09-26 · branch `feat/global-day0-beta` · compared against the owner's Day-0 brief, `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md` (§1, §5, §7, §8, §9, §16) and `MIRA_EXECUTION_GAP_ANALYSIS.md`. Phase-by-phase evidence is in `MIRA_EXECUTION_STATUS.md`.*

## Verdict

**The product is built and green; the public URL is blocked on two owner actions.**
1. Railway: the account's trial has expired, so a plan must be chosen before any deploy.
2. Google Cloud: an OAuth client is needed for Google sign-in.

Everything else in the Day-0 definition of done is implemented and tested:
- in unit, integration and E2E tests;
- in a live browser check with real Google Maps and real Claude, from simulated locations in India, the UK, the UAE, the US, Kenya, Japan and Peru.

Automatic missed-arrival email additionally needs a Resend key and a verified domain. Until then the app says plainly that nobody is alerted automatically and leads with the share link.

## Definition of done (brief §46) — checked

| Criterion | Status | Evidence |
|---|---|---|
| **GLOBAL**: no India-specific product outside India | ✅ | Live checks (below) |
| **CLEAR USP** | ✅ | See first-session note below |
| **N=1 VALUE** | ✅ | Route + lighting (OSM/Mapillary) + Help Points (Google/OSM) + share link + emergency work with zero community data |
| **JOURNEY** | ✅ | Live Delhi journey: start → live link → accountless viewer → I'm here → "You made it" → one question → viewer shows arrived + Try MIRA. E2E `a-share-trip` |
| **HELP** | ✅ | See Help Points note below |
| **UNSAFE** | ✅ | Opens instantly: Help Points, share / tell my people, call someone, Emergency, other official numbers, location in words, Mira. E2E asserts zero `/api/mira` calls and < 300 ms to render |
| **EMERGENCY** | ✅ | 61 cited country profiles; unknown country explains before dialling (see below) |
| **SHARE** | ✅ | Viewer API and page return 200 with no cookie and set no cookie (curl + integration test) |
| **AI** | ✅ | Sonnet 5 default, chosen by live eval. Live: "Is this neighbourhood safe…" → "I don't have enough verified information to make that judgement"; "Find somewhere staffed nearby" → ranked Help Points with listed hours |
| **COMMUNITY** | ✅ | Anyone signed in can answer MIRA Checks, lighting and corrections; reports stay private |
| **REPUTATION** | ✅ | See reputation note below |
| **PRIVACY** | ✅ | See privacy note below |
| **RELIABILITY** | ✅ | See reliability note below |
| **MOBILE** | ✅ (emulated) | Verified at 375×812 in the in-app browser; **not yet on a real phone** (needs the public URL) |

Notes on the longer rows:
- **GLOBAL.** Live checks: London → "Westminster · Emergency 999"; Dubai → "Downtown Dubai · 999"; New York → "Theater District · tel:911"; Nairobi → 999; Tokyo → 110, with "Ambulance / Fire 119" in *I feel unsafe*; Delhi → 112; Lima (no profile) → "Emergency", which explains before dialling 112. The map starts on the whole world until she's located. Distances are in miles in the US and UK.
- **CLEAR USP.** The welcome screen leads with the locked value proposition word for word. Home is "Where are you going?" plus a before-you-go / on-the-way line. The route card shows time, lighting with its unknowns, Help Points, then Start with MIRA.
- **HELP.** Live London: 12 Help Points along the way. Live Delhi via Mira: "Open 24 hours (listed) · Google", "Open now, listed until 10 PM · Google". Police is not ranked first by default. Hours are looked up only for the ≤ 5 places shown.
- **EMERGENCY.** Unknown-country copy: "doesn't have a checked emergency number for Peru yet… Mobile phones are required to treat 112 as an emergency number…". No 112 is hardcoded.
- **REPUTATION.** Impact counts only verified receipts. There are no points, streaks or leaderboards, and nothing for incident reports. The Steward criteria are listed with what's still needed (live: "25 more verified contributions…").
- **PRIVACY.** No background location. Journeys are purged ≤ 24 h after closing. Habits are learned only from arrivals at saved places, and she can see, switch off and delete them. Signals are unlinkable, and receipt links are encrypted and deleted when decided. The privacy page is updated for all of this.
- **RELIABILITY.** A down worker makes readiness return 503 and refuses trip start. Mira errors fall back to the scripted Mira. Failed Help Point lookups say so. Email with no provider is recorded `not_attempted`, never `sent`.

## Test results

| Check | Baseline | Final |
|---|---|---|
| Lint | pass | pass |
| Typecheck | pass | pass |
| Unit + integration | 30 files, 210/210 | **48 files, 454/454** |
| Production build | pass | pass |
| E2E (mobile + desktop) | 40 passed, 2 skipped | **42 passed, 2 skipped, 0 failed** |
| Live browser QA | — | UK, UAE, US, Kenya, Japan, India (full journey loop), Peru (unknown country) |

## What changed in this sprint (by system)

- **Identity:**
  - Google sign-in (OIDC + PKCE, RS256 JWKS verification, sealed state cookie, session rotation). It stores only the Google id, first name, and email as a hash plus an encrypted copy.
  - Accounts link in this order: same Google account, same verified email, then an in-place upgrade of a first-name account.
  - No sign-in wall: Welcome is two steps and ends on Home signed out.
- **Country Context:** one `CountryContext` shape and 61 cited profiles from official pages only. Left out for lack of a national official source: PK, ET, EG.
- **Home and journey context:** a context card with unknowns and "why not known"; Walk · Ride / car · Transit, with Google DRIVE/TRANSIT ETAs (verified live in London, Dubai and Nairobi).
- **Help Points:**
  - new classes (airport, convenience store where the country weight turns it on);
  - situation-aware deterministic ranking;
  - Google hours only for the shortlist (Place Details, 6 h cache, budgeted), OSM fallback, and Open now / Listed / Not known labels;
  - community-corroborated "gone" places are filtered out.
- **Journey companion:**
  - trip engine unchanged;
  - trip screen hierarchy and a Trips tab;
  - the traveller's time zone in emails, the viewer and the invite page;
  - the viewer's Try MIRA line;
  - one question after arrival.
- **Mira:**
  - Sonnet 5 (live eval: 16/16 tool choice, 5/5 languages, 16/16 safety; Opus slower with no gain; Haiku rejected);
  - global context, Help Point and emergency tools;
  - a multilingual danger regex that fires before any model call;
  - a token budget with the scripted Mira as fallback.
- **Contribute:**
  - tab, MIRA Checks from journey evidence, corrections;
  - the proof-of-usefulness lifecycle and Local Steward foundation;
  - honest report copy, and public aggregate releases off by default;
  - lighting votes are one voice per person per stretch.
- **Personalisation:** explicit travel preference, journey habits, "like usual" only when backed by three or more journeys, and "What MIRA remembers" in Me.
- **Infrastructure:**
  - a Resend HTTPS email provider (SMTP kept for dev);
  - production env validation;
  - HSTS on https, and `form-action` updated for Google;
  - bundled production migrate/import scripts;
  - `docs/DEPLOY.md` with the exact Railway CLI sequence (PostGIS 17-3.5 image, web + worker, health checks).

## Drift check against the blueprint

- **§1 "Claims MIRA never makes":**
  - Kept. Grep shows no "safe route", "safest", "safety score" or "Safe Place" in UI copy.
  - Help Points say "may be closed" and "hours not known".
  - "reviewed by a person" is removed everywhere.
  - "your contacts will be alerted" appears only when email is configured and contacts have accepted.
- **§7 "Community is a sensor network":**
  - Kept. One voice per person, corroboration thresholds, contradiction → nobody credited, decay windows.
  - Raw notes are off the map and out of "Around you"; public releases are off.
- **§8 AI role:** kept. Mira picks relevance from tool results; the emergency path has no LLM. Verdict words are logged for measurement.
- **§9 hierarchy:** "Where are you going?" is primary; Emergency and *I feel unsafe* are always present. The tabs follow the owner's locked Day-0 navigation (HOME · MIRA · TRIPS · CONTRIBUTE · ME), which supersedes the blueprint's Home · Circle · Me.
- **§16 "No gamification":** the owner's brief asked for *impact*, not points. Implemented as verified-only counts plus Steward eligibility, with no leaderboard and no badges for volume. That is consistent with the blueprint's "unless it demonstrably improves accuracy": everything rewarded is corroborated accuracy.
- **Deviation noted:** hotels outrank transit stations at night when station hours are unknown (for example Shibuya). This is honest ("hours not known") but not ideal. P1: operator hours / GTFS.

## Known risks

1. **Real devices untested.** Installed-PWA session on iPhone, Android contact picker, and Web Share → WhatsApp. This needs the public URL.
2. **Help Point data quality varies by city.** Google "hospital" includes private clinics (London: "DIAMOND HEALTH INTERNATIONAL"). Name rules drop obvious doctors, labs and homeopaths, but not all. Every place is labelled with its class and source.
3. **Country profiles need reviewer sign-off** (README rule 4). Some countries have single-service primary numbers, correctly labelled (JP 110 police, SA 999 police, ZA 10111).
4. **Report internals still use IST time bands and Indian plate PII patterns.** Public releases are off, so nothing is published. P1: per-country bands and plate patterns.
5. **Google call budget is per process.** Keep web at 1 replica.
6. **Railway HTTP logs record request paths,** so `/t/<token>` bearer links are visible to project members.
7. **Account deletion plus re-creation** could add a second voice within a place-claim window. Account age is enforced only for Steward.

## External blockers (owner)

1. **Railway plan.** `railway init` → "Your trial has expired. Please select a plan to continue using Railway." Choose a plan, then run `docs/DEPLOY.md` Path A (about 15 minutes).
2. **Google OAuth client.**
   - Google Cloud Console → Credentials → OAuth client ID (Web).
   - Authorised redirect URI: `https://<domain>/api/auth/google/callback`.
   - Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
3. **Resend.** API key, `EMAIL_FROM` on a verified domain (SPF/DKIM), and one real test send.
4. **Key rotation and restriction.** Rotate the demo Google, Anthropic and Mapillary keys. Restrict the server key to Places/Routes/Geocoding and the browser key to the domain plus Map Tiles. Set budgets, and an Anthropic spend limit.
5. **Moderator.** Someone must own `/admin` before `PUBLIC_AGGREGATE_RELEASES=on`.

## Exact P1 items

1. Deploy and run the real-device pass (iPhone and Android, plus a friend's phone as viewer).
2. Transit operator hours (GTFS) so stations rank correctly at night; convenience stores along routes.
3. Per-country report time bands and plate/PII patterns; aggregation per time zone.
4. Reviewer sign-off on `data/locales/*`; PK, ET and EG once a national official source is found.
5. `shareByDefault` preference UI; per-user Help Point preference weights (the architecture exists as `prefer`).
6. Store ride/transit route lines for the trip screen (walks only today).
7. Minimum account age for place signals (anti-gaming).
8. Mira eval re-run after the tool-guide tightening (the "Safe trip!" / "I've set up your walk" phrasing).

## What Codex should audit tomorrow

- **Google sign-in** (`src/server/account/google-auth.ts`, `src/app/api/auth/google/**`): JWKS caching and rotation, `alg` handling, the nonce/state cookie sealing, account-linking edge cases (a demo account deleted on a switch).
- **Contribution privacy** (`src/server/contributions/receipts.ts`, `db/migrations/0013_contributions.sql`):
  - Confirm `subject_enc` is always NULL once a receipt is decided (CHECK constraint).
  - Confirm no query joins receipts to `place_signals` / `lit_votes`.
- **Help Point cost** (`src/server/providers/geo/google.ts` `helpHours`, `src/server/help-points`): the Details calls per request in the worst case, cache keys, and the budget accounting.
- **Country Context data** (`data/locales/*.json`): spot-check every cited URL, especially EU single-service numbers, VN (113 primary), ID (110 primary) and ZA.
- **Mira** (`src/server/providers/companion/*`): prompt-injection via place names in tool results; the verdict-word logging; the token-budget arithmetic.
- **Email** (`src/server/mail/resend.ts`): idempotency and retry semantics on 5xx/timeout (unconfirmed vs failed).
- **Merge seams:** the files touched by several tracks — `HomeScreen.tsx`, `TripScreen.tsx`, `google.ts`, `env.ts`, `trips/index.ts` arrival hooks (`captureCheckEvidence` in the tx, `onTripArrived` after commit).
