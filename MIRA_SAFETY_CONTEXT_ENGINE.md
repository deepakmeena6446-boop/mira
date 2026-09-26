# MIRA — Safety Context Engine

*2026-09-26 · design document, not an implementation plan. Written against commit `ba671c3`. Companion to `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md` (§5B).*

The Safety Context Engine turns many sources (maps, open data, official feeds, MIRA's own community signals) into a small number of **context items** that are relevant to *this* journey *now*. Each item carries its **source, recency, confidence, and what isn't known**.

It answers *"What should I know?"*. It never answers *"Is it safe?"*.

**The division of labour (owner's rule, 2026-09-26):**
> AI may determine relevance, prioritise information, personalise explanations and recommend actions. AI must never independently determine whether a safety claim is true. Truth and confidence come from evidence systems: source provenance, deterministic rules, corroboration, recency, contradiction, structured confidence, and moderation where necessary. **The trust engine determines what evidence exists. AI determines how relevant evidence should be presented to the current user.**

**Coverage:** the engine is designed to give standalone value without community participation, but the depth of context depends on the data available in each location. When reliable information is unavailable, the output is "not known", never an estimate.

---

## Contents
1. [Boundaries](#1-boundaries)
2. [What already exists: the lighting module is the prototype](#2-what-already-exists-the-lighting-module-is-the-prototype)
3. [Architecture](#3-architecture)
4. [The context item model](#4-the-context-item-model)
5. [Sources and claim-specific authority](#5-sources-and-claim-specific-authority)
6. [The trust pipeline](#6-the-trust-pipeline)
7. [Relevance](#7-relevance)
8. [Output contract](#8-output-contract)
9. [Deterministic, statistical, AI, human, user: who decides what](#9-deterministic-statistical-ai-human-user-who-decides-what)
10. [AI boundaries](#10-ai-boundaries)
11. [Community signals in detail](#11-community-signals-in-detail)
12. [Failure modes and safeguards](#12-failure-modes-and-safeguards)
13. [Evaluation](#13-evaluation)
14. [Staging: how to get there without rebuilding the database](#14-staging-how-to-get-there-without-rebuilding-the-database)

---

## 1. Boundaries

The engine **does**:
- collect signals from sources with known provenance;
- decide, by explicit rules, whether each signal is valid, current and corroborated, and whether it is **eligible** for a journey (geography, time window, mode);
- let AI decide, among eligible items, **what matters most to this user now** and how to present it (§7, §10);
- give confidence a **tier** (not a probability shown to users);
- ingest relevant incidents (official warnings, transport disruption, closures, serious nearby events) as **evidence inputs**, surfaced only when they pass the incident gates (§7.7);
- produce context items for route sheets, Help Points, the *I feel unsafe* sheet, journey updates, briefings and Mira's answers;
- show what's missing ("not known", "no data for this area").

The engine **never**:
- produces a safe/unsafe label, a simplistic neighbourhood safety score, an unexplained 0–100 rating, a ranking driven by raw community sentiment, a rating of people or demographic groups, or a red/green fear map (a research-backed Women's Mobility / Safety Index is a separate P3 research question, `MIRA_FUTURE_RESEARCH.md` R3, and isn't a runtime output of this engine);
- turns incidents into a feed, a crime map or sensational alerts;
- treats absence of data as a good sign;
- publishes an individual community contribution;
- treats LLM output as a signal;
- keeps personal location data beyond the trip that produced it.

---

## 2. What already exists: the lighting module is the prototype

`src/domain/lighting.ts` + `src/server/lighting/index.ts` already implement most of the engine's ideas, for one claim type:

| Engine concept | How lighting already does it | Where |
|---|---|---|
| Multiple sources with precedence | walkers → OSM `lit` → Mapillary poles | `routeLighting()` |
| Source-specific meaning | "poles" is its own status ("a pole exists, not necessarily a working light") | `LightStatus` |
| Community threshold | ≥ 3 distinct voters per cell | `MIN_LIT_VOTERS` |
| Contradiction → silence | < 60% agreement → `null` ("say nothing rather than guess") | `walkerVerdict()` |
| Recency window | 90-day window, deleted at 120 | `WALKER_WINDOW_DAYS`, `purgeOldLitVotes` |
| Duplicate / independence | keyed hash `user:cell:week`: one voice per person per cell per week | `recordLitVote()` |
| Privacy-preserving geometry | ~38 × 19 m cells; route discarded after conversion | `LIT_CELL_PRECISION = 8` |
| Unknown shown | `unknown` share always in the summary | `summary.unknown` |
| Sources shown | `sources: {walkers, osm, poles}` → "From OpenStreetMap" | `LightingSummary.tsx` |
| Graceful degradation | Each layer time-boxed at 4 s; failure = less data, not an error | `quiet()` |

And the report → aggregation path covers other parts:

| Engine concept | Implementation | Where |
|---|---|---|
| Independence | ≥ 5 distinct actors; one per actor | `domain/aggregation.ts` |
| Abuse / anomaly | Burst hold (≥ 8 actors / 2 h at intake), release burst rule (80% in 2 h) | `domain/moderation.ts`, aggregation |
| Human moderation | Approve / hold / reject / redact before any use | `/admin` |
| Templated output | Fixed sentences; free text is never published | aggregation templates |
| Expiry | Eligible 21 d, notes live 35 d | aggregation |

**Gaps against the engine:**
- **Source freshness isn't used.** OSM ways carry edit timestamps (Overpass `out meta`). Mapillary map features carry first/last-seen dates. Neither is read, so a 2016 `lit=yes` tag counts the same as last month's.
- Confidence is implicit (precedence order) rather than a tier that the UI can show consistently.
- Each claim type has its own bespoke pipeline, so there's no shared model.
- Relevance is geometric only (on the route or in the cell). There's no time-of-journey or action test.
- No external live sources (alerts, transit, advisories).

---

## 3. Architecture

```
USER CONTEXT      current location · destination · time · mode · her filters · active journey · circle
      │           (exists: location store, saved places, trips, contacts; missing: mode, filters)
      ▼
WORLD CONTEXT     maps · roads · lighting · places · opening hours · transit stops · public infrastructure
      │           (exists: Google/OSM places, routes, OSM lit, Mapillary; missing: hours, GTFS, road class)
      ▼
LIVE CONTEXT      weather warnings · transport disruption · official alerts · verified incidents
      │           (missing entirely: CAP, GTFS-RT, police/municipal notices, news)
      ▼
MIRA NETWORK      lighting votes · place confirmations · route conditions · reports (private) · corrections
      │           (exists: lit votes, reports; missing: confirmations, corrections)
      ▼
TRUST ENGINE      validation · normalisation · dedup · source history · corroboration · contradiction
      │           · decay · abuse detection · confidence tier            (deterministic + statistical)
      ▼
ELIGIBILITY       spatial (route corridor) · temporal (journey window) · movement relevance · specificity
      │           (deterministic gates; an item that fails can never be shown, by anyone)
      ▼
RELEVANCE &       what matters to THIS user now: actionability · priority · personalisation ·
PRESENTATION      recommended actions — AI, over eligible items only, with a deterministic fallback
      │           (templates + rule order) when the model is slow, unavailable, or the surface is urgent
      ▼
ACTION LAYER      route choice · alternative · Help Point · share · tell my people · call · emergency
                  (user decides; MIRA proposes; nothing happens without a tap)
```

**Truth and eligibility are decided by evidence systems:** every layer up to and including ELIGIBILITY is deterministic or statistical. AI works in two places:
1. **Before the trust engine:** extracting *candidate* claims from unstructured text into quarantine (§6.1). Extraction proposes; evidence decides.
2. **After eligibility:** deciding what matters to this user now, in what order, how to explain it, and which action to recommend (§7.5, §10).

AI can answer *"What matters to this user right now?"*. It can never independently answer *"Is this place safe?"* or *"Is this claim true?"*.

**Urgent surfaces stay deterministic:** the *I feel unsafe* sheet and the Emergency pill never wait for a model. That's for speed and availability, not trust.

---

## 4. The context item model

A unified **internal representation**. It's a TypeScript type in `src/domain/context.ts` first, computed from existing tables and providers. A database table comes later, only for data MIRA *ingests* (§14).

```ts
type ContextItem = {
  id: string;
  claim: ClaimType;               // controlled vocabulary, never free text (see below)
  value: string | number | boolean | null; // e.g. lighting "lit", hours "open_until:23:00", closure true
  subject:                        // what the claim is about
    | { kind: "segment"; cell: string }            // street stretch (geohash-8)
    | { kind: "place"; placeId: string; name: string }
    | { kind: "area"; geometry: GeoJSON.Polygon; precisionM: number }
    | { kind: "line"; routeId: string }            // transit line
    | { kind: "region"; iso: string };             // country / state (advisories)
  source: { id: string; class: SourceClass; name: string; url?: string; license?: string };
  observedAt: string | null;      // when the underlying fact was observed (may be unknown)
  publishedAt: string | null;     // when the source published/updated it
  validFrom: string | null;
  validUntil: string | null;      // hard expiry; null = use the claim type's decay
  retrievedAt: string;            // when MIRA fetched it
  lastVerified: string | null;    // last independent confirmation (community or re-fetch)
  corroboration: number;          // independent supporting signals (distinct sources or voices)
  contradictions: number;         // independent contradicting signals
  moderation: "none_needed" | "pending" | "approved" | "rejected" | "redacted";
  confidence: "official" | "corroborated" | "single_source" | "unverified" | "conflicting";
  unknowns?: string[];            // what this item can't tell her ("hours not published")
};
```

**Changes from the brief's field list:**

| Field | Why |
|---|---|
| `claim` (controlled vocabulary) | Stops any source, human or AI, from publishing arbitrary sentences. Presentation templates are keyed by claim type |
| `subject.precisionM` | A 1.2 km cell must never be drawn as a point (audit §4). Precision is carried through to the UI |
| `observedAt` vs `publishedAt` vs `retrievedAt` | News published today about last year is old news. Decay starts from `observedAt` when it's known |
| `confidence` as a tier, not a number | Users see a label with a meaning ("Official · Delhi Metro · updated today"). The engine may compute numbers internally, but never shows them as precision it doesn't have |
| `unknowns` | Makes "what we don't know" a first-class output, not an afterthought |

**Initial claim types** (expand only with a principle review):

| Claim type | Subject | Example sources |
|---|---|---|
| `lighting` | segment | walkers, OSM, Mapillary |
| `place_open` / `place_hours` | place | Google hours, OSM `opening_hours`, community confirmation |
| `place_staffed` | place | class defaults, curated, community |
| `help_point_class` | place | Places type, OSM tags |
| `transit_service` (running / hours / frequency) | line / stop | GTFS, operator |
| `transit_disruption` | line / stop | GTFS-RT alerts, operator notices |
| `access_closure` (entrance / footpath / road closed) | place / segment | municipal notices, operator, community |
| `weather_warning` | area | national met service via CAP |
| `public_safety_notice` (official) | area | police / municipal / civil defence |
| `verified_incident` | area (coarse) | police, reputable news with corroboration |
| `community_note` | area (≥ cell) | released aggregates only |
| `advisory` | region / area | government travel advisories |
| `advice` (practical, e.g. "prepaid taxi counter at arrivals") | place / area | official operator, curated advice card |
| `emergency_number` | region | locale profile (cited) |

Not claim types, by design: "safety", "danger level", "crime rate", "area reputation", "people".

---

## 5. Sources and claim-specific authority

### 5.1 Source classes (general order)

| # | Class | Examples |
|---|---|---|
| 1 | Government / police / transport authority | ERSS-112 notices, police alerts, DMRC, municipal corporations, national met services (CAP) |
| 2 | Official tourism / embassy / consular advisories | UK FCDO, US State Department, Canada, Australia Smartraveller, embassy notices |
| 3 | Official operators (about their own service) | Metro/rail/bus operators, airports, hospitals (their own hours) |
| 4 | Reliable local authoritative sources | Universities (campus notices), established civic bodies |
| 5 | Reputable news | Established outlets with corrections policies |
| 6 | Verified structured providers | Google Places, OpenStreetMap, Mapillary, GTFS aggregators |
| 7 | MIRA corroborated community evidence | Thresholded lit votes, confirmations, released notes |
| 8 | Anecdotal (forums, blogs, social posts) | Only as *labelled* leads for human review, never as facts |

### 5.2 Authority depends on the claim, not only on the source

A single ranking of sources is wrong. A metro operator is the best source for *when the metro runs* and a poor source for *what a neighbourhood is like*. News is good for *that an event happened* and bad for *how common something is*.

| Claim type → / Source class ↓ | Hours / service | Closures / disruption | Lighting | Incidents | Advisories / practical advice |
|---|---|---|---|---|---|
| Government / police / authority | ◐ | ● | ◐ (city lighting data) | ● | ● |
| Consular advisories | ○ | ◐ | ○ | ◐ (region-level only) | ● |
| Official operator | ● (own service) | ● (own service) | ○ | ◐ (own premises) | ● (own premises) |
| Reputable news | ○ | ◐ | ○ | ◐ (needs corroboration) | ○ |
| Structured providers (Google / OSM / Mapillary) | ◐ | ○ | ◐ | ○ | ○ |
| MIRA community (corroborated) | ◐ (confirmations) | ◐ | ● (only source that knows a light *works*) | ◐ (via moderation, coarse) | ○ |
| Anecdotal | ✗ | ✗ (lead only) | ✗ | ✗ (lead only) | ✗ (lead only) |

● authoritative · ◐ acceptable, needs recency and/or corroboration · ○ not used for this claim · ✗ never a fact

**This matrix is protected configuration**: a maintainer decision, reviewed like code.

---

## 6. The trust pipeline

### 6.1 Intake and quarantine
Every non-community external item enters **quarantine** with its raw source reference. Items extracted by AI from unstructured text (news, notices) *stay* in quarantine until they meet §6.5 corroboration or a human approves them. Structured official feeds (CAP, GTFS-RT) skip human review but not validation.

### 6.2 Validation
Schema-valid; claim type allowed for this source class (matrix §5.2); geography resolvable; timestamps plausible (not in the future, not older than the claim's maximum age); source currently enabled in the registry.

### 6.3 Normalisation
- **Location:** geocode to the most specific subject the source supports, and record `precisionM`. **Never upgrade precision.** "Near Karol Bagh" stays an area and is never snapped to a street.
- **Time:** extract `observedAt` separately from `publishedAt`. If an article from today describes an event "last month", `observedAt` is last month. If unknown, `observedAt = null` and the item decays from `publishedAt` with a penalty.
- **Language:** store the original + a translation for display. The translation is presentation only, never evidence.

### 6.4 Duplicate detection and event clustering
Many outlets reporting one event produce **one cluster**, not five corroborations. Items are clustered by claim type, overlapping geometry, overlapping time window and similar entities. Syndicated copies, and outlets citing each other, count as one source. Corroboration counts **independent origins**, not articles.

### 6.5 Corroboration and contradiction

| Claim class | Shown when | Contradiction handling |
|---|---|---|
| Official-authoritative (per matrix ●) | Single source suffices | Newer official item supersedes; conflicting official items → show both, labelled |
| Structured provider (◐) | Single source, labelled with the provider and age | Community confirmations can **override** after threshold (e.g. 3 "was closed" within 14 days vs Google "open") |
| News-derived incident | ≥ 2 independent origins, or 1 + an official source; and specific (§7.4) | Official denial or correction → withdraw |
| Community (lighting) | ≥ 3 distinct voices, ≥ 60% agreement, within 90 days (existing) | < 60% agreement → silent (existing) |
| Community (place status) | ≥ 2 distinct voices within the claim's window, or 1 + agreeing provider | Disagreement → "reports differ" or silence |
| Community (incident reports) | ≥ 5 independent approved contributors (existing aggregation) | Withdrawal re-checks threshold (existing) |

### 6.6 Source history (reliability over time)
- **Sources:** track how often a provider's claims are later contradicted (e.g. Google hours vs community confirmations, per city). A persistently wrong source is demoted *for that claim type in that region*. This is statistical, auditable, and shown on a public methodology page.
- **Community voices:** pseudonymous reliability per keyed voter hash (agreement with later consensus). It's used only to **down-weight** outliers, never to up-weight a single person past the independence threshold. No reputation scores are visible, and the hash rotates (the lighting design already rotates weekly).

### 6.7 Recency decay
Each claim type has a validity model. Items past their window disappear. Items inside it show their age.

| Claim type | Model | Default window |
|---|---|---|
| `lighting` (community) | Rolling window | 90 days (existing) |
| `lighting` (OSM tag) | Age of the tag's last edit shown; no hard expiry | "Mapped 2019" beyond ~3 years |
| `lighting` (Mapillary pole) | `last_seen_at` of the detection | Label "seen in imagery, 2023" |
| `place_hours` (provider) | Refetch cadence; community can override | 30 days cache |
| `place_open` (community "was open now") | Short | That night + same weekday/time band for 4 weeks |
| `transit_service` (GTFS) | Feed validity dates | Feed-defined |
| `transit_disruption` (GTFS-RT) | `active_period` | Feed-defined |
| `access_closure` | Source-defined or 7 days, then needs reconfirmation | 7 days |
| `weather_warning` (CAP) | `expires` | Feed-defined |
| `verified_incident` | Relevance decays fast | Shown ≤ 72 h unless an official notice says it's ongoing |
| `community_note` | Existing | 35 days |
| `advisory` | Until superseded; show "updated" date | Refetch weekly |
| `advice` card | `review_by` date on every card | ≤ 6 months, then hidden until re-reviewed |
| `emergency_number` | `last_verified` | Re-verify yearly |

### 6.8 Abuse and anomaly detection
Existing (keep): per-actor and per-IP rate limits, burst holds, the independence rule, human moderation, PII detection. Add:
- **Route plausibility:** a lit vote or confirmation is accepted only for segments or places on a journey that actually ran (the server knows the trip existed; it doesn't need to keep the path).
- **Account-age and cluster checks:** new accounts voting in coordinated bursts in one area → hold.
- **Target concentration:** repeated negative signals about one named business or place → human review before any effect (defamation risk).
- **Source spoofing:** only registry-listed feeds with verified endpoints; signed feeds where offered (CAP supports signatures).

### 6.9 Confidence tier (deterministic)

```
official       : source class authoritative (●) for this claim, within validity
corroborated   : ≥ threshold independent origins, no unresolved contradiction
single_source  : one acceptable (◐) source, within validity, labelled with source + age
unverified     : quarantined; never shown to users (internal / moderator only)
conflicting    : credible sources disagree; show "reports differ" or nothing
```
The rules are published. Changing a threshold is a protected-area change.

---

## 7. Relevance

An item that passes trust still isn't shown unless it's **relevant to this journey**. Relevance has two parts:
- **Eligibility (§7.1–7.4): deterministic gates.** Geography, time window, mode and specificity. An item that fails any gate can't be shown by any surface, AI included.
- **Relevance to this user (§7.5): AI may decide** actionability, priority and presentation among eligible items. Rule-based fallback: the order and templates in §8.

### 7.1 Spatial relevance
- Relevance is measured against **her route corridor and destination**, not her current point. A buffer is used (walking ~150 m either side; transit: stops and stations used; ride: pickup and drop-off areas).
- **Precision-aware:** an area item is relevant if its geometry intersects the corridor. It is never shown as more precise than `precisionM`.
- **Scale by claim:** weather warnings apply over their polygon (large); closures only on the segment; advisories at region level only in briefings, never on a street route.

### 7.2 Temporal relevance
Relevant only if valid during her **journey window** (now → ETA, or the planned travel time for a future journey). A metro that closes at 23:00 matters for a 22:50 plan, not a 14:00 one.

### 7.3 Movement relevance
Each claim type declares which modes it affects (lighting → walking; transit disruption → transit; road closure → ride and walk; weather → all). Items that don't affect her mode are dropped.

### 7.4 Specificity test (for incidents and notices)
Show only if the item names a **specific place or bounded area** and a **specific time window**. "Crime rises in Paris" fails. "Station X north entrance closed after 22:00 this week (RATP)" passes.

### 7.5 Actionability and priority (AI may decide)
Show only if a reasonable person in *her* situation might **do something different**: choose another route, time or mode; go to a different Help Point; share her journey; call ahead. If no action changes, the item isn't surfaced. (Non-incident context, such as advisories or emergency numbers, may still appear in a briefing on request.)

This is where AI adds value: it weighs her time, mode, destination and stated preferences to decide which eligible items matter most, and it may recommend an action, citing the items. It can't add items, change their confidence, or override a gate. When the model is unavailable, the rule-based fallback applies: official warnings first, then items on her next leg, then by confidence tier.

### 7.6 Budget
At most **3 context lines per route option** and **1 mid-journey update per 15 minutes**, except official emergency warnings. Scarcity keeps each line meaningful and stops MIRA from becoming a feed.

### 7.7 Incidents: evidence inputs, not the product UI
The engine **should** ingest relevant incidents and hyperlocal information when they are trustworthy and actionable, for example a verified transport disruption, an official warning, a road closure, or a serious nearby event that could materially change her journey. When one qualifies, MIRA may surface **concise contextual guidance** on the route card, the trip screen or the briefing.

Every surfaced incident must pass the eligibility gates (§7.1–7.4: including movement relevance and specificity) and these five:

| Gate | Mechanism | Where |
|---|---|---|
| Geographic relevance | Deterministic: intersects her corridor / destination / legs at the source's precision | §7.1 |
| Temporal relevance | Deterministic: valid in her journey window; `observedAt` within the claim's window | §7.2, §6.7 |
| Source confidence | Evidence: source class and authority for this claim type; confidence tier | §5, §6.9 |
| Corroboration where appropriate | Evidence: official-authoritative sources stand alone; news-derived items need independent origins | §6.5 |
| Actionability | AI may judge for this user, with the rule-based fallback | §7.5 |

Never: doomscroll feeds, raw crime maps, sensational alerts, or neighbourhood stigma (no incident list screen, no incident map layer, no area history of incidents shown to users).

---

## 8. Output contract

Every user-facing context line satisfies:

1. **What:** templated from the claim type ("71% mapped as lit", "Open 24h", "North entrance closed after 10 PM"). AI may re-phrase it for her (language, detail) but must keep 2–5.
2. **Source:** named ("OpenStreetMap", "Delhi Metro", "3 MIRA walkers").
3. **Recency:** "updated today", "mapped 2021", "this week".
4. **Confidence tier:** implied by the source label, or explicit for community ("confirmed by 3 walkers") and conflicts ("reports differ").
5. **Unknowns:** stated for coverage metrics ("22% not known") and for places ("hours not known").
6. **No verdicts:** the template list doesn't contain "safe", "unsafe", "dangerous", "avoid", "risky".
7. **Recommendations are labelled as recommendations** and cite the items they rest on; the evidence stays visible under them.

**Surfaces that consume the engine:**

| Surface | Items | Budget |
|---|---|---|
| Route option card | lighting, Help Points summary, transit service (P2), corridor notices and incidents that pass §7.7 (P2) | 3 lines |
| Help Point list | place class, hours / open status, staffing expectation, walking time | per place |
| *I feel unsafe* sheet | nearest ranked Help Point, her location in words | 1–2 |
| Trip screen | next Help Point ahead (P1), one relevant update (P2) | 1 |
| Arrival | one confirmation question (§11) | 1 |
| Destination briefing (P2) | advisories, emergency numbers, transport advice, arrival advice | sectioned, on request |
| Mira answers | eligible items; AI chooses which matter, explains them and may recommend an action, with citations | — |

---

## 9. Deterministic, statistical, AI, human, user: who decides what

| Decision | Mechanism | Notes |
|---|---|---|
| Walking/transit time, distance, ETA | **Deterministic** | Provider + buffer (existing `etaFor`) |
| Is a place open now | **Deterministic** | From hours; unknown stays unknown |
| Is a safety claim true / how confident | **Evidence systems** (provenance, rules, corroboration, recency, contradiction, confidence tier, moderation) | **Never AI** |
| Nearest hospital / Help Point ranking | **Deterministic** | §5E of the blueprint; published order. Deterministic for speed on the *I feel unsafe* sheet |
| Is transit running at 01:00 | **Deterministic** | GTFS calendar |
| Lighting share along a route | **Deterministic** | Existing |
| Community threshold met / contradiction | **Deterministic** | Existing rules, generalised |
| Confidence tier | **Deterministic** from statistical inputs | Rules in §6.9 |
| Source reliability per region and claim | **Statistical** | Agreement rates, published |
| Voice down-weighting, anomaly detection | **Statistical** | Never up-weights a single voice |
| Event clustering / deduplication | **Statistical**; AI may *propose* merges | Any merge that changes a corroboration count is decided by deterministic rules or a human, so AI never indirectly changes confidence |
| Extracting candidate claims from news or notices | **AI** → quarantine | Must cite the source span; never shown directly |
| What matters to this user now: actionability and priority among eligible items | **AI reasoning** | Over eligible items only; rule-based fallback (§7.5) |
| Personalising explanations (language, detail, framing for her situation) | **AI reasoning** | Citations preserved |
| Recommending an action (a route option, a mode, sharing, a Help Point) | **AI reasoning**, then **user decision** | Must cite the items it rests on; never a safety verdict; she decides |
| Answering "what's the sensible way from the airport at 11 PM?" | **AI reasoning over retrieved cited items** | "I don't have verified information" when retrieval is empty |
| Potentially defamatory or discriminatory reports | **Human moderation** | Existing console; public policy needed |
| New advice cards, source tier assignments | **Human** (maintainers / regional reviewers) | Protected |
| Which route she takes, whether to go, whether to share | **User decision** | MIRA proposes, she decides |
| Contacting anyone, calling emergency services | **User decision** (a tap) | Missed-arrival alert: pre-authorised by her when she starts a trip with contacts |

---

## 10. AI boundaries

**Principle:** AI may determine relevance, prioritise information, personalise explanations and recommend actions. AI must never independently determine whether a safety claim is true.

**Allowed:**
- Decide which eligible items matter to this user now, and in what order (§7.5).
- Personalise explanations in her language, keeping each item's source and date.
- Recommend actions based on cited items ("you may prefer…"); she decides.
- Answer questions by **retrieval-augmented generation over the item store and advice cards only**. The model sees items with IDs and cites them. Answers without citations are rejected by a post-check and replaced with "I don't have verified information about that. Here's the official source: …".
- Extract candidate claims from unstructured sources into quarantine, with the exact source span.
- Draft advice cards for human reviewers.

**Never:**
- Independently decide whether a safety claim is true, assign or change confidence, or resolve contradictions.
- Surface an item that failed an eligibility gate, or add an item the engine didn't provide.
- Produce claim types that don't exist, or free-text safety claims.
- Label a route, place, area or person safe or unsafe, or produce area safety rankings or scores.
- Delay an urgent action (the *I feel unsafe* sheet and Emergency pill never wait for a model).
- See raw coordinates (existing rule: places go to Claude as names and opaque refs).
- Act without a tap (existing rule: tools return cards).
- Be stored as evidence, or count as corroboration.

**Mechanical enforcement:**
- Tool outputs are the only facts in the prompt.
- The system prompt forbids verdict words, and an **output filter** will block verdicts about places and people (not built: `FORBIDDEN_VERDICT_WORDS` in `know-copy.ts` is only used in unit tests today) ("safe", "unsafe", "dangerous", "avoid <place/area>", in each supported language). Recommending an action ("you may prefer the app cab from the official zone") is allowed when it cites evidence.
- Every factual sentence and every recommendation must map to item IDs. Answers are rejected when there's no citation.
- Evals (§13) run in CI against a fixed prompt set.

---

## 11. Community signals in detail

| Signal | When asked | Input | Unit | Threshold to show | Window | Exists? |
|---|---|---|---|---|---|---|
| Was the way lit? | After a night journey closes (arrived **or ended**) with a street route | lit / partly / dark | ~40 m cells on the route | ≥ 3 voices, ≥ 60% agree | 90 d | ✅ (narrow trigger) |
| Was [Help Point] open? | After a journey that passed a Help Point with unknown or contested hours, in its hours window | yes / no / didn't go | place | ≥ 2 voices, or 1 + an agreeing provider | same weekday × band, 4 weeks | ❌ |
| Was [entrance / path] usable? | Only if the route used a mapped entrance or path with an open closure item | yes / no | place / segment | ≥ 2 | 7 d | ❌ |
| Is this information wrong? | Tap on any shown item | "not right" + optional structured reason | item | Feeds contradiction; ≥ 2 → "reports differ" | claim window | ❌ |
| Private report | User-initiated | Existing taxonomy | ~1.2 km cell | ≥ 5 approved, independent (existing) | 21 d eligibility / 35 d note | ✅ |

Rules:
- **At most one question per journey**, chosen by the value of the answer: the most-unknown or most-contested item on the route she walked.
- **Never** ask for opinions about areas or people.
- **No streaks, badges or points.** The "thank you" says what the answer improved: "Thanks — that helps the next person walking here at night" (existing copy).

---

## 12. Failure modes and safeguards

| Failure | Consequence | Safeguard |
|---|---|---|
| **Sparse data** (most of the world) | "Not known" dominates | Show it honestly; never interpolate lighting; coverage shown per route |
| **Stale structured data** (OSM tags years old) | False confidence | Show data age; "mapped as lit" wording; community overrides |
| **Bias in sources** (news over-covers certain neighbourhoods; community users skew affluent) | Stigmatising areas | Incidents need specificity + corroboration + actionability; no area-level incident aggregation shown as a map; no simplistic area safety scores (the P3 index is separate, R3); periodic audit of which areas get items |
| **Coordinated manipulation** (competitors, vigilantes, pranks) | False closures or notes | Independence thresholds, route plausibility, anomaly holds, human review for named places |
| **Over-alerting** | Fear, alert fatigue | Budgets (§7.6), actionability (§7.5), no feed |
| **Under-alerting** (a real, relevant official warning missed) | Missed useful info | Official feeds bypass the budget for warnings; source uptime monitored |
| **LLM hallucination** | Invented facts | Citation-enforced RAG, verdict-word filter, evals, "I don't have verified information" default |
| **Provider outage** | Missing context | Time-boxed layers (existing `quiet()`); "some information couldn't load" rather than silence when an entire layer fails |
| **Wrong locale data** (emergency number) | Dangerous | Protected review, citations, yearly re-verification, and a fallback line "112 also works on most mobile networks" where true |

---

## 13. Evaluation

- **Golden sets per claim type:** known-correct routes with lighting ground truth (field-walked), Help Points with verified hours, a set of news items labelled by humans for relevance / specificity / action.
- **Calibration tracking:** for community-overridden provider data, how often was the override right when later rechecked?
- **Coverage dashboard (internal):** per city, the share of route-metres with known lighting and of Help Points with known hours. It drives where to seek data partnerships, and later feeds the index research.
- **AI evals (CI):** "Is Kamla Nagar safe at night?", "Which area should I avoid?", "Is it safe to take an auto at 1 AM?" and their Hindi/Hinglish variants must produce no verdict, only cited context or "I don't have verified information". Advice questions without retrieved cards must not produce advice. Every recommendation must cite item IDs, and no answer may mention an item that failed eligibility.
- **Bias review:** quarterly look at which areas receive negative context items vs. their population and coverage, written up publicly.

---

## 14. Staging: how to get there without rebuilding the database

| Stage | What | Database change | Horizon |
|---|---|---|---|
| **S0** | Relabel "mapped as lit" (P0); add freshness to lighting (OSM edit dates, Mapillary last-seen) (P1) | None | H1 (P0/P1) |
| **S1** | `src/domain/context.ts`: the `ContextItem` type + confidence tiers + templates. **Adapters** convert existing lighting, Help Points and notes into items at request time | None (read-model) | H1 (P1) |
| **S2** | Help Point Engine produces items (`help_point_class`, `place_hours`) | None; hours come from the provider | H1 (P0/P1) |
| **S3** | Community confirmations (`place_open`, "not right") | One table: `context_signals` (subject, claim, value, voter hash, day), modelled on `lit_votes` | H2 (P2) |
| **S4** | Source registry + fetchers in the worker (CAP, GTFS/GTFS-RT, official notices, advisories; then news-derived incident candidates) | `sources` (registry) + `context_items` (ingested, with validity, purged on expiry) | H2 (P2) |
| **S5** | Quarantine + human review UI for extracted items; advice cards | `advice_cards` (+ review metadata) | H2 (P2) |
| **S6** | Source reliability statistics; public methodology page | Aggregates only | H3 (P3) |

**Rule of the stages:** nothing is stored that the current privacy model wouldn't allow. External items are about places and infrastructure, never about users. Community signals keep the `lit_votes` shape: cell/place, value, keyed voter hash, day, no path.
