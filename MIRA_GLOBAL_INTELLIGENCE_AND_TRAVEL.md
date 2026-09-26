# MIRA — Global Intelligence & Travel

*2026-09-26 · design document for Horizon 2 (P2), apart from Part A (Location Context interface + India profile: P1), C.3's manual-ETA journeys (P1) and F.4's sheet (P0/P1). Nothing here is built. It combines the local advice engine, transport advice, hyperlocal intelligence, destination intelligence, the travel companion, and the global location abstraction. Every piece feeds the Safety Context Engine (`MIRA_SAFETY_CONTEXT_ENGINE.md`) and obeys its trust and relevance rules: **evidence systems decide what is true and how confident; AI may decide what is relevant to her, prioritise, personalise and recommend actions, but never independently decides whether a safety claim is true.** Depth varies by location with data coverage; where reliable information is missing, MIRA says "not known".*

> **Examples in this document are illustrative.** Place-specific statements ("prepaid taxi counter at arrivals", emergency numbers, operator names) show the *shape* of an item. None may ship without a cited, dated source checked by a reviewer.

---

## Contents
- **Part A** — [Global location context](#part-a--global-location-context)
- **Part B** — [Local advice engine](#part-b--local-advice-engine)
- **Part C** — [Transport advice](#part-c--transport-advice)
- **Part D** — [Hyperlocal news & incident intelligence](#part-d--hyperlocal-news--incident-intelligence)
- **Part E** — [Destination intelligence](#part-e--destination-intelligence)
- **Part F** — [Travel companion blueprint](#part-f--travel-companion-blueprint)
- **Part G** — [Rollout by geography](#part-g--rollout-by-geography)

---

# Part A — Global location context

### A.1 The problem in the code today
| Hardcoded assumption | Where |
|---|---|
| Emergency number `112` | `MiraChat.tsx`, `TripScreen.tsx`, `ReportScreen.tsx`, `privacy/page.tsx`, `persona.ts`, `claude.ts`, `placeholder.ts` |
| Time zone `Asia/Kolkata`, "IST" labels | `src/lib/time.ts`, `src/domain/pilot.ts` |
| Weekly release on IST Mondays | aggregation job |
| Language: English + Hindi/Hinglish persona; `languageCode: "en"` in Google calls | `persona.ts`, `google.ts` |
| Pilot bounds (DU North Campus) | `domain/pilot.ts` (placeholder map data only) |

`112` does connect to emergency services on most mobile networks worldwide (a GSM standard), but it isn't the number local people know. It isn't guaranteed everywhere. And it doesn't give local women's helplines or tourist police.

### A.2 The locale profile (Location Context data)
A versioned, cited data file per country (`data/locales/<ISO-3166-1>.json`), with optional subdivision and city overrides (`IN-DL`, `IN-UP`, `KE-30`…). It's read through one server function, `locationContext(point)`. That function resolves the country from reverse geocoding (Google already returns the country component; cache by ~10 km cell) and falls back to the device locale.

```jsonc
{
  "iso": "IN",
  "version": "2026-10-01",
  "emergency": {
    "general": { "number": "112", "sms": true, "source": "<official URL>", "verified": "YYYY-MM-DD" },
    "police": { "number": "…", "source": "…", "verified": "…" },
    "ambulance": { "number": "…", "source": "…", "verified": "…" },
    "women_helpline": [{ "number": "…", "name": "…", "scope": "national|state", "hours": "24h", "source": "…", "verified": "…" }],
    "tourist_police": null,
    "notes": ["Android phones may send handset location to 112 automatically where the state has integrated it (ELS)."]
  },
  "timezone": "Asia/Kolkata",           // or per subdivision for multi-zone countries
  "languages": ["en", "hi"],
  "units": { "distance": "km" },
  "ride_hail": [{ "name": "…", "modes": ["car","auto","bike"], "cities": ["…"], "source": "…" }],
  "transit": [{ "operator": "…", "city": "…", "gtfs": "<feed URL|null>", "gtfs_rt": "<feed URL|null>", "license": "…" }],
  "help_point_weights": { "fuel": 1.0, "convenience_24h": 0.3, "hotel": 0.8 },
  "advice_sources": ["<source registry ids>"],
  "data_protection": "DPDP Act 2023",
  "reviewers": ["@locale-reviewer"]
}
```

**Rules:**
- **Every value is cited** with a retrieval date. No citation, no merge.
- **Protected-area review** (2 approvals). A wrong emergency number is a safety bug.
- **Re-verification** yearly, or when a source changes. The engine shows `last_verified` to reviewers, not users.
- **Fallback:** if a country has no profile, the Emergency pill shows `112` with the line "Emergency number for this country not confirmed in MIRA yet. 112 works on most mobile networks." It's honest, and it's still one tap.
- **Time** always comes from the IANA zone of the *place*, shown with the local abbreviation (never a hardcoded "IST").

### A.3 What else becomes location-aware
- The **Help Point Engine** reads `help_point_weights` (24 h convenience stores matter in Bangkok, fuel stations in Delhi).
- The **aggregation week** runs per profile time zone.
- **Mira** replies in the user's language. The profile only suggests defaults.
- **Advice and source registries** are per profile (Parts B, D).
- The **legal regime** (GDPR, DPDP…) determines retention and consent copy where laws differ.

---

# Part B — Local advice engine

### B.1 What it is
A curated, cited knowledge base of **practical, location-specific advice items**, plus a question-answering layer that answers **only** from those items and from engine context. It isn't a web-search chatbot. The cards and engine items are the evidence. The AI chooses which of them matter for her question and circumstances, explains them, and may recommend an action. It never adds a fact that no card or item supports.

A woman asks: *"I'm landing in Delhi at 11 PM. What's the sensible way to reach my hotel?"*

MIRA answers from items like:
```
advice_card:
  subject: place: Indira Gandhi International Airport, Terminal 3 (arrivals)
  claim: advice
  text: "Official transport options at arrivals: [metro line + last train time],
         [prepaid / app-cab pickup zones: location as stated by the airport operator]."
  sources: [airport operator page (URL, retrieved date), metro operator timetable (GTFS)]
  valid_until / review_by: <date>
  reviewer: <regional reviewer>, reviewed <date>
  contradictions: none
```
…and deterministic context: whether the metro is still running at her landing time (GTFS), Help Points near her hotel, the hotel's distance and mode options.

The reply, with each part citing its source:
> "At 11 PM the Airport Express metro [runs until … · DMRC timetable] — check the last train for your arrival time. App cabs pick up from [zone, per the airport's page]. Your hotel is 40 min by car; I can share the ride with Mum when you start."

If no card exists: *"I don't have verified advice for this airport yet. The airport's official transport page is here. Want me to share your ride with someone when you leave?"*

### B.2 Source hierarchy for advice
The general hierarchy (engine §5.1) applies, with the claim-specific authority matrix (engine §5.2). For advice specifically:

| Tier | Source | Used for | Never used for |
|---|---|---|---|
| 1 | Government, police, transport authorities | Official transport, emergency numbers, official warnings, rules | — |
| 2 | Official tourism boards, embassies, consular advisories (e.g. UK FCDO, US State Dept, Canada, Australia Smartraveller) | Region-level travel context, common scams **as they describe them**, entry-level practicalities | Street-level claims (too coarse) |
| 3 | Official operators (airports, metro, rail, ride-hail companies about their own service) | Pickup zones, hours, official counters, fares policy | Claims about other services or areas |
| 4 | Reliable local authorities (universities, civic bodies) | Campus / local practicalities | — |
| 5 | Reputable news | Recent changes (e.g. a service suspended) with a date | Base rates, area reputations |
| 6 | Verified structured providers (Google, OSM, GTFS aggregators) | Hours, locations, service patterns | Advice |
| 7 | MIRA corroborated community evidence | **Confirming or correcting** existing cards ("pickup zone moved") | Creating advice on its own |
| 8 | Anecdotal (forums, blogs, social) | **Leads for reviewers only**, labelled | Anything shown to users |

**Never:** turning Reddit or blog anecdotes into advice. An anecdote can trigger a reviewer to look for an official source. It can't become a card.

### B.3 Advice card lifecycle
```
lead (anecdote / user question with no answer / new city)
 → draft (human, or AI-drafted from cited tier 1–5 sources, with exact quotes)
 → review (regional reviewer checks every citation; rejects anything not supported)
 → published with review_by date (≤ 6 months)
 → community confirmations and corrections accumulate
 → contradiction (official change or ≥ 2 independent corrections) → flagged → re-review
 → expiry at review_by unless re-reviewed → hidden (never shown stale)
```

### B.4 Required fields on every card
`subject` (place/area/region) · `text` (short, factual, no verdict words) · `sources[]` (URL, publisher, published/updated date, retrieved date, quoted span) · `valid_from` / `review_by` · `confidence` tier · `contradictions[]` · `reviewer` + `reviewed_at` · `languages`.

### B.5 Question types, and what can answer them

| Question | Answered by | AI role |
|---|---|---|
| "Should I use Uber, Bolt, Grab, an official taxi, metro or local cabs here?" | Locale profile (which operate here) + operator cards + GTFS hours | Select the options relevant to her time and destination; may recommend one, citing the evidence (e.g. last train already gone); never an unsupported preference |
| "Is public transport running at 1 AM?" | **GTFS calendar**: deterministic | Relate the answer to her plan ("the last train leaves before you land") |
| "Is this station staffed at night?" | Operator card, or class default ("staffed during service hours" per operator) | Explain; "not known" if absent |
| "What should I know travelling alone here as a woman?" | Advisory items (tier 2) + emergency numbers + transport cards + women's helplines | Prioritise what matters for her dates and plans; condense into a briefing **with citations**; no generalisations beyond sources |
| "Which entrance should I use?" | Operator / curated card, or closure items | Explain and recommend the entrance the evidence supports; "not known" if absent |
| "Common scams relevant to women here?" | Tier 2 advisories and tier 1 police notices only | Quote or condense; never from forums |
| "Is X safe?" | **No verdict** from any source. Redirect to evidenced context: lighting, Help Points, transport options, official advisories | Choose the context that matters for her situation; the no-verdict line. AI cannot independently answer "is this place safe?" |

---

# Part C — Transport advice

### C.1 Modes MIRA must understand
Walk · public transit (metro, rail, bus, tram, ferry) · ride-hail (app-booked) · official taxi / prepaid counters · informal transport (autos, shared vans, boda-boda, tuk-tuks) · being driven by someone she knows.

### C.2 What can be known, and from where

| Question | Source | Deterministic? |
|---|---|---|
| Does this line run at this time? First/last departure? | GTFS static | Yes |
| Is it running *now*, or disrupted? | GTFS-Realtime (alerts, trip updates) / operator feeds | Yes |
| Which ride-hail services operate in this city? | Locale profile (cited) | Yes |
| Where is the official pickup zone? | Airport / station operator (advice card) | Curated |
| How far is the walk from the stop to her destination, and how is it lit? | Routes + lighting (existing) | Yes |
| Is the station a Help Point at this hour? | GTFS hours + class rules | Yes |
| Transit route options | Google Routes API `TRANSIT` mode (supported by Routes API) or an open router (e.g. OpenTripPlanner on GTFS) | Yes |

### C.3 Journey companion for non-walking modes
- **Mode picker at start**, with ETA from transit or ride estimates, or manual ("I'll be there by 11:30"). `validateNewEta` already validates custom ETAs, and the 25 km refusal (today applied to every route, `api/geo/route`) will apply only to walking.
- **Ride journeys:** encourage sharing with her circle; optional "vehicle details" field (typed by her, trip-scoped, deleted at close, shown only to her contacts). Never scrape ride-hail apps.
- **Transit journeys:** legs (walk → station → ride → walk). Help Points and lighting apply to the **walking legs**. Arrival detection on the final leg.
- **Missed-arrival** logic is unchanged: ETA + grace → alert.

### C.4 What MIRA doesn't do
Recommend a specific driver or company as "safe". Rank ride-hail services by safety. Claim knowledge of a driver. MIRA shows the **official** options and lets her choose.

---

# Part D — Hyperlocal news & incident intelligence

### D.1 Purpose
Make sure that **important, current, specific, movement-relevant** information about her route, destination or transport isn't missed. **Not** to show a stream of crime news.

> **Incidents are evidence inputs, not the product UI.** The Safety Context Engine *should* ingest relevant incidents and hyperlocal information when trustworthy and actionable. If a verified transport disruption, official warning, road closure, serious nearby event or other recent condition could materially change her journey, MIRA may surface concise contextual guidance. It never creates doomscroll feeds, raw crime maps, sensational alerts or neighbourhood stigma.

**Priority (matches the gap analysis):** official structured feeds first (CAP, GTFS-RT, police and municipal notices): P2. News-derived incidents, behind quarantine and corroboration, follow in P2 once the official pipeline works.

### D.2 Sources to ingest (in order of adoption)

| Order | Source type | Format | Example (to verify per city) | Notes |
|---|---|---|---|---|
| 1 | Weather and hazard warnings | **CAP** (Common Alerting Protocol) | National met services and alerting authorities; India's NDMA CAP-based platform | Structured, polygon-scoped, with expiry. The easiest first source |
| 2 | Transit disruptions | **GTFS-Realtime** alerts / operator notices | City open-transit-data portals, operator feeds | Structured, stop/line-scoped |
| 3 | Official public-safety and police notices | RSS / web pages / official social accounts | City police, municipal corporations | Semi-structured; closures and advisories are the useful part |
| 4 | Municipal notices | RSS / PDFs / pages | Road works, closures, events | Semi-structured |
| 5 | Global disaster alerts | GDACS | — | Region-scale; briefings only |
| 6 | Reputable news | Publisher RSS; a news index (e.g. GDELT) for discovery only | — | Unstructured. AI extraction → quarantine → corroboration |
| — | Community signals | MIRA | — | Via the engine (never a feed) |

**Copyright:** store metadata, the extracted structured claim and a link, never article text beyond a short quoted span for reviewers.

### D.3 The pipeline

```
fetch (worker, per source registry cadence)
 → parse (CAP / GTFS-RT: structured; news: AI extraction into candidate claims + source span)
 → classify claim type (controlled vocabulary; rules first, AI assist for unstructured)
 → geo-normalise (precision recorded, never upgraded)
 → time-normalise (observedAt vs publishedAt)
 → cluster (one event across many outlets)
 → trust (engine §6: tiering, corroboration, contradiction, decay)
 → store as context_items with validUntil (purged at expiry)
 → surfaced ONLY through relevance (engine §7): eligible (on her route/destination, in her journey window, affects her mode, specific), then judged actionable for her (AI, with rule-based fallback)
```

### D.4 The gates (every surfaced incident passes all of them)

| Question | Gate | Example pass | Example fail |
|---|---|---|---|
| Is it geographically relevant? | Intersects her corridor / destination / transit legs, at the source's precision | Closure on the street she'll walk | An incident 500 km away |
| Is it current? | Valid within her journey window; `observedAt` within the claim's window | Station entrance closed this week | A 2022 article republished |
| Is it relevant to movement? | Claim type affects her mode | Metro line suspended tonight | A court verdict |
| Is the source confident? | Evidence: source class and authority for this claim type; confidence tier (engine §5, §6.9) | Police notice about a road closure | An anonymous social post |
| Is it corroborated, where appropriate? | Engine §6.5: official-authoritative sources stand alone; news-derived items need independent origins | Official notice, or 2 independent outlets | One sensational article |
| Is it specific? | Named place/bounded area + time window | "Exit 3 closed after 22:00 this week" | "Crime is rising in the city" |
| Is it actionable for her? | A reasonable alternative exists for *her* journey (route, time, mode, Help Point, sharing). AI may judge this, with the engine's rule-based fallback (engine §7.5) | Use exit 2; take route B | No action for her plan → not surfaced (non-incident context may still appear in a briefing on request) |

Geography, time, movement and specificity are deterministic gates. Source confidence and corroboration come from the evidence systems. Only actionability and priority are AI judgements. An item that fails an evidence gate can never be surfaced by AI.

### D.5 Anti-feed rules
- **No incident list screen.** Items appear only on route cards, trip updates or briefings.
- **No incident map layer.** Area-level items are shown as text with the area name, never as pins or heat.
- **One incident doesn't define an area.** Incidents are journey-scoped for ≤ 72 h unless an official notice says the situation is ongoing. They are **never** aggregated into area history visible to users.
- **Language:** factual and brief, with the source and date. No adjectives ("horrific"), no victim details, no suspect descriptions (these reproduce bias and aren't actionable).

---

# Part E — Destination intelligence

A **destination briefing** is offered (never pushed) when a journey or saved trip targets an unfamiliar city or country. It's a short, sectioned, cited page:

| Section | Content | Source |
|---|---|---|
| Emergency | Local numbers, women's helplines, tourist police (if any), "112 on mobiles" note if applicable | Locale profile |
| Getting in | Official transport from her arrival point (airport / station), last services for her arrival time | Advice cards + GTFS |
| Getting around | Which services operate; transit hours; night options | Locale profile + GTFS + cards |
| Where you're staying | Help Points near the accommodation (hours), lighting coverage on the last walk from the nearest stop | Engine |
| Current official notices | Advisories (tier 2) and active official warnings affecting her dates and area | Advisories + CAP |
| Practical local notes | Only cited cards (e.g. official guidance on common scams) | Cards |
| What MIRA doesn't know here | Coverage statement ("Hours known for 40% of Help Points near your hotel") | Engine |

**Not in a briefing:** crime statistics, "safe / avoid" neighbourhood lists, cultural generalisations about people, anything uncited.

---

# Part F — Travel companion blueprint

**Objective:** not "the safest itinerary". **An itinerary with safety context built into the planning.**

### F.1 Before the trip
| Feature | What she gets | Systems |
|---|---|---|
| Destination briefing | Part E | Locale profile, cards, engine |
| Local transport guidance | Modes, hours, official options | Part C |
| Emergency contacts | Local numbers saved on the device for offline use | Locale profile |
| Circle for this trip | Choose who follows her travel journeys (e.g. "Mum sees arrivals only") | Trusted circle + roles |
| **Itinerary review** | She enters (or pastes) her plan: flights/trains, hotel, day plans. MIRA annotates it | Engine + Part C |

**Itinerary review annotates, it doesn't judge:**
```
Day 1 · Arrive NBO 23:40
  ▸ Arrival after 23:00: [official transport options at this hour · source]
  ▸ Hotel 32 min by car · Help Points near hotel: 2 (1 open 24h)
  ▸ Want your arrival shared with Mum? (auto-arrival at the hotel)
Day 2 · Museum → dinner in [area] → hotel 22:30
  ▸ Last leg after dark: walk 12 min · 40% mapped lit · 55% not known
  ▸ Ride options operating in this city: [list · locale profile]
```
The annotations' facts are deterministic (evidence systems). AI may decide which annotations matter most for her plan, explain them and recommend actions (e.g. "share the arrival leg with Mum"), citing each. It never judges a day or an area as safe.

### F.2 Arrival
- **Airport / station → accommodation:** the arrival card (Part B) + mode options + "Start with MIRA" to the hotel (ride or transit journey, Part C).
- **Arrival-time considerations:** computed from her actual landing time vs. GTFS last services and Help Point hours.
- **Check-in confirmation:** auto-arrival at the hotel closes the journey. Her circle sees "Asha arrived at her hotel". Optional: a gentle morning check-in she scheduled herself.

### F.3 During the trip
- **Daily plan view:** today's legs with context. Each leg is one tap from "Start with MIRA".
- **Travel between places:** the journey companion in the right mode.
- **Live local information:** engine updates relevant to today's legs only (budgets apply).
- **Help Points:** near her current position and her accommodation, with local class weights.

### F.4 Unexpected situation
Same *I feel unsafe* sheet, localised: **nearest Help Point** (local classes) · **tell my people now** · **call someone** · **Emergency (local number)** · **Talk to Mira**. Plus, abroad: **"Show my location in words"** in the local language and English (area, nearest named place, her accommodation), to read or show to a call-taker, a driver or staff.

### F.5 What the travel companion needs, and the order
**Already in P1 (prerequisites):** non-walking journeys with a manual ETA (Part C.3), durable accounts and push notifications, Help Points with hours (blueprint §5E), and the Location Context interface with the India profile.

**Then, in P2:**
1. Locale profiles for the first destination countries (Part A).
2. GTFS for the first cities (transit journeys).
3. Advice cards for the top arrival points (airports, main stations) of the first cities.
4. Briefings (Part E).
5. Itinerary review (F.1): last, because it combines everything above.

A native app (background location for long ride and transit legs) is P2 and runs in parallel once beta evidence justifies it.

---

# Part G — Rollout by geography

| Phase | Where | Why | What's needed |
|---|---|---|---|
| G0 (H1 · P0–P1) | **India**, starting in Delhi (the pilot geography and the audit's launch market) | Existing data, the team's context, the 112 ecosystem | India profile (Part A), Help Points, production email (P0) and push (P1); WhatsApp/SMS follow in P2 |
| G1 (H2 · P2) | Indian metros with GTFS and dense women's commuting (e.g. Mumbai, Bengaluru, Kolkata, Chennai, Hyderabad; verify feed availability) | Same language and emergency system; transit data | GTFS wiring, city advice cards, regional reviewers |
| G2 (H2 · P2) | **Travel corridors** Indian women travel along most (verify with users: e.g. Dubai, Singapore, Bangkok, London) | The traveller loop follows real routes | Locale profiles, airport cards, advisory ingestion |
| G3 (H3 · P3) | Anywhere via open-source locale profiles + connectors, prioritised by user demand and contributor availability | Global reach without a local team per city | Contributor programme, regional maintainers |

**What "available everywhere" means at each phase:** MIRA is designed to provide standalone value without community participation, but the depth of safety context depends on the data coverage in each location. From G0, maps, walking routes (straight-line "approx." where there's no street network), Share link and auto-arrival are available worldwide. Lighting appears where OSM or Mapillary has mapped it, and "not known" elsewhere. The Emergency pill dials 112 at P0. Per-country numbers come with locale profiles (P1 for India's interface, P2 for more countries), and a missing profile shows the honest fallback. **Depth** (advice, transit, alerts) arrives city by city, and the coverage statement says where it's missing. MIRA never estimates or invents what isn't known.
