# 07 — Adaptive Mira and Community Spec

**Scope:**
- How Mira becomes personal (Adaptive Mira) and how community contribution earns trust (the Community Trust Model and Mira Scout).
- **No backend rebuild.** Every launch item uses existing APIs and data, or device-local presentation state.

**Three horizons:**
- **§A Already possible with the existing architecture.** Wire it into the UI; no new data.
- **§B Small launch-safe additions.** Client-side only, device-local, disclosed and resettable.
- **§D Post-launch capabilities.** These need server work. Anything touching data, escalation or taxonomy is `REQUIRES_OWNER_APPROVAL`.

---

## A. Already possible with the existing architecture

### A.1 What Mira already knows (server-side, visible in Me)

| Signal | Source | Rule (existing) | Visible and reversible? |
|---|---|---|---|
| Saved places | `/api/me/places` | ≤10, label + emoji + point | Me → Your places (remove) |
| Circle | `/api/me/contacts` | WhatsApp and/or email; accepted status | Circle (remove) |
| Travel preference | `/api/me/prefs` `mode` | Default mode on the route sheet | Me → Travel preferences |
| **Habits** | `/api/me/habits`, `/api/me/habits/suggestion` | Learned **only** from arrived journeys to a *saved* place. Keyed by mode and local start hour, with who it was shared with. A suggestion needs **≥3** matches within **±1 h** of now. Unused habits are deleted after 400 days. | Me → What Mira remembers (switch, list, Forget all) |
| Help Point exclusions | `/api/me` `helpExclude` | Applied everywhere | Me → Help Point types |
| Impact | `/api/contribute` | Verified-only counts, pending, differed, archived, steward status and needs | Contribute → Your impact |
| MIRA Checks | `/contribute` page (server) / `/api/contribute` | ≤1 per journey, after arrival | Contribute |
| Daypart | device clock | dawn / day / evening / night | Me → Appearance |
| Country | `/api/geo/reverse` | Emergency numbers, helplines, locale weighting | implicit |

### A.2 The Mira line: deterministic composition (launch)

A pure function `mira-line.ts` (new file, **presentation logic**, no I/O):

```
miraLine(input) → { key: string, text: string, state: PulseState, action?: Action, why?: string }
```

**Inputs** (all already fetched on Home, the route sheet or Trip):
- `now`, `daypart`, `user` (null or name)
- `loc.status`, `area`
- `activeTrip`
- `habit` (a HabitSuggestion or null)
- `home` (a saved place or null)
- `pendingChecks` count, and `readyCheck` (name) if known
- `impact.verified` and the device's `lastSeenVerified`
- `steward` and the device's `lastSeenSteward`
- `circle` (accepted or WhatsApp contacts)
- the device's `usageMode` (§B)
- for the route sheet: `route` (minutes, meters, approximate), the lighting summary (share lit / unknown, or the evidence state), help points (count, first minutes, evidence state), and alternatives.

**Home rules** (first match wins; `usageMode` swaps the rows marked ⇅):

| # | Condition | Text (template) | Pulse | Action |
|---|---|---|---|---|
| 1 | `activeTrip` | (the JourneyCapsule replaces the Mira line) | with-you / attention | Open journey |
| 2 | `loc.status == denied` | "Location is off, so Mira can't show the way from here. Search still works." | attention | Try again |
| 3 | `steward && !lastSeenSteward` | "You're a Mira Scout. Others keep confirming what you tell Mira." | noticed | What this means → /contribute#impact |
| 4 ⇅ | `readyCheck` | "One quick question about {place} from your walk." | noticed | Answer → /contribute#checks |
| 5 ⇅ | `habit && me` | "Heading to {placeLabel}? You usually {walk / go by cab / take transit} there around this time." Composed from the `HabitSuggestion` fields (`placeLabel`, `mode`, `times`, `shareWith`; the suggestion already guarantees a match within ±1 h of now). The domain's `habit.text` (which says "…with MIRA") is **not** reused. | noticed | **Go with Mira** (primary) → the route sheet for that place |
| 6 | `daypart == night && home && me` | "Heading home, {name}?" | observing | Take me home |
| 7 ⇅ | `impact.verified > lastSeenVerified` | "Someone else confirmed what you told Mira." | noticed | See impact |
| 8 | `user && !home` | "Save Home once, and the walk back is one tap." | observing | Find it |
| 9 | `user && circle.length == 0 && journeysStarted ≥ 1` | "Add someone who should know you got there." | observing | Add someone → /circle |
| 10 | `!user` | "Search anywhere to see the way, its lighting and places with staff on it. No account needed." | observing | none |
| 11 | default | "{Good evening/…}. Where to?" (time-of-day greeting without emoji) | observing | none |

**Swap rule (⇅):**
- **contribute** mode: order 4, 7, 5.
- **journey** mode: order 5, 4, 7.
- **mixed** and **cold** modes: order 5, 4, 7, except at **night**, where 5 and 6 always precede 4 and 7 (safety relevance outranks contribution at night).

**Route-sheet rules** are the templates in 06 §3.4. Lighting thresholds come from the existing lighting summary shares:
- "Most" ≥ 0.66 mapped lit;
- "About half" 0.33–0.66;
- "Little" < 0.33 with known data;
- "isn't mapped" when unknown ≥ 0.8;
- failed / partial states use their evidence wording.

**Trip rules** are the Mira line in 06 §3.5 (a function of `sharedOk`, `onWhatsApp`, `alertsOn`, the banners).

**Guard:** a unit test enumerates every template with sample fills and asserts that the existing output guard in `src/domain/companion-output.ts` passes them (no safe/unsafe/danger/verdict language in any language).

### A.3 Journey patterns (existing, surfaced better)
- A habit suggestion goes to the Mira line (row 5). Today it's a nudge card below the fold.
- On the route sheet for a habitual destination, "like last time" sharing is already defaulted by `tripStartExtras`. The Mira line now **says so** ("Like last time, Priya will be able to follow.").
- On the arrival screen, the first 3 times: "Mira will remember this walk home for next time. [What Mira remembers]". This makes learning visible (C-15.2).

### A.4 Contribution patterns (existing data, surfaced)
- **Pending check ready:** row 4 on Home, and the Checks section first on Contribute (06 §3.12).
- **Newly verified:** compare `impact.summary.verified` with the device's `mira.seen.verified` (§B.1) and show row 7 once, then update the seen value.
- **Mira Scout:** `impact.steward.steward` compared with `mira.seen.scout` gives row 3 and the one-time recognition card.

### A.5 Recommendation explanation (C-15.2)
Every adaptive item carries a `why`, shown via a small "Why?" disclosure under the Mira line (the text is only in the disclosure, never shown by default):

| Item | Why text |
|---|---|
| Habit | "You've arrived at Home by walking around this hour {n} times. [What Mira remembers]" |
| Check | "You passed {place} on your last journey. Mira asks one question at most, and only if it helps others." |
| Newly verified | "Someone else independently said the same thing, so it now counts." |
| Scout | "Your answers have been confirmed by others over time, in different places. [What it takes]" |
| Contribution-first ordering | "You've been contributing more than travelling lately. [Reset]" |
| Journey-first ordering | "You've mostly used Mira for journeys lately. [Reset]" |

---

## B. Small launch-safe additions (client-only, device-local)

### B.1 Device-local usage signal
- **Purpose:** decide between journey-first and contribution-first ordering for the adaptive surfaces, **without** new server data.
- **Storage:** `localStorage["mira.usage.v1"]`, wrapped in try/catch (storage may be unavailable, and the default is `cold`).

  ```json
  { "v": 1, "events": [["journey","2026-09-28"],["report","2026-09-28"]],
    "mode": "mixed", "modeDay": "2026-09-28" }
  ```

- **Events** are recorded after a *successful* API response only:

  | Kind | Recorded when |
  |---|---|
  | `journey` | `POST /api/trips` 200 (Home, Mira card, Unsafe share) |
  | `report` | `POST /api/reports` 200 |
  | `check` | MIRA Check answered (not "skip") |
  | `correction` | `POST /api/contribute/correction` 200 |
  | `lit` | "Was the way lit?" answered |
  | `mira` | a Mira message sent (tracked for chip ordering only; it doesn't affect mode) |

- **Contents:** each event is the kind plus the **local date only**. No time, no place, no ids, no text.
- **Retention:** keep ≤ 60 events and drop anything older than 60 days.
- **Privacy:**
  - Never sent to the server.
  - Never in URLs.
  - Listed in Me → What Mira remembers ("On this phone: how you've used Mira lately, to arrange Home. [Reset]") and in `/privacy` (C-9.4).
  - Cleared on Reset, Sign out and Delete account.

### B.2 Mode computation
```
w(e)  = 0.5 ^ (ageDays(e) / 21)                  // 21-day half-life (recency)
J     = Σ w(journey)
C     = Σ w(report) + w(check) + w(correction) + w(lit)
n     = count of non-"mira" events in the last 60 days

cold        if n < 3
journey     if J ≥ 2·C  and J ≥ 2
contribute  if C ≥ 2·J  and C ≥ 2
mixed       otherwise
```

- **Hysteresis:** leaving the current mode for journey or contribute needs a 2.5× ratio (instead of 2×). Leaving for mixed needs the ratio to fall under 1.5×.
- **Stability (C-6.4):** the mode is recomputed **only when the local date differs from `modeDay`**. Surfaces read the stored mode. Within a day, the arrangement never changes, even right after a new event.
- **Saved-place ordering in Search (06 §3.3):** places with a habit matching the current hour ±1 come first, then by habit count, then the user's order. The data comes from `/api/me/habits`, which exists.

### B.3 What adapts, and what never does

| Surface | Adaptive? | Rule |
|---|---|---|
| Tab bar (items, order, labels) | **Never** | Stable anchor |
| HelpCluster (I feel unsafe + Emergency) position | **Never** | Stable anchor |
| Search field and saved chips position | **Never** | Stable anchor (chip *order* follows the user's own order) |
| Report reachability (Home secondary row, Contribute grid, long-press) | **Never** removed | Stable anchor |
| Me structure | **Never** | Stable anchor |
| Journey screen controls | **Never** (the next-action rule is state-driven, not usage-driven) | Stable |
| Home Mira line / adaptive slot | Yes | §A.2 table plus swap rule |
| Home secondary-row order | Yes | journey/cold/mixed: Help Points near me · Report · Ask Mira; **contribute:** Report · Help Points near me · Ask Mira |
| Contribute section order | Yes, per visit | A ready check moves Checks above Report for that visit only |
| Mira suggestion chips | Yes | journey: "Take me home", "Find Help Points nearby", "What's open nearby?", "I'm landing somewhere new at night", "I feel uneasy"; contribute: "Report a broken streetlight", "What's open nearby?", "Take me home", "Find Help Points nearby", "I feel uneasy"; night overrides with the existing NIGHT list first |
| Report group order | By **entry point**, not usage (06 §3.13) | Deterministic |

### B.4 Cold start
- **Signed out:** row 10 and the default secondary order. Nothing is stored except the event log (if the user reports anonymously, the `report` event is stored locally).
- **Signed in, fewer than 3 events:** `cold` mode, rows 8, 9 and 11 dominate, and the secondary order is the default.
- There is **no** onboarding questionnaire and **no** persona pick (C-6.1).

### B.5 Resetting personalisation
Me → What Mira remembers has:
- **"Learn from my finished journeys to saved places"** (existing switch; server).
- **"Forget all"** (existing; deletes habits).
- **NEW: "Reset how Mira arranges Home"**, which clears `mira.usage.v1`, `mira.seen.verified`, `mira.seen.scout` and `mira.arrival-remember-shown`. A toast confirms: "Home is back to its standard layout."
- Sign out and Delete account also clear these keys (client handlers in `MeScreen`).

### B.6 Explicit safety settings: never adaptive (C-6.5)
Mira MUST NOT change any of the following automatically. It MAY suggest them as a card that the user taps:
- Circle membership and default sharing (`isDefault` on contacts);
- the Share-with / Just-me default for a journey. The existing "like last time" default comes from the user's own last choice to the same place and stays;
- emergency numbers and calling behaviour (country data only);
- missed-arrival alert behaviour, grace time, +10 min;
- Help Point exclusions;
- the "Learn from my journeys" switch;
- notification permission and push;
- the appearance pin.

### B.7 Seen-state flags (device-local, same privacy treatment)
| Key | Purpose |
|---|---|
| `mira.seen.verified` | last-seen verified count (row 7) |
| `mira.seen.scout` | steward status seen (row 3 / recognition, once) |
| `mira.arrival-remember-shown` | counter for the arrival "Mira will remember" line (≤3) |

The existing flags `mira.welcomed`, `mira.installDismissed` and `mira.theme` are unchanged.

---

## C. Community trust model

### C.1 Signal types and lifecycles (as built; nothing new at launch)

**1. Private report** (`/api/reports`, `src/server/report/*`, moderation, aggregation):
```
submitted (anonymous or signed in; ~1.2 km geohash cell; recency bucket; time band; hour-truncated;
           free text AES-256-GCM; PII detection warns the user and blocks moderator approval until redacted)
 → moderation queue (only when staffed; fixed reason codes: hold / reject / withdraw)
 → approved for aggregation
 → weekly aggregation (≥ 5 independent contributors in the same cell × time band × category family)
 → public community note: fixed template wording, no counts, no exact place, no time; shown ≤ 35 days
 → report deleted ≤ 30 days; withdrawal suppresses any release that drops below 5
```
"Other" is never published. **Reports are never counted toward impact or Mira Scout.**

**2. MIRA Check answer** (`src/server/contributions/checks.ts`, `src/domain/contributions.ts`):
```
journey arrives → ≤ 1 candidate chosen (contested > unknown hours > known hours; at night a known-hours
confirmation yields to "Was the way lit?") → question (Open / Closed / Didn't notice / skip)
 → pending receipt (subject encrypted) → corroboration at the same weekday × time band within the window
   (open/staffed 28 d, entrance 7 d, exists/hours/kind 30 d): ≥ 2 independent voices, or provider-listed
   hours agree for open/closed
 → verified | contradicted | differ (credible disagreement: nobody credited) | expired (30 d)
 → counted = first verified per subject per 30 days → impact
```

**3. Correction** (hours wrong / entrance closed / gone / wrong kind): the same rules as place claims. Corroborated corrections filter Help Points (`placeStatus`).

**4. Lighting vote** ("Was the way lit?"): per ~40 m street cell per day, with a keyed per-cell hash (no route linkage). The walker verdict needs **≥ 3 voices and ≥ 60% agreement**. It counts for 90 days and is deleted at 120. A receipt samples ≤ 8 cells.

### C.2 Verification and corroboration (principles in force)
- **Independence:** distinct keyed voter hashes. One voice per person per subject per window. Your other votes are removed before judging you, so you can't corroborate yourself.
- **Disagreement:** a credible opposing voice produces "reports differ". Nobody is credited, and the UI says so.
- **Decay:** every claim has a validity window (above). Nothing is "true forever" [P11].
- **Provider agreement** counts only for open/closed against listed hours.

### C.3 Reliability and spam resistance (existing)

| Mechanism | Where |
|---|---|
| Durable account (Google/email) required for checks and corrections | `ContributeScreen`, the API |
| Rate limits per person/link, plus a high per-IP ceiling | `src/server/ratelimit` |
| Idempotency keys on reports | `ReportScreen`, the API |
| Anonymous reports re-keyed to one pseudonym on sign-in (never two people) | `/api/auth/*` |
| Burst flag (>25 contributions in a day) and high-disagreement flag (>50% with ≥6 decided) | `reputation.ts` |
| No free text in corrections or tags; fixed reason codes | domain |
| PII detection; approval blocked until redacted | `domain/report/text.ts`, moderation |
| Aggregate thresholds (≥5) and fixed templates | aggregation |
| No public profiles, counts or leaderboards | product-wide |

### C.4 Contributor trust → Mira Scout

**Mira Scout = the existing Local Steward status** (`stewardStatus()`), renamed in the UI only. The criteria are unchanged. Beta defaults can be overridden with the `STEWARD_*` env vars. **All** of these must hold:
- a durable account (Google or email);
- an account at least **30 days** old;
- ≥ **25** verified, counted contributions;
- verified contributions on ≥ **10** distinct days;
- in ≥ **3** distinct ~5 km areas (keyed, hashed area keys);
- ≥ **80%** of decided answers confirmed by others;
- **no** anomaly flags.

**What Mira Scout grants:** eligibility for beta local verification tasks (existing wording) and recognition. **What it never grants:** weight over truth, faster publication, visibility of others' reports, or any public display.

### C.5 Recognition (launch)

| Surface | Treatment |
|---|---|
| Contribute → Your impact | "Mira Scout" with the scout mark and the explanatory sentence (06 §3.12), or "What it takes" with the existing needs list |
| Me → impact row | an inline "Mira Scout" tag |
| One-time moment | Home Mira line row 3 plus the Contribute recognition card, once per device (`mira.seen.scout`) |
| Never | the map, the shared view, notifications, other users |

**Qualifier formats in the thesis** ("Mira Scout · Saket", "Mira Scout · September"):
- **"· Saket" (area name) is NOT possible at launch.** Area keys are HMAC hashes by design (`receipts.ts areaKey`). Showing an area name means storing a readable area per contribution, which is a privacy change. **`REQUIRES_OWNER_APPROVAL`** plus a privacy review. Default: not built.
- **"· September" (month):**
  - Launch: "Mira Scout" alone.
  - Post-launch: "Mira Scout · since {month}" needs a stored `steward_since` date (a server addition, small).
  - "this month" copy needs a per-month verified count from `impactFor` (a small server addition).

  Both are §D items.

### C.6 Why volume must not equal reputation
- **Evidence:**
  - Google Local Guides awards points per submission, with nothing for accuracy, and is documented to produce point-farming and spam (03 Part 1 §20, Part 4 §9).
  - Community Notes rewards being right across independent raters and resists brigading (03 Part 1 §23).
  - In a safety context, volume incentives produce **fabricated or exaggerated danger**, the exact harm Mira must avoid.
- **Mira's rule:**
  - Nothing counts on submission.
  - Only independently corroborated, decided contributions count, once per subject per 30 days.
  - Disagreement lowers standing.
  - Bursts flag the account.
- **Reports** (incidents) are excluded entirely, because rewarding incident reports rewards the existence of incidents.
- **Owner decision point:** whether *corroborated* condition reports (for example "poor lighting" corroborated by ≥5) should ever count toward Mira Scout is `REQUIRES_OWNER_APPROVAL` (post-launch). Default: **no**.

### C.7 Abuse protection (people-safety)
- **No people categories.** The thesis's "suspicious activity" example is **REJECTED** [P3, C-5.3]. The nearest allowed categories describe *what happened to or near the reporter*: harassment, being followed, unwanted touching, threatening behaviour (which exists in the taxonomy but has no tile; it's reachable via Mira's report card). Never *who*.
- Free text is private and moderated, and never published. The PII warning is shown before sending.
- No comments, replies or public threads. There's no way to message another contributor.
- Public output is aggregate-only, with fixed wording and no counts.
- Mira Scout is private and powerless over truth.
- Journeys are never linked to reports. Location is coarsened to ~1.2 km.

### C.8 Close the loop (launch copy, truthful)
- **After a report:** "It's private. If others report something similar here, it can become a community note. Mira never shows one person's report." (06 §3.13).
- **After a check answer:** "Thanks. Waiting for someone else to confirm."
- **Later:** Home row 7 and Contribute impact ("Someone else confirmed what you told Mira").
- **Reports have no per-report status** for the reporter at launch (no API). Promising updates would be false (C-3.3). See §D.

### C.9 Report taxonomy and the thesis's examples (launch mapping)

| Thesis example | Launch path (existing) |
|---|---|
| Streetlight stops working / poor lighting | Report → "Dark or broken street" (environment; moderator tag `poor_lighting`); or "Was the way lit?" after a walk |
| Harassment | Report → Harassment |
| Suspicious activity | **Rejected** (people-reporting). Threats or intimidation remain reportable via Mira's report card |
| Damaged infrastructure / unsafe road conditions | Report → "Dark or broken street" (tags `broken_footpath`, `no_footpath`, `obstruction`) |
| Flooding | Report → "Dark or broken street" with a note. No dedicated tag. **It won't become a public note** (no template), which the UI must not imply |
| An accident | **Not a report.** If someone is hurt, it's an emergency (Emergency pill). Mira is not an emergency service |
| An isolated area | Report → "Dark or broken street" (tag `isolated_stretch`) |
| A closed help point | Contribute → **Correct a place** → "The place has closed down or moved" / "The opening hours are wrong" / "The entrance is closed" |
| Something unusual | "Something else" (private, never published) |

**Launch UI copy change (presentation only):**
- The tile hint for "Dark or broken street" becomes "Lighting, footpaths, blocked or flooded streets".
- This is defined in `ReportScreen`'s tile list. `CATEGORY_HINT` in the domain stays unchanged for moderators.

---

## D. Post-launch capabilities (not in the launch plan)

| # | Capability | Needs | Gate |
|---|---|---|---|
| D1 | Taxonomy extension: `flooding`, `road_hazard`, `damaged_infrastructure` as environment sub-categories with public templates | DB check constraint, moderation tags, aggregation templates, tests | `REQUIRES_OWNER_APPROVAL` |
| D2 | "Still there?" one-tap confirmations for condition claims to people passing (StreetComplete/Waze pattern), outside journeys | location-triggered prompts, new endpoint, privacy review | `REQUIRES_OWNER_APPROVAL` |
| D3 | Per-report status for the reporter ("reviewed", "part of a community note", "expired") | an API over the user's own reports (pseudonymous link exists), privacy review | `REQUIRES_OWNER_APPROVAL` |
| D4 | Mira Scout "since {month}" / "this month" | `steward_since`, per-month counts in `impactFor` | small server change; owner OK |
| D5 | Area-named Scout ("· Saket") | readable area per contribution | privacy review, `REQUIRES_OWNER_APPROVAL` (default: no) |
| D6 | Corroborated condition reports count toward Scout | reputation change | `REQUIRES_OWNER_APPROVAL` (default: no) |
| D7 | Server-synced usage mode (cross-device) | a new user pref | owner OK |
| D8 | Mira companion aware of saved-place names in tools (fixes the "is Kamla Nagar your Home?" gap, 01 §4.10) | tool context and persona tests | engineering; not UX |
| D9 | "Heightened watch" after I feel unsafe (shorter check-in interval) | worker and escalation change | `REQUIRES_OWNER_APPROVAL` |
| D10 | Discreet mode (neutral icon and name, quick-exit) | manifest and brand | `REQUIRES_OWNER_APPROVAL` |
| D11 | Share "reason" chip in the contact message | shared-view payload | owner OK |
| D12 | Native `<dialog>` migration; `transform` sheet with velocity snapping (if not done in Phase 9) | component internals | engineering |
| D13 | Google basemap `styles` to declutter business POIs | tile-session provider | owner OK |
