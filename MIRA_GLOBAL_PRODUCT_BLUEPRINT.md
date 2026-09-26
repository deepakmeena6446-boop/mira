# MIRA — Global Product Blueprint

*2026-09-26 · written against commit `ba671c3` (main) and `MIRA_LAUNCH_AUDIT.md`. Nothing in the codebase was changed to produce it.*

This is the master document. Four companion documents hold the details:

| Document | Holds |
|---|---|
| **`MIRA_GLOBAL_PRODUCT_BLUEPRINT.md`** (this) | Vision, positioning, user jobs, the four moments, the **capability map of what exists**, product systems (incl. Help Points, "I feel unsafe", the emergency context packet), N=1 value, community and AI roles, UX model, growth loops, open-source model, master capability table, horizons, the MVP, the differentiator |
| `MIRA_SAFETY_CONTEXT_ENGINE.md` | Data sources, the unified context-item model, trust / confidence / freshness / relevance rules, what's deterministic vs AI, output contract |
| `MIRA_GLOBAL_INTELLIGENCE_AND_TRAVEL.md` | Global location context, local advice engine, transport advice, hyperlocal intelligence, destination briefings, travel companion |
| `MIRA_EXECUTION_GAP_ANALYSIS.md` | Every capability classified (exists / UI / logic / data / backend / native / partnership / research / long-term) and ranked P0–P3 |
| `MIRA_FUTURE_RESEARCH.md` | Research only: emergency-service integration, AI emergency calling, the Women's Mobility / Safety Index, global datasets, policy |

The brief also named `MIRA_GLOBAL_PRODUCT_MAP.md`, `MIRA_LOCAL_ADVICE_ENGINE.md`, `MIRA_TRAVEL_COMPANION_BLUEPRINT.md`, `MIRA_LOCAL_INTELLIGENCE_SYSTEM.md`, `MIRA_EMERGENCY_INTEGRATION_RESEARCH.md`, `MIRA_GLOBAL_INDEX_RESEARCH.md` and `MIRA_NETWORK_GROWTH_MODEL.md`. Its section 25 says to create only five documents, so each of those lives as a section: the product map and growth model are in this document (§4, §11), the advice / intelligence / travel documents in `MIRA_GLOBAL_INTELLIGENCE_AND_TRAVEL.md`, and the emergency and index research in `MIRA_FUTURE_RESEARCH.md`.

*Revised 2026-09-26 (correction pass): the role of AI, the index position, incident intelligence and N=1 wording were corrected across all five documents. The owner's own wording is in §8, §16 and `MIRA_FUTURE_RESEARCH.md` R3.*

### Terms used in all five documents

| Term | Meaning |
|---|---|
| **Safety context** | Sourced, dated information about a journey, place or area, including what isn't known. Never a verdict |
| **Context item** | One unit of safety context: a claim + source + recency + confidence + unknowns (engine doc §4) |
| **Evidence systems** / **trust engine** | Everything that establishes whether a claim is supported: source provenance, deterministic rules, corroboration, recency, contradiction, structured confidence, moderation. **Evidence systems determine truth and confidence** |
| **Relevance** | Whether and how an already-evidenced item matters to *this* user *now*. **AI may determine it**, within the evidence gates |
| **Help Point** | A place where help is likely to be available (staffed, open, reachable). Never called a "safe place" |
| **I feel unsafe** | The first-class state and its instant sheet of actions. ("I feel uneasy" is only the existing Mira chat chip) |
| **Emergency pill** | The always-visible button that opens the phone dialler with the emergency number |
| **Start with MIRA** | Starting a journey; sharing with the circle, a link, or nobody is a choice made on start |
| **Location Context** | The system that resolves country/city settings. A **locale profile** is its cited data file for one country |
| **Incident** | A reported event (official, news or community). **An evidence input, never the product UI** |
| **Women's Mobility / Safety Index** | A possible long-term research output (P3), only with rigorous, transparent methodology (`MIRA_FUTURE_RESEARCH.md` R3) |

**Priority scale:** **P0** = required before the public beta · **P1** = completes Horizon 1 · **P2** = Horizon 2, driven by beta evidence · **P3** = research / Horizon 3. Tables use P-labels. "H1/H2/H3" refer to horizons (§13). The detailed list is in `MIRA_EXECUTION_GAP_ANALYSIS.md`, which is authoritative if the two disagree.

---

## Contents

0. [Summary](#0-summary)
1. [Vision and positioning](#1-vision-and-positioning)
2. [User jobs](#2-user-jobs)
3. [The four moments](#3-the-four-moments)
4. [What exists today: capability map](#4-what-exists-today-capability-map)
5. [The product systems](#5-the-product-systems)
6. [N=1 value](#6-n1-value)
7. [The role of community](#7-the-role-of-community)
8. [The role of AI](#8-the-role-of-ai)
9. [UX model and information hierarchy](#9-ux-model-and-information-hierarchy)
10. [Master capability table](#10-master-capability-table)
11. [Network growth model](#11-network-growth-model)
12. [Open source and the global community](#12-open-source-and-the-global-community)
13. [Three product horizons](#13-three-product-horizons)
14. [The MVP, redefined and validated against the repo](#14-the-mvp-redefined-and-validated-against-the-repo)
15. [The differentiator test](#15-the-differentiator-test)
16. [Principles](#16-principles)

---

# 0. Summary

**What MIRA is.** A companion for a woman's movement through the physical world, designed so that: before she goes, it tells her what is known about the way there, and says what isn't known. While she moves, the people she chose can see her until she arrives, and she has Help Points close at hand. If something feels wrong, it puts the next useful action one tap away. Afterwards, a one-tap answer makes the next woman's journey better informed. MIRA never says a place, route or person is safe. It shows the context and lets her decide.

**What the repo already is.** More than a random set of features. It has three real systems:
1. **Trusted-circle journeys**: trip, per-contact live links, auto-arrival, missed-arrival alert, Share link. This is complete (locally; production needs hosting and real email) and the strongest part.
2. **A first safety-context pipeline**: street lighting from three sources, with precedence, thresholds, decay and "say nothing when people disagree". **This is a working small-scale version of the trust engine the global vision needs.**
3. **A careful community pipeline**: private reports → human moderation → thresholded, templated, expiring notes. Correct in design, inert at today's scale.

Around them sit a Claude companion (useful, but in the wrong place for emergencies), a provider abstraction (every external service is swappable, which is what "global" requires), and a strict privacy model.

**What's missing for the global product.** Five capabilities, in order:
1. An "I feel unsafe" state with instant actions and a locale-correct emergency number.
2. Help Points: staffed places ranked by distance, expected staffing and opening status. Today "along the way" is a list of places near the route's midpoint, with no hours.
3. Route context and route alternatives. Today there's one walking route, with lighting as the only context.
4. A location-context layer (per-country emergency numbers, time zone, transport, sources). Today `112` is hardcoded in 7 files and time is hardcoded to IST.
5. Non-walking journeys and real alert channels (push / WhatsApp / SMS). Today it's walking only, and contacts get email only.

**The first public experience.** "Where are you going?" → one route with its context (lighting, Help Points, what's unknown) → Start with MIRA (share or keep private) → trip with *I feel unsafe* and *Emergency* always present → arrival → one tap. Every piece except *I feel unsafe*, Help Points and the emergency pill already exists. Hosting and real email are the gating work, not features.

---

# 1. Vision and positioning

### Vision
> Make travelling and moving through the world safer and better informed for women everywhere.

### North star
> Make it easier for a woman to move through an unfamiliar world with better information, better options, and help close at hand.

### The question MIRA answers
Navigation answers *"How do I get from A to B?"*. MIRA answers:

> **Given that I need to get from A to B: what should I know, which option is better informed for my circumstances, and what help is there if something feels wrong?**

### Positioning
**MIRA is a personal safety-context and journey companion.** It is not an emergency service, a crime map, a navigation app, a chatbot or a tourism guide. It works *alongside* the navigation, transport and messaging apps she already uses. It adds the context those apps don't have and the coordination they don't do.

| MIRA is | MIRA is not |
|---|---|
| Context about the journey she's about to take, with sources and gaps shown | A verdict ("safe route", "unsafe area") |
| Her chosen people seeing her get there, and being told when she doesn't | Surveillance, location history or passive tracking |
| Help Points and actions one tap away | A promise that anyone will respond |
| A network of small, factual observations about streets and places | A feed of crime news or individual reports |
| An AI that works out what matters to *her* journey now and recommends actions, from evidence | An AI that decides whether a safety claim is true, or whether a place is safe |

### Claims MIRA never makes
- that a route, area, place or person is **safe** or **unsafe**;
- that nothing will happen;
- that anyone (a contact, police, MIRA) **will respond**, unless a delivered message or a real integration makes it so;
- that information is current when its source is old;
- that the absence of reports means anything.

These rules are already partly enforced in code: Mira's persona forbids safe/unsafe labels, and the lighting copy says "not a safety rating". §16 makes them product-wide.

---

# 2. User jobs

Jobs are ordered by frequency, because frequency builds the habit that makes MIRA available in the rare moments that matter.

| # | Job ("When I…, help me…, so that…") | Who | Frequency | Moment |
|---|---|---|---|---|
| J1 | When I **walk home or to a regular place**, especially after dark, let the people I trust see me get there and tell them if I don't, so nobody has to remember to text or check | Students, working women, PG/hostel residents | Daily | During |
| J2 | When I'm **going somewhere I don't know**, tell me what's known about the way (lighting, where help is, what's unknown), so I can choose how and when to go | Everyone | Weekly | Before |
| J3 | When **something feels off**, give me the next useful action immediately (a staffed place, my people, emergency) without making me explain | Everyone | Rare, high-stakes | When wrong |
| J4 | When I **arrive somewhere new** (airport, station, new city), tell me the sensible way to get to where I'm staying, from sources I can check | Travellers | Per trip | Before / during |
| J5 | When I'm **planning a trip**, show the safety context of my plan (arrival times, late legs, transport availability, where I'm staying) without scaring me off | Travellers | Per trip | Before |
| J6 | When I **know something useful** (this stretch is dark, this pharmacy is 24h, this entrance is shut at night), let me tell the next woman in seconds, without reporting on people | Everyone | After journeys | After |
| J7 | When **someone I care about** is on her way, let me see she's moving and know when she arrived, without asking her | Contacts (non-users) | Whenever shared | During |

J1 is the habit. J2 and J3 are why the habit matters. J4 and J5 are the travel companion (Horizon 2). J6 is the network. J7 is the growth loop.

---

# 3. The four moments

| Moment | Her need | What MIRA has **today** | What MIRA should do (target) |
|---|---|---|---|
| **BEFORE**: *help me understand where I'm going* | Context for a decision | Search, saved places, **one** walking route, minutes, **lighting bar with sources**, "along the way" places (midpoint, no hours), community notes (none exist) | Route **options** compared on context; Help Points along each; lighting; transit/transport options and hours; relevant current information *only if it changes a decision*; explicit unknowns; destination briefing when unfamiliar |
| **DURING**: *stay with me* | Company and a safety net | Live trip, per-contact links, Share link, ETA, +10 min, auto-arrival, missed alert (email), "location paused" in-app nudge, wake lock | Same, plus: Help Points ahead on the route, *I feel unsafe* always present, deviation / unexpected-stop awareness (opt-in, on-device), push to the traveller, alerts on channels contacts actually read, non-walking modes |
| **WHEN SOMETHING FEELS WRONG**: *help me act quickly* | Fewer decisions, faster action | `tel:112` inside Mira's SOS card, after a missed check-in, and on the report thank-you screen. Chat first (~4 s) | One persistent control → an **instant sheet**: *Go to the nearest Help Point · Share my journey now / tell my people now · Call someone · Emergency (locale number) · Talk to Mira*. No LLM before any action |
| **AFTER**: *help the next woman know more* | Contribute in seconds | "Was the way lit?" (night arrivals only), a 3-tap private report | One contextual question per journey, about **infrastructure, not people** (lit? was it open/staffed? entrance usable?); confirm/correct on shown information; reports stay for when something happened |

---

# 4. What exists today: capability map

*Every meaningful capability in the repo, judged against the global vision. Status follows the audit: WORKING (verified end-to-end, locally), PARTIAL, MOCK, PLANNED, MISSING. "Local only" means it works on the laptop, and production needs hosting and/or SMTP.*

| Existing capability | Current status | What it does today | Current user value | How it fits the global vision | Decision | Future potential |
|---|---|---|---|---|---|---|
| **Map** (`WorldMap.tsx`, MapLibre + Google Map Tiles / OpenFreeMap) | WORKING | Map with her dot, pins, route, lighting glow, notes dots, long-press | Low alone (commodity) | The canvas for context, not the product. Must not become a Google Maps clone | **Change**: map serves the journey; remove community notes from the map (they become route-card text lines, §7) | Context overlays (lighting, Help Points), route comparison |
| **Place search** (`api/geo/search`, Google Places / Photon) | WORKING | Places + addresses, local bias, drop a pin | Medium: the way into a journey | Available worldwide; result quality depends on local Google/OSM coverage | **Keep** | Destination type awareness (airport, station → trigger briefing) |
| **Walking route** (`google.ts walk`, OSM graph, straight-line fallback) | WORKING, **walk only, one route** | Minutes, distance, polyline; "approx." flag | Medium | Core of "Safety-Aware Navigation" but lacks alternatives and modes | **Expand**: alternatives, transit/ride modes | Route comparison on context (§5A) |
| **Lighting** (`domain/lighting.ts`, `server/lighting`) | WORKING (OSM + Mapillary); walker layer PARTIAL (0 votes) | Lit / dark / poles / unknown share along route, with sources; "Was the way lit?" | **Medium-high, differentiated**, works at N=1 where mapped | **The prototype of the Safety Context Engine**: layered sources, precedence, ≥3-voter threshold, 60% agreement, 90-day decay, unknowns shown | **Keep & generalise** (its pattern becomes the engine) | Freshness per source (OSM edit date, Mapillary last-seen), "mapped as lit" wording, possible input to P3 index research (R3) |
| **Live trips** (`server/trips`, `domain/journey.ts`, `TripScreen.tsx`) | WORKING, local only | State machine active→arrived/ended/missed/expired, ETA +25% + 5 min, 4 h cap | **High** | Becomes the **Journey Companion** | **Expand**: modes, route stored for the trip, deviation, Help Points ahead | Travel legs, airport→hotel, itinerary days |
| **Trusted contacts** (`server/account/contacts.ts`) | WORKING, **local only (email)** | Name + email, invite accept, max 5, encrypted email, revoke | High but slow (the contact must act on an email) | Core of the trusted circle | **Change**: channels (push, WhatsApp, SMS) and a lighter accept | Circle roles (who sees what), travel circle |
| **Share link** (owner's native share sheet) | WORKING | Live URL to WhatsApp/SMS with no setup | **High, lowest friction** | The N=1 sharing path, and the **main growth loop** | **Keep & promote** to the first-run path | "Get MIRA" line on the viewer page (§11) |
| **Contact live view** (`/t/[token]`) | WORKING | Dot, ETA, "updated X min ago", arrived → dark after 30 min | High for J7 | The product's best advert | **Expand**: CTA, Help Points near her during *I feel unsafe* | Emergency packet view (§5D) |
| **Auto-arrival** (75 m, 45 s dwell, accuracy ≤ 50 m) | WORKING (foreground only) | Closes the trip, deletes points | High | Journey companion core | **Keep**; native background later | Arrival at hotels/stations, check-in confirmation |
| **Missed-arrival alert** (worker, ETA + 10 min) | WORKING, **local only** | One email per accepted contact, then "arrived" follow-up | **High** (the safety net) | Journey companion core | **Change**: channels; add "tell my people **now**" | Escalation ladder (contacts → optional monitoring partner, research) |
| **Trip location history** (`trip_locations`, last 20 points) | WORKING | ≈ 7 min of breadcrumb at 20 s / 50 m; contacts see the latest point only; deleted at close | Enables live view | Trip-scoped breadcrumb is the right privacy shape | **Keep** (no history beyond the trip, ever) | Breadcrumb in the emergency packet; on-device deviation |
| **Saved places** | WORKING | Home/College/Work chips, exact point stored in plaintext | High (makes J1 one tap) | Habit anchor | **Change**: encrypt at rest (audit P1) | Saved places abroad (hotel), per-trip places |
| **Along the way** | WORKING, low value | Up to 12 places near the route **midpoint**, not tappable, no hours | Low | Raw material for **Help Points** | **Change → Help Points** (§5E) | Ranked staffed places along the whole route |
| **Reports** (`ReportScreen`, `server/report`) | WORKING | 6 tiles, recency, time band, optional encrypted note; PII detection; private | Low for the reporter today | A *signal* input to the engine, never shown raw | **Keep, secondary** | Structured incident signals feeding corroboration |
| **Moderation** (`/admin`) | WORKING, **unstaffed** | Approve/hold/reject/redact/withdraw, suppress releases | Protective | The human-moderation mechanism the vision requires | **Keep**; write a public policy | Moderator roles per region (H3), defamation handling |
| **Aggregation** (`domain/aggregation.ts`, weekly IST Monday) | WORKING (tests) | ≥ 5 independent approved contributors per ~1.2 km cell × band × category → template note | Near zero at launch scale | Correct *shape* of "community as sensor" (threshold, independence, burst rules, expiry) | **Keep**; make its week timezone-aware | Becomes one input into corroboration, not a separate publishing path |
| **Community notes** | PARTIAL (0 ever released) | Orange dot at the cell's centre + template sentence; also listed in "Around you" on Home | None yet | Released notes are aggregated incident reports, so they're **evidence inputs, not UI** (principle 12) | **Change**: off the map and out of "Around you"; a note appears only as a dated text line on a route card when it passes the incident gates (engine §7.7) | One corroborating input to the engine |
| **AI companion (Mira)** (`providers/companion/*`) | WORKING (Claude, scripted fallback) | Chat + tools (nearby, propose trip, check trip, report, SOS card, save home). Never sees coordinates. Tap to confirm | Medium, **harmful in distress** (~4 s) | The **relevance, explanation and recommendation layer** over evidence (never the judge of truth, never the gate to action) | **Change**: secondary entry; later the advice interface over evidenced sources | Local advice Q&A, destination briefings, itinerary review (P2) |
| **SOS** | PARTIAL: `tel:112` inside Mira / after a miss / after a report | Dials 112 | Weak (hard to reach) | Must become the *I feel unsafe* state + emergency pill | **Change** (P0) | Emergency context packet, locale numbers, partner integrations (research) |
| **PWA** | WORKING | Manifest, install card, iOS steps, offline page, service worker that never caches private paths | High for retention | Right for H1 (no store, global reach, linkable) | **Keep**; native shell in H2 for background location | Web Push (iOS 16.4+ installed PWAs support it) |
| **Privacy** | WORKING, one inaccurate claim (chat) | Trip-only location, deletion at close, encrypted emails/narratives, keyed hashes, no analytics | Trust | A **competitive requirement** globally (GDPR, India's DPDP Act) | **Keep; fix the claim** | Privacy as a published, tested contract |
| **Account system** (`api/auth/demo`) | PARTIAL | First-name account in a cookie; sign-out deletes; no recovery | Low friction, fragile | Travel needs durable accounts (a trip abroad spans days and devices) | **Change**: Google / email / passkey sign-in (H1-P1) | Cross-device, travel profile |
| **Notification system** (`providers/notify`) | PARTIAL | SMTP email to contacts; in-app inbox for her | Low (no push) | Journey companion needs reliable delivery in both directions | **Expand**: Web Push → WhatsApp/SMS | Contextual updates during a journey (H2) |
| **Data retention** (`server/retention.ts`) | WORKING | Trips purged 6 h after close, points at close, reports 30 d, chat 30 d, lit votes 120 d | Trust | Decay is also a **truth** mechanism (old ≠ current) | **Keep**; extend to every new signal type | Per-claim validity windows (engine doc) |
| **Worker** (`src/worker`) | WORKING, local only | Missed/expired transitions, alerts, purges, weekly release, heartbeat for readiness | Invisible, critical | Becomes the ingestion + decay scheduler for external sources | **Keep & harden** (hosting, monitor) | Source fetchers, freshness recompute |
| **Location stack** (`location-store.ts`, `geo-input.ts`, rounding in providers) | WORKING | Foreground GPS; ~1 km / ~100 m rounding for provider calls; coordinates never sent to Claude or put in URLs/emails | Enables everything | Correct privacy posture for global use | **Keep**; add a country/locale lookup | Locale resolution (§5H) |
| Provider abstraction (`providers/*`, `modes.ts`) | WORKING | Placeholder ↔ real adapters, honest "real only if key set" | Invisible | **Essential for "global"**: region-specific providers plug in the same way | **Keep; extend the pattern to sources** | City/country connectors (open-source contributions) |
| Time-of-day theme | WORKING | Palette follows the clock | Delight | Calm, non-fear tone | **Keep**, no investment | — |
| Inbox | WORKING | Accepted / missed / paused / welcome | Low | Replaced by push | **Keep until push** | — |
| Rate limits, CSP, CSRF, health | WORKING | Abuse and cost control; readiness depends on the worker heartbeat | Invisible | Required for a public safety service | **Keep** | Env-tunable thresholds |
| Hardcoded India assumptions | — | `112` in 7 files; `Asia/Kolkata` in `lib/time.ts` and `domain/pilot.ts`; IST-Monday aggregation; Hinglish persona; `languageCode: "en"` | — | Conflicts with "don't hardcode an India worldview" | **Change** → Location Context (§5H) | India becomes the first *profile*, not the core |

**Reading the map:** the repo is well organised around one job (J1) and one context signal (lighting). The global product needs the same *patterns* applied to more jobs (J2–J5) and more signals. It doesn't need a rewrite.

---

# 5. The product systems

MIRA should be organised internally around **eight systems**. The five in the brief (A–E) hold up against the repo. Three more are needed to make them work globally and honestly (F–H).

```
                         ┌───────────────────────────────┐
                         │  H. Location Context (global) │  emergency numbers, tz, transport, sources per place
                         └──────────────┬────────────────┘
┌──────────────────────┐  ┌─────────────▼───────────────┐  ┌──────────────────────────┐
│ A. Safety-aware      │◄─┤ B. Local Safety Intelligence├─►│ E. Help Point Engine     │
│    navigation        │  │    (= Safety Context Engine)│  │    (staffed places)      │
└─────────┬────────────┘  └─────────────▲───────────────┘  └────────────┬─────────────┘
          │                             │                               │
┌─────────▼────────────┐  ┌─────────────┴───────────────┐  ┌────────────▼─────────────┐
│ C. Journey companion │  │ G. Contribution & Trust     │  │ D. "I feel unsafe" state │
│  + F. Trusted circle │─►│    (community as sensors)   │  │    + emergency packet    │
└──────────────────────┘  └─────────────────────────────┘  └──────────────────────────┘
```

### A. Safety-aware navigation

**Today:** one walking route (`google.ts walk()` calls Routes API with no alternatives), lighting on it, "along the way" at the midpoint. Refused over 25 km.

**Target:** up to three options for her mode, compared on **context, not verdicts**:

```
To: Priya's PG, Kamla Nagar · now 10:40 PM

┌ Route A · 18 min ─────────────────────────────┐
│ Lighting   ██████████░░░░  71% mapped lit      │
│            ░ 22% not known · ▒ 7% mapped dark  │
│ Help Points 4 along the way · 2 open 24h       │
│ Main road most of the way (road class: P2)     │
│ Recent verified information: none available   │
└────────────────────────────────────────────────┘
┌ Route B · 15 min ─────────────────────────────┐
│ Lighting   ████░░░░░░░░░░  31% mapped lit      │
│            ░ 47% not known · ▒ 22% mapped dark │
│ Help Points 1 along the way (hours not known)  │
└────────────────────────────────────────────────┘
      Sources: OpenStreetMap, Mapillary, MIRA walkers · Google Places
      Not a safety rating. You know your way best.
```

Rules:
- The order is by time (her default), never by an invented "safety" rank. She can re-sort by "most mapped lighting" or "most Help Points".
- Every metric carries its **unknown share**. "71% lit" never appears without "22% not known".
- "Main road most of the way" is shown only if road-class data supports it (Routes / OSM `highway` class), and it's descriptive, not evaluative.
- "Recent verified information: none available" is shown only once a real source exists for that area (P2). Until then the row is absent, not faked.
- **Mechanism:** the metrics (time, lighting shares, Help Point counts) are computed deterministically by the evidence systems (engine doc §9). AI may decide which context lines matter most for her circumstances and may recommend an option with its reasons. It never labels an option safe, and she chooses.

**What it needs:** `computeAlternativeRoutes` in the Routes call (check WALK support per region), running lighting and Help Points for each option (lighting already caches per ~500 m box, so it's cheap), and a comparison UI. Transit and ride options come in P2 (§5C, intelligence doc Part C).

### B. Local Safety Intelligence (the Safety Context Engine)

**Question answered:** *"What should I know about this place, or this journey, right now?"*

**Today:** lighting (3 sources), community notes (0), nearby places (no hours).

**Target:** a single engine that turns many sources into **context items**, each carrying *source, recency, confidence and what's unknown*, and releases only those relevant to *this* journey. Evidence systems decide what is supported; AI decides what, of that, matters to her now. Relevant incidents (a verified transport disruption, an official warning, a road closure, a serious nearby event) are **evidence inputs**. They surface only as concise guidance inside her journey, never as a feed or a map. Full design: `MIRA_SAFETY_CONTEXT_ENGINE.md`. The key decision: **the lighting module's pattern is the engine's pattern.** It has layered sources with explicit precedence, a threshold before community data is shown, agreement rules that stay silent on disagreement, a validity window, and a visible unknown share. Generalise it; don't replace it.

### C. Journey companion

**Today:** the most complete system (see §4). Its limits are the platform (foreground GPS only), the mode (walking only) and the channel (email only).

**Target capabilities, and what each needs:**

| Capability | Exists? | Needs |
|---|---|---|
| Destination, ETA, live journey, trusted sharing, auto-arrival, missed arrival | ✅ | Hosting + SMTP (P0) |
| Journey breadcrumb | ✅ (last 20 points ≈ 7 min, trip-scoped) | Nothing (keep it scoped) |
| **Non-walking modes** (auto, cab, metro, bus, "I'm being driven") | ❌ | Mode picker; manual or transit-derived ETA (`validateNewEta` already validates custom ETAs); lift the 25 km refusal for non-walk modes |
| **Help Points ahead on the route** | ❌ | Help Point Engine (§5E) + route stored for the trip |
| **Unexpected deviation** | ❌: the planned route geometry isn't stored on the journey (only `route_meters`) | Keep the route polyline **on the device** for the trip; the client detects "off route > X m for > Y s" and offers *Share / I'm fine*. The server only learns the fact if she chooses to tell anyone. Opt-in |
| **Unexpected stop** | ❌ | Same on-device approach ("no movement for N min away from destination") → a gentle check-in prompt. Opt-in; most stops are innocent |
| Push to the traveller | ❌ | Web Push (installed PWAs on iOS 16.4+ and Android) |
| Background tracking (phone in pocket) | ❌ **Not possible in browsers** | Native shell (P2). Until then: honest copy, *I'm here* reminder |
| Changing route context (a new alert on her route mid-trip) | ❌ | Engine + push (P2) |
| Travel check-ins (hotel arrival, next-day plans) | ❌ | Travel companion (P2, intelligence doc Part F) |

### D. "I feel unsafe": a first-class state

**Today:** a chip inside the Mira tab, answered by Claude with a clarifying question (audit, scenario D).

**Target:** a persistent, calm control on Home and on the Trip screen. One tap opens a sheet, **instantly and with no network round-trip to an LLM**, because MIRA already knows everything the sheet needs:

```
┌──────────────────────────────────────────────┐
│  You're near Kamla Nagar Market · 10:52 PM   │
│                                              │
│  [ 🏥 Go to the nearest Help Point ] 2 min    │  ← nearest ranked Help Point, opens a walk
│     Hospital emergency · open 24h (Google)   │
│                                              │
│  [ 📍 Tell my people now ]                    │  ← contacts get the live link + "Asha asked
│     Mum, Priya will see where you are         │     you to look now" (not an SOS claim)
│                                              │
│  [ 📞 Call someone ]   [ 🆘 Emergency 112 ]   │  ← locale number; native dialler
│                                              │
│  Talk to Mira · I'm okay now                 │  ← quiet, secondary
└──────────────────────────────────────────────┘
```

Design rules:
1. **Everything on the sheet is deterministic and local-first.** The Help Point comes from the last Help Points fetch (cached for the trip) plus distance. Contacts are known. The emergency number comes from the Location Context (from P1; `112` at P0).
2. **No LLM before an action.** This rule is about speed and availability, not trust: a ~4 s model round-trip (or a network failure) must never delay an action. Mira is the last option on the sheet, not the first.
3. **"Tell my people now"** is new: an immediate alert on the same pipeline as the missed-arrival alert, but user-triggered. It starts a trip automatically if none is running (destination optional). Its wording is care, not SOS ("Asha asked you to check on her"), so a false tap costs little.
4. **Emergency** uses `tel:` on the **native dialler** on purpose. On Android, the phone's Emergency Location Service sends her handset location to 112 where the state has integrated it (UP first, from Dec 2025), and EU phones use AML. A VoIP or app-placed call would lose that (see `MIRA_FUTURE_RESEARCH.md` R2).
5. Calm visual language: not red, no sirens, large targets, readable in the dark, one-handed.

**Staging (matches the gap analysis):** the **P0** sheet has the nearest Help Point v0 (hours may say "not known"), *Share link*, *Call someone*, *Emergency 112* and *Talk to Mira*. **P1** adds *Tell my people now*, Help Point hours, her location in words, and the emergency number via the Location Context interface (India profile; other countries P2). The mock above is the P1 target.

#### The emergency context packet

What MIRA can assemble during an active journey, and who may see it:

| Field | Available today? | Who may see it |
|---|---|---|
| Current coordinates, accuracy, timestamp | ✅ (`trip_locations`) | Contacts via link (latest point only). Shown to *her* in words for reading aloud (P1; not built) |
| Last movement / last GPS update | ✅ (point timestamps, "updated X min ago") | Contacts |
| User-triggered emergency status | ❌ (no state for it) | Contacts: "asked you to check now" |
| Journey origin | ⚠️ start point exists only in the request, not stored | Not needed. Don't store it |
| Destination (name + point) | ✅ | Contacts (name) |
| Planned route | ❌ (only `route_meters`) | Her device only (for deviation). Contacts: optional line on their map, opt-in |
| Recent breadcrumb | ✅ last 20 points (~7 min) | Contacts: **only in an unsafe/missed state**, as a short trail. Today they see the latest point only |
| Deviation | ❌ | Her; contacts only if she shares |
| Trusted contacts | ✅ | Her |
| Nearby Help Points | ❌ | Her (sheet); contacts (in unsafe state: "nearest Help Point is X") |
| Incident description | ❌ | Only if she types it, only to whom she sends it |

**Consent layers:**
- **Technically possible today, no new consent:** show her own location in words (area + nearest named place) on the sheet, to read to a call-taker. Show contacts the live dot.
- **Needs explicit, per-trip consent:** a breadcrumb trail for contacts; the planned-route line for contacts; deviation / stop detection.
- **Can go to trusted contacts** (people she chose): everything in the table, when she triggers it or on a missed arrival.
- **Can potentially go to emergency services:** only through the native call (the handset's ELS/AML location) or a formal integration. Until then MIRA *helps her say it* (location in words, landmark, destination), it doesn't send it.
- **Needs formal integration:** any machine-to-PSAP data (ERSS-112 in India, PEMEA in Europe, RapidSOS-style in the US). Research only (`MIRA_FUTURE_RESEARCH.md` R1). **MIRA never implies it can dispatch anyone.**

### E. Help Point Engine

> MIRA never calls a place "safe". It shows **places where help is likely to be available**: staffed, open, reachable.

**Today:** `nearby()` already knows the right kinds (`police`, `health` (hospital, doctor), `pharmacy`, `metro` (subway / train stations), `bus`, `food`, `shop`). But:
- The Google field mask **excludes opening hours** to stay on cheaper SKUs (`google.ts:12`), so `hours` is always `null` from Google. OSM returns a raw `opening_hours` string that is never parsed.
- "Along the way" samples only the route **midpoint**.
- Nothing ranks by staffing or appropriateness.

**Help Point classes, evaluated honestly:**

| Class | Expected staffing | Hours predictability | Data available | Caveats | Default tier |
|---|---|---|---|---|---|
| Hospital (with emergency department) | 24 h, professional | High | Google `hospital`, OSM `amenity=hospital` + `emergency=yes` | Clinics labelled "hospital" (check the emergency tag) | **1** |
| Police station | 24 h, typically | High | Google `police`, OSM `amenity=police` | Some women won't want police (let her filter). Posts ≠ stations. Country variation | **1** (user-filterable) |
| Staffed transit station (metro/rail) | Staff + other passengers **during service hours** | High (operator timetables / GTFS) | Google `subway_station` / `train_station`; GTFS for hours | Closed at night = not a Help Point at night | **1 while operating** |
| Airport / major station help desk | Staffed while operating | Medium | OSM `information=office` inside a terminal; curated | Location inside large terminals | 1 (curated) |
| Hotel reception | 24 h, usually | Medium-high | Google `lodging` / OSM `tourism=hotel` | Guesthouses may not be staffed at night | 2 |
| Pharmacy | Staffed while open. Some 24 h (often near hospitals) | Low without hours data | Google / OSM + `opening_hours` | Most close at night | 2 if known open, else hidden at night |
| Fuel station | Often 24 h, staffed, lit | Medium | Google `gas_station` / OSM `amenity=fuel` | Staffing and appropriateness vary by country | 2 (locale-weighted) |
| 24-hour convenience store | Staffed | Medium | Google `convenience_store` + hours | Very strong in Bangkok/Tokyo, rare in Delhi (**locale weight**) | 2 (locale-weighted) |
| Cafés / restaurants / shops (open) | People around while open | Low | Google / OSM | "Open" ≠ helpful. It's a busy place, not a help desk | 3 ("busy places") |
| ATM / bank | Often unstaffed at night | — | — | **Not a Help Point** | excluded |
| Verified institutional help centres (e.g. women help desks) | Staffed as stated | Curated | Official lists | Must be verified and dated | 1 (curated) |

**Ranking is deterministic**, so it is instant, predictable and works without a model (the *I feel unsafe* sheet depends on it). Mira may explain the options and recommend one from evidence; she never reorders or delays the sheet. Order candidates by walking time (not straight-line distance), then filter and demote:
- **Exclude** a place if it's *known closed* now, or will close before she'd arrive.
- **Demote** a place if its hours are *unknown* at night (still shown, labelled "hours not known").
- **Prefer** Tier 1 over Tier 2 over Tier 3 when walking times are within ~2 minutes of each other.
- **Prefer** places **ahead** on her route over places behind her (during a trip).
- **Weight** by locale (e.g. 24 h stores in TH/JP; fuel stations in IN), from the locale profile.
- **Honour** her filters (e.g. "no police").
- **Always show** the class, the walking time, and "open 24h · Google" or "hours not known · OpenStreetMap".

**What it needs:** opening hours (`currentOpeningHours` on a higher-priced Places SKU, or OSM `opening_hours` parsed with a library such as `opening_hours.js`), sampling along the whole route, the ranking function, a per-locale class weight table, and later a one-tap "was it open / staffed?" confirmation (§7).

### F. Trusted circle

The audit's wedge: automating "text me when you reach". It stays the **habit** that gets MIRA opened daily. Globally it needs channels people actually read: push to her; WhatsApp and SMS to contacts. (India needs DLT registration for SMS and WhatsApp Business template approval. Other regions have their own rules.) It also needs a faster contact accept, circle roles (e.g. "sees my travel trips"), and the "Get MIRA" line on the viewer page.

### G. Contribution and Trust

Community signals and external sources flow into **one trust pipeline** (§7, engine doc §6). Existing pieces: lit votes (threshold, agreement, decay, keyed pseudonymous voter), reports (private, moderated, thresholded, expiring), burst and independence rules. Missing: confirm/correct on displayed items, place-status confirmations (open / staffed / entrance), source history per contributor (pseudonymous reliability without identity), contradiction handling beyond lighting.

### H. Location Context (global abstraction)

A per-country (and optionally per-city) **profile** that the other systems read, so that India is the first profile and not the core. It covers emergency numbers, women's helplines, time zone, languages, ride-hail and transit operators, Help Point class weights, advice source registry and data-protection regime. It is contributed openly, cited, and reviewed as a **protected area** (a wrong emergency number is a safety bug). Design: `MIRA_GLOBAL_INTELLIGENCE_AND_TRAVEL.md` Part A.

---

# 6. N=1 value

> **MIRA is designed to provide standalone value without community participation. The depth of safety context depends on available data coverage in each location. When reliable information is unavailable, MIRA explicitly says "not known" rather than estimating or inventing an answer.**

Information quality is **not** equal everywhere. Mapping, opening hours, transit data and official feeds vary a lot between cities and between neighbourhoods. MIRA shows its coverage rather than hiding it.

**What the first user can get with no community and no contacts, and where it's available:**

| Value | Source | Available today? (depth depends on local coverage) |
|---|---|---|
| Route + walking time | Google Routes / OSM | ✅ (Google where keyed; OSM fallback is coarser, and "approx." is shown when there's no street network) |
| Lighting context with unknowns | OSM `lit` tags + Mapillary street-light detections | ✅ where mapped. Coverage is uneven (70% "not known" on the audited Delhi route), and it says so |
| Help Points with hours and class | Google Places / OSM | ⚠️ kinds exist; hours and ranking missing (P0/P1) |
| Share link to anyone, which ends itself on arrival | MIRA | ✅ |
| Auto-arrival | MIRA | ✅ (screen on) |
| *I feel unsafe* sheet with the correct local emergency number | MIRA + Location Context | ❌ (P0: sheet with 112; P1: Location Context + India profile; P2: other countries) |
| Transit hours / "is the metro running at 1 AM" | GTFS / operator data | ❌ (P2) |
| Official alerts on her route (weather, disruption) | CAP feeds, GTFS-RT | ❌ (P2) |
| Arrival advice at airports / stations | Curated, cited advice cards | ❌ (P2) |

**With one friend:** everything above, plus live following and the missed-arrival safety net (needs SMTP now, better channels soon).

**Why this matters:** every capability above comes from public or licensed data plus MIRA's own code. Community makes it *more complete* (fills "not known", confirms hours, flags closed entrances). It is never the reason it works. Where data is thin, the honest output is "not known", and that counts as part of the value.

---

# 7. The role of community

### Community is a sensor network, not the source of truth

```
signal (1 tap, about streets/places)
 → validation (schema, rate limit, plausibility: was she actually on that route?)
 → location normalisation (snap to a cell or a place; coarsen to a precision that can't trace a person)
 → time normalisation (day and time band, not exact time)
 → duplicate detection (one voice per person per cell per period: keyed hash, already used for lit votes)
 → source history (pseudonymous reliability: how often does this voice agree with later consensus?)
 → corroboration (≥ N independent voices; independence = different people, spread in time)
 → contradiction (disagreement → say nothing, or show "reports differ")
 → recency decay (per-claim validity: lighting 90 d, "entrance closed" days, hours months)
 → abuse / anomaly (bursts, coordinated accounts, new-account clusters, geographic impossibility)
 → confidence tier (deterministic)
 → relevance (eligible only on her route or destination, in her journey window; AI may decide what matters most to her)
 → user-facing context (aggregate, sourced, dated; never an individual contribution)
```

The lighting and report pipelines already implement roughly two-thirds of these steps. Generalising them is engineering work, not research.

### Which signals are allowed

| Allowed (infrastructure, conditions) | Not allowed (people, groups, perceptions of areas) |
|---|---|
| Lit / partly / dark on the stretch just walked | "This area felt unsafe" ratings |
| Place open / closed / staffed right now | Descriptions of people, groups, communities, who lives somewhere |
| Entrance usable / closed; footpath blocked; construction | Photos of people, vehicles, plates |
| Transport: stop served / not served; pickup zone where stated | Star ratings of neighbourhoods |
| Private report of something that happened (moderated, never shown raw) | Public individual reports |

### Contribution design: confirm and correct beats report
The most valuable contribution is **verifying what MIRA already shows** ("Was Apollo Pharmacy open?" → Yes / No / Didn't go), because:
- the claim came from a source, so the user adds evidence rather than inventing a claim;
- the answer is binary, fast and hard to weaponise;
- it measures source reliability over time (how often Google hours are right in this city).

**Limits:** at most one question per journey, only after arrival, only about something she actually passed, and always skippable. There's no gamification, because points reward volume and MIRA needs accuracy.

---

# 8. The role of AI

> **AI may determine relevance, prioritise information, personalise explanations and recommend actions. AI must never independently determine whether a safety claim is true.**
>
> Truth and confidence come from **evidence systems**: source provenance · deterministic rules · corroboration · recency · contradiction · structured confidence · moderation where necessary.
>
> AI can answer: ***What matters to this user right now?*** AI cannot independently answer: ***Is this place safe?***
>
> **The trust engine determines what evidence exists. AI determines how relevant evidence should be presented to the current user.**

| AI **may** | AI **must never** |
|---|---|
| Decide which evidenced items matter to *this* user on *this* journey now (her time, mode, destination, stated preferences), and in what order | Independently decide whether a safety claim is true, or assign or change confidence |
| Personalise explanations: plain words, her language (Hindi, Hinglish, …), level of detail | Invent safety facts, advice or statistics, or present its own output as evidence |
| Recommend actions from evidence ("the metro's last train is 23:10 and your route from the station is mostly unmapped; you may prefer an app cab from the official pickup zone"), with the evidence cited | Label a route, place, area or person safe or unsafe |
| Answer questions **only from retrieved, cited items** (advice cards, official sources, engine items), and say "I don't have verified information on that" otherwise | Surface an item that failed the evidence gates (source confidence, corroboration where required, validity) |
| Extract *candidate* structured claims from unstructured sources (news, notices) **into quarantine** for the evidence systems | Publish an extracted claim directly to users |
| Help plan (itinerary review, arrival brief) over deterministic outputs | Stand between her and an emergency action (§5D: speed and availability) |
| Draft advice cards for **human** reviewers | Contact anyone, or start or share anything, without her tap (already enforced: tools only return cards) |

**LLM output is never stored as evidence.** It's not a source in the engine, and a model's claim never counts as corroboration. A recommendation is advice to her, not a new fact. **She decides.** Full decision classification: engine doc §9.

---

# 9. UX model and information hierarchy

### What MIRA must feel like
A calm companion that knows where you're going and what's worth knowing on the way. Not a crime map, an emergency app, a government portal, a chatbot, a dashboard, a tourism guide or a maps clone.

### Hierarchy (in priority order)
1. **Where are you going?** (search + saved-place chips): the one primary action.
2. **Your circle status**, one line: "Mum and Priya will follow your journeys", or "Share with anyone when you start".
3. **Emergency** (locale number) + **I feel unsafe**: always present, small, calm.
4. Everything else (Mira, report, places around) is secondary and quiet.

*This section is the Horizon 1 target. What ships at P0 is listed in §14; the tab change, Help Point hours and the next Help Point on the trip screen are P1; the Help Point question at arrival is P2.*

### Home
```
┌──────────────────────────────────────┐
│ Evening, Asha            [Emergency] │  ← 112 at P0; India profile via Location Context at P1; other countries P2; calm pill
│ 7:42 PM · Kamla Nagar     I feel unsafe
│           (map, your dot)            │
├──────────────────────────────────────┤
│ Where are you going?                 │  ← PRIMARY
│ [🏠 Home 18 min] [🎓 College] [+]    │
│ [ Search a place or address…       ] │
│ Mum and Priya follow your journeys ✓ │
│ ──────────────────────────────────── │
│ Ask Mira · Help Points near me       │  ← SECONDARY, quiet
└──────────────────────────────────────┘
       Home        Circle        Me
```
Tabs: **Home · Circle · Me.** Mira moves from a tab to a button (sheet and trip), since it's a way in, not a place. Report moves to long-press, the post-trip screen and Me. In Horizon 2 a **Trips** tab (travel plans) is added.

### Destination → context → start
```
Priya's PG · 18 min walk · arrive ~10:58 PM
Lighting   71% mapped lit · 22% not known          ⓘ sources
Help Points 4 on the way · nearest 24h: St. Stephen's Hospital (6 min in)
[ Route B · 15 min · less mapped lighting ]        ← alternatives, collapsed
────────────────────────────────────────
[  Start with MIRA  ]   share with Mum, Priya ✓   Share a link…   Just me
```
"Start with MIRA" replaces "Share my trip". A journey has value *even when private* (Help Points ahead, *I feel unsafe* with context, arrival), and sharing is a toggle on it. **Private journeys must say plainly that nobody is alerted** (audit P0-3).

### Trip
ETA, who's following, the next Help Point ahead, *I feel unsafe* (large), Emergency (pill), *I'm here*, +10 min. Nothing else.

### Arrival
"You made it 🎉 · Mum and Priya can see you arrived." Then **one** question, chosen by relevance: "Was the way lit?" (night) *or* "Was [Help Point she passed] open?" *or* nothing.

### Tone rules
Plain words, no fear. Never "safe/unsafe/dangerous". Numbers always come with their unknowns. Sources are one tap away, and so is the date. No red except errors. No shields, sirens or SOS iconography as decoration.

---

# 10. Master capability table

| Product capability | User problem | Exists today? | Existing implementation | N=1 value | Needs community? | Needs external data? | AI role | Priority |
|---|---|---|---|---|---|---|---|---|
| Route context | "What's the way like?" | Partial | Route + lighting in route sheet (`api/geo/route`) | High where mapped; "not known" elsewhere | No (improves with) | Maps, OSM, Mapillary | Metrics deterministic; rule order on the card at P0–P1; AI may prioritise and explain lines (through Mira now, on the card with the engine's relevance layer in P2) | P0 |
| Lighting | "Will it be dark?" | Yes | `domain/lighting.ts`, 3 layers | Medium-high where mapped | No (fills unknowns) | OSM, Mapillary | None in computing it (rule-based evidence); may prioritise the line | P0 (relabel), P1 (freshness) |
| Route alternatives | "Is there a better-informed option?" | No | Single route only | High | No | Routes API alternatives | May recommend an option with cited reasons (through Mira; on the card from P2); she chooses | P1 |
| Help Points | "Where can I get help nearby?" | Partial | `nearby()` kinds; midpoint "along the way"; no hours | **High** where places and hours are mapped | No (confirms hours) | Places hours (SKU) / OSM hours | None in the unsafe sheet (deterministic, for speed) | **P0 (v0), P1 (hours + ranking)** |
| Live journey | "Someone should see me get there" | Yes | Trips, worker, `/t/` | High | No | — | None | P0 (hosting) |
| Trusted sharing | Coordination with her people | Yes (email) | Contacts, per-contact links, Share link | High | No | SMTP → WhatsApp/SMS/push | None | P0 (SMTP), P1 (push), P2 (WhatsApp/SMS) |
| Journey breadcrumb | Contacts / responders need recent movement | Partial | Last 20 points, trip-scoped; contacts see only the latest | Medium | No | — | None | P2 (consented trail in unsafe state) |
| "I feel unsafe" | "Something's off, what now?" | No (Mira chip) | Scripted fallback has the right idea (`placeholder.ts:89`) | **High** | No | Help Points | None before action; Mira optional after | **P0** |
| Emergency (call) | Reach help now | Partial | `tel:112`, reachable only from 3 hidden UI spots | High | No | Locale numbers | None | **P0** (pill), P1 (locale) |
| Tell my people now | Get attention before ETA | No | Missed-alert pipeline reusable | High | No | Channel | None | P1 |
| Local emergency numbers | Right number abroad | No (112 hardcoded) | — | High for travellers | No | Curated locale data | None | P1 (interface + India), P2 (other countries) |
| Deviation / unexpected stop | Notice when a journey goes wrong | No | — | Medium | No | — | None | P2 (on-device, opt-in) |
| Non-walking journeys | Auto / cab / metro at night | No | `validateNewEta` exists | High (India nights) | No | Transit (P2) | None | P1 (manual ETA), P2 (transit) |
| Community observations | Fill gaps, correct errors | Partial | Lit votes, reports, notes | Grows | Yes | — | Extraction into quarantine; may flag items for human moderators; never decides moderation | P1 (widen lit), P2 (confirm/correct) |
| Local advice | "How should I get from the airport at 11 PM?" | No | — | High for travellers, where cards exist | No | Official + curated sources | Select relevant cited cards, personalise, recommend; never invent | P2 |
| Transport advice | "Which transport, and is it running?" | No | — | High where transit data exists | No | GTFS, operators, ride-hail availability | Relate evidence to her plan; recommend with sources | P2 |
| Hyperlocal intelligence (incidents as evidence inputs) | "Anything on my route today?" | No | — | Medium where sources exist | No | CAP, GTFS-RT, police/municipal, news | Extract candidates → quarantine; judge actionability and priority for her journey | P2 (official feeds first, then news-derived incidents) |
| Destination briefing | "What should I know about Nairobi?" | No | — | High for travellers, where profiles exist | No | Advisories, locale profile, advice cards | Prioritise and personalise cited items | P2 |
| Itinerary planning | Plan a trip with context built in | No | — | Medium-high | No | All of the above | Prioritise annotations, recommend actions, cite evidence | P2 (late) |
| Global travel | Useful when she travels to another country | Partial | Maps worldwide; India hardcoding | Depends on local coverage | No | Locale profiles | None | P1 (Location Context interface + India profile), P2 (more profiles) |
| Trusted source system | Know where each fact came from | Partial | Lighting sources shown | Foundation | No | Source registry | None (tiers are maintainer decisions) | P1 (model), P2 (registry) |
| Safety context engine | One consistent way to turn data into context | Partial (lighting) | Lighting + notes patterns | Foundation | No | — | Relevance and presentation; never truth (engine §9–10) | P1 (read-model), P2 (ingestion) |
| Women's Mobility / Safety Index | Public, methodical view of mobility and safety conditions | No | — | — | Yes (at scale) | Many | Analysis assist only; methodology decides | P3 (research only) |

---

# 11. Network growth model

Growth should come from the product itself, not ads. Each loop below is judged on its trigger, the benefit to the user, what she contributes, friction, abuse potential and network effect.

| Loop | Trigger | User benefit | Contribution | Friction | Abuse potential | Network effect | Verdict |
|---|---|---|---|---|---|---|---|
| **1. Journey-sharing** (viewer → user) | She shares a journey on WhatsApp | Her people see her home without asking | None (sharing *is* the product) | Very low (Share link needs no setup) | Low (links are per-trip bearer tokens and go dark) | **Direct**: each trip shows MIRA to 1–3 people who care about a woman; many are women with the same need | **Primary.** Missing piece: a quiet "Want your people to see you home too? Get MIRA" on the viewer page (audit P1-2) |
| **2. Reciprocal circle** | Her contact starts using MIRA | Mutual journeys between friends, sisters, roommates | Accepting a circle invite | Low once channels aren't email | Low | Strong among peers (friend groups, hostels) | Follows loop 1 |
| **3. Contribution** (use → tiny question → better data) | Arrival | Better lighting/Help Point data on *her own* regular routes | One tap | ~2 s | Medium (fake votes): defended by thresholds, keyed voter hashes, route plausibility, decay | **Local and dense**: needs ≥ 3 voters per 40 m cell, so it compounds only where many people walk the same streets | Real, but **geographically concentrated**. Seed dense corridors (a campus ↔ metro) instead of scattering launch users across a country |
| **4. Traveller** | Trip to a new city | Arrival advice, Help Points, transport context | Confirm/correct what MIRA showed her ("Was the prepaid taxi counter where MIRA said?") | Low | Medium: travellers are one-time voices, so rely on official-source-first content and treat confirmations as low-weight corroboration | Cross-city: travellers verify curated content that locals and future travellers rely on | H2. Only works once advice content exists; community **verifies** it, it doesn't *create* it |
| **5. Open-source** | A developer, researcher or local expert sees a gap for their city | Their city works better | A locale profile, a source connector, a translation, GTFS wiring, accessibility | Medium (PR + review) | Medium-high (a wrong emergency number, a biased source): mitigated by protected-area reviews and citations | **Geographic expansion without a local team** | H2–H3. The route to wider coverage |
| 6. Institution-adjacent (colleges, hostels, women's groups) | A campus recommends MIRA | Density: lighting fills in on shared corridors | Same as 3 | Low | Low | Accelerates loop 3 | Useful distribution, *not* a dependency |

**Rejected growth tactics:** contact-book scraping, auto-inviting contacts, streaks or points, leaderboards, fear marketing ("X women were attacked here"), shareable simplistic neighbourhood safety scores or unexplained 0–100 ratings.

---

# 12. Open source and the global community

Builds on audit Part 5 (AGPL-3.0, three trust levels, CODEOWNERS, protected areas, principles). The global vision adds **data contributions**, which need the same care as code.

### Open contribution, controlled production

| Contribution | Who can propose | Review | Reaches production when |
|---|---|---|---|
| Code, UI, accessibility, performance | Anyone | Standard (1 review) | A maintainer promotes the release |
| **Translations** | Anyone | A native-speaker reviewer + maintainer | Released with the app |
| **Locale profiles** (emergency numbers, helplines, time zones, operators) | Anyone | **Protected**: 2 reviews, **every value cited** to an official source, with a retrieval date | Released, then re-verified on a schedule (engine: `last_verified`) |
| **Source registry entries** (a city's transport operator, police alerts account, municipal feed) | Anyone | Maintainers assign the **tier**, contributors don't | After a staging trial where output goes to quarantine only |
| **Connectors** (GTFS, CAP, operator APIs) | Anyone | Standard code review + protected data review | Runs in staging, output quarantined, then promoted |
| Public datasets (lighting surveys, infrastructure) | Researchers, cities | License check + methodology note | Enters as a structured source with its own tier |
| Map fixes | Anyone | **Upstream in OpenStreetMap**, under OSM's rules | Next OSM fetch |
| Safety research, moderation improvements | Anyone | Protected | Maintainer decision, in writing |

### Nobody outside the maintainers can change
Production trust parameters (thresholds, decay windows, tier weights), emergency workflows, privacy and retention, location handling, moderation thresholds, the source tier assignments, or production secrets. **Defaults are public; production values can be private overrides** (audit Part 5 §1) so that abusers can't tune against them.

### Governance additions for a global project
- **Regional maintainers** (P3) for locale data and moderation in their language. They hold review rights for their region's data, not global production.
- **A published "not doing" list** (audit Part 5 §6), extended with: simplistic neighbourhood safety scores, unexplained 0–100 safety ratings, rankings driven by raw community sentiment, ratings of people or demographic groups, fear-based red/green maps, crime-news feeds, people-reporting, passive tracking, and AI-asserted safety facts. (A research-backed Women's Mobility / Safety Index is *not* on this list; it's P3 research, principle 8.)
- Women who use MIRA outrank contributors who don't: user-panel evidence weighs more than upvotes.

---

# 13. Three product horizons

### Horizon 1: MIRA NOW (P0 = public beta; P1 completes it)
**Target:** *she understands MIRA's difference on her first journey.*

| Layer | Content |
|---|---|
| **User experience** | **P0:** Where are you going? → one route with context (lighting + unknowns, Help Points v0, walking time) → Start with MIRA (share with circle / link / private) → trip with *I feel unsafe* + Emergency → arrival → one tap. **P1 adds:** Help Point hours and ranking, *tell my people now*, location in words, route alternatives, the next Help Point on the trip, push notifications, durable sign-in, non-walking journeys with a manual ETA, and the emergency number via the Location Context interface |
| **Required systems** | Journey companion (exists), trusted circle (exists), lighting (exists), Help Points v0 (P0) → with hours and ranking (P1), the *I feel unsafe* sheet and Emergency pill (P0), Location Context interface + India profile (P1), ContextItem read-model (P1) |
| **Required data** | Google Places / Routes / Tiles, OSM, Mapillary; opening hours if the SKU is accepted (otherwise "hours not known") |
| **Engineering dependency** | P0: hosting web + worker + PostGIS, HTTPS, production SMTP with a verified domain, key rotation and budgets, uptime monitor (audit O1–O9). P1: Web Push, Google/email sign-in |
| **Trust dependency** | Honest copy (audit P0-1…P0-5); nothing implies alerts that won't happen; lighting labelled "mapped as lit"; Help Point hours source-labelled; someone checks `/admin` or the report copy changes |

### Horizon 2: MIRA TRAVEL COMPANION (P2)
| Layer | Content |
|---|---|
| **User experience** | Transit journeys with transit-derived ETAs (manual-ETA modes arrive in P1); WhatsApp/SMS alerts; arrival briefs for airports and major stations; destination briefings; local advice Q&A grounded in cited cards; itinerary safety context; contextual updates during a journey (official alerts on her route); native app with background location |
| **Required systems** | Safety Context Engine with ingestion; source registry; locale profiles for launch countries; local advice engine; transit data layer; notification service; native shell |
| **Required data** | GTFS / GTFS-RT per city; CAP alert feeds; government travel advisories; curated advice cards per airport/station/city; locale profiles; opening hours |
| **Engineering dependency** | Builds on P1's durable accounts and push; a source-fetcher framework in the worker; `context_items` table; native iOS/Android shells; WhatsApp Business / SMS providers |
| **Trust dependency** | Source tiers enforced; freshness shown; human review of advice cards; contradiction handling; incident gates (engine §7.7); AI relevance and recommendations only over evidenced, cited items, with evals |

### Horizon 3: MIRA GLOBAL NETWORK (P3 / research)
| Layer | Content |
|---|---|
| **User experience** | MIRA has useful depth in most places a woman travels, with coverage shown per place; community context is dense in many cities; emergency escalation integrates with public-safety systems where partnerships exist |
| **Required systems** | Global safety-context graph; many city/country connectors (much of it open-source contributed); regional moderation; emergency-service integration (standards-based data push); research platform; the Women's Mobility / Safety Index, only if the research supports it |
| **Required data** | Large-scale corroborated community signals; official datasets; partner data |
| **Engineering dependency** | Multi-region hosting and data residency; connector sandboxing; data governance tooling |
| **Trust dependency** | Published methodology; independent review; bias audits; transparency reports; a formal emergency-integration certification where required |

---

# 14. The MVP, redefined and validated against the repo

> If MIRA launched publicly this week, what's the smallest experience that shows the eventual global product, rather than a random subset of features?

The proposed flow, checked step by step against the code:

| Proposed step | Repo reality | Verdict |
|---|---|---|
| WHERE ARE YOU GOING? | ✅ Search + saved places | **Keep.** Make it the Home headline |
| ROUTE OPTIONS | ❌ One route (`google.ts walk()`, no alternatives), walking only | **Change for this week → one route with context.** Alternatives are the first thing after launch (small: one Routes flag, a lighting call per option, a comparison UI). Faking choice with one option would undermine trust |
| SAFETY CONTEXT: lighting | ✅ | **Keep.** Relabel "Lit" → "Mapped as lit" when it comes from OSM/Mapillary |
| SAFETY CONTEXT: help points | ⚠️ Kinds exist; no hours, midpoint only, no ranking | **Build v0 this week:** sample along the route, filter to Tier 1–2 classes, label "hours not known" where unknown. Hours and ranking follow |
| SAFETY CONTEXT: relevant current information | ❌ No source exists; community notes = 0 | **Drop from the MVP.** Showing an empty "no information" row on every route teaches her the row is meaningless. It returns in P2 with real sources |
| START WITH MIRA | ✅ (as "Share my trip") | **Keep, reframe:** a journey with sharing as a toggle; private journeys stated honestly |
| journey tracking / trusted sharing | ✅ locally; **email-only, no production SMTP** | **Keep.** SMTP is a launch gate. If it isn't verified, launch Share-link-only and say so (audit) |
| contextual assistance | ❌ | **Drop from the MVP** (it needs the engine and push) |
| I FEEL UNSAFE → help point / contact / emergency | ❌ Mira chip; `112` hidden | **Build this week:** sheet + Emergency pill. At P0 the sheet offers *Share link* + *Call someone*; *Tell my people now* is P1 (§5D staging) |
| ARRIVAL → tiny contribution | ✅ but only on *arrived* at night with the route loaded | **Keep**; widen the trigger (audit P1-1) |

### The launch-week MVP

```
WHERE ARE YOU GOING?                (exists)
        ↓
ONE ROUTE + ITS CONTEXT             lighting (exists, relabel) · Help Points v0 (new, small) · what's not known
        ↓
START WITH MIRA                     circle / Share link / private — honest copy (exists + copy)
        ↓
JOURNEY                             live link · auto-arrival · missed-arrival email (exists; needs hosting + SMTP)
   I feel unsafe  ·  Emergency      (new: instant sheet, pill)
        ↓
ARRIVAL → one tap                   (exists; widen trigger)
```

**Why this set, not a smaller one:** it's the smallest flow that shows all four moments (Before → During → When wrong → After), the product's core idea (context, not verdicts), and N=1 value, with community as an improvement. Drop any row and one moment disappears.

**Why not a larger one:** travel advice, alerts and itineraries need sources, review and evidence systems that don't exist yet. Without them, the AI would have nothing to prioritise but its own claims, which violates principle 10.

---

# 15. The differentiator test

| Question | Answer | Strength today → target |
|---|---|---|
| **Why MIRA instead of Google Maps?** | Maps answers "how to get there". MIRA shows how much of each way is mapped as lit, and will show Help Points along it and whether they're open (hours from P1), keeps her people with her until she arrives, and gives her one-tap help. None of that is Maps' job | Medium (lighting only) → **strong** with Help Points + alternatives + *I feel unsafe* |
| **Why instead of WhatsApp live location?** | WhatsApp doesn't know where she's going, doesn't notice arrival, can't tell anyone when she *doesn't* arrive, and keeps running for its fixed 15 min / 1 h / 8 h | **Strong today** (needs SMTP, then better channels) |
| **Why instead of a travel app?** | Travel apps optimise attractions, cost and time. MIRA adds arrival-time context, official transport options, staffed transit, Help Points near where she's staying, and a companion for the late legs | Absent → strong in H2. **Weak today: don't market travel yet** |
| **Why instead of Googling "Is X safe for women?"** | Search returns anecdotes, old news and forum fear, undated and unlocated. MIRA gives cited, dated, location-specific context and says what's unknown, and it never gives a verdict | Absent → strong in H2 (advice engine). Weak today |
| **Why keep it installed at home?** | The daily walk or commute home is one tap, and nobody has to text "reached" | **Strong** (the audit's wedge) |
| **Why use it in another country?** | The right emergency number, how to get from the airport, whether transit runs at night, Help Points near the hotel, her people following her | Absent → strong in H2. Today only maps + sharing work abroad, and the only number shown is 112, which in many countries is not the number local people know |
| **Why contribute?** | One tap, at a moment of relief, about streets not people, and it improves *her own* regular routes first | Medium; honest as long as nothing over-promises |
| **Why trust MIRA's information?** | Every item shows its source and what's unknown, and will show its date (lighting freshness, P1). Nothing is a verdict. Evidence systems, not AI, decide what's supported. Community data needs independent agreement, and the code will be open (open-source readiness, P1) | **Strong design**; must be kept as the product grows |

**Weak answers today:** travel, "Is X safe?", and abroad. These are exactly Horizon 2. The architecture covers them (Location Context + engine + advice), and none can be faked in the MVP. **The MVP should be marketed only on the strong answers:** the walk home, the missed-arrival net, lighting and Help Points, and one-tap help.

---

# 16. Principles

The audit's seven principles (Part 5 §7) remain. The global vision adds six:

8. **Context, not verdicts.** MIRA shows sources, recency, confidence and unknowns. It never says safe/unsafe. MIRA will never build simplistic neighbourhood safety scores, unexplained 0–100 safety ratings, rankings driven by raw community sentiment, ratings of people or demographic groups, or fear-based red/green maps. A Women's Mobility / Safety Index may come later **only** if rigorous research and a transparent methodology support it (P3; `MIRA_FUTURE_RESEARCH.md` R3).
9. **Standalone value, honest coverage.** MIRA is designed to provide standalone value without community participation. The depth of safety context depends on available data coverage in each location. When reliable information is unavailable, MIRA explicitly says "not known" rather than estimating or inventing an answer. Community makes it better; it is never the reason it works.
10. **Evidence decides truth; AI decides relevance.** Truth and confidence come from evidence systems (source provenance, deterministic rules, corroboration, recency, contradiction, structured confidence, moderation where necessary), and authority depends on the claim type. AI may determine relevance, prioritise, personalise and recommend actions. It must never independently determine whether a safety claim is true, and its output is never evidence.
11. **Old is not current.** Every item has a validity window. Expired items disappear; dated items say their date.
12. **Incidents are evidence inputs, not the product UI.** A verified transport disruption, official warning, road closure or serious nearby event may surface as concise guidance **only** if it passes geographic relevance, temporal relevance, source confidence, corroboration where appropriate, and actionability. Never doomscroll feeds, raw crime maps, sensational alerts or neighbourhood stigma.
13. **Global by profile, local by data.** The core is country-neutral; each country is a cited, reviewed profile. India is the first profile, not the default worldview.
