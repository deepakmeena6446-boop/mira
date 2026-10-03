# Mira — Phase 1 UX architecture

## The one idea

> **Tell Mira what you're about to do. Mira shows what it can actually check about that, at that time, there — and stays with you while you go.**

Google Maps answers *how do I get there*. Find My answers *where is she*. A chatbot answers *anything, confidently*.
Mira answers *what should I know before I do this, and who has my back while I do it*. It labels every answer with how it knows.

## 1. Core interaction model: Situation → Brief → Decide → Move → Close

| Step | What the person does | What Mira does | Surface |
|---|---|---|---|
| **Situation** | Picks or says what she's about to do: going somewhere, a run, checking a place, travelling, or just asking. | Reads the time, the daylight and the place (only if location was granted). | Home, Mira |
| **Brief** | Waits about 2 seconds. | Runs the checks it has for *that place at that time* and returns a **Mira Brief**: options plus an **evidence ledger**. | Plan, Around place sheet, Mira cards |
| **Decide** | Compares options, changes the time or mode, asks a follow-up. | Recomputes. It never ranks with a score; it states differences only where evidence supports them. | Plan |
| **Move** | Taps *Go with Mira* and confirms who (if anyone) can follow. | Live journey: ETA, check-in, sharing receipts, Help Points ahead. | Journey (immersive) |
| **Close** | Arrives, or ends early. | Says what happened. Optionally offers one Mira Check ("was it lit?"). | Journey → Arrived |

The **Mira Brief** is the product's atomic unit. It appears in the same visual grammar wherever Mira knows something: Plan, a place in Around, a Mira reply, and the journey.

### Evidence grammar (the signature of the product)

Every line in a brief is one claim with exactly one of these states. Each state has its own glyph and label, so colour is never the only signal.

| State | Glyph | Label | Meaning | Example |
|---|---|---|---|---|
| **Checked** | ● solid dot | `Checked` | A source establishes it, with a stated time. | "Dark at 10:30 PM · solar calculation" |
| **Estimate** | ◐ half dot | `Estimate` | Calculated with stated assumptions. | "About 18 min at walking pace · Google route" |
| **People** | two dots | `From people` | Released community notes or walker votes. | "2 notes nearby this month" |
| **Not available** | ◌ dashed ring | `Not available` / `Couldn't check` / `No data` | Mira doesn't have it, the check failed, or the source has nothing. These three are worded differently. | "Crowds and live incidents · Mira has no source for this" |

A ledger always ends with what Mira **can't** see. That honesty is the differentiation.
Nothing is ever summarised as a score, a colour verdict or a "safe" word.

**Mira's take.** One or two deterministic sentences at the top of a brief state the *differences* the evidence supports, for example "It will be dark. The first way has more of its length mapped as lit."
They are templates over evidence, never model output, and they never name a verdict.

## 2. Navigation

```
┌──────────────────────────────────────────────┐
│  Home      Mira      Around      Journeys    │   ← tab bar (4)
└──────────────────────────────────────────────┘
   Profile = avatar on Home.   Support (I feel unsafe · Emergency) = top-right of every root.
   Plan = a flow opened from Home/Mira/Around, not a tab.
   Active journey = immersive (no tab bar). While one runs, a Journey dock sits above the tab bar everywhere.
```

- **Home `/`**: *now*. Context, intents, and one or two things Mira noticed.
- **Mira `/mira`**: ask anything about a place, a time or a plan. Answers are briefs with actions.
- **Around `/around`**: what Mira knows here, as a map plus a feed. This is where community becomes visible.
- **Journeys `/trips`**: the active journey, saved plans and recent closures. Phase 2 redesign; reused as-is now.
- **Plan `/plan`**: the decision flow. Entered with a situation preset (`?for=go|run|travel`).
- **Journey `/trip`**: the immersive live screen.

**Why four tabs and not five.**
- Plan is a verb, reached from wherever the situation starts.
- Profile is visited rarely and doesn't earn a permanent slot.
- Ask (Mira) earns a tab because it's the intelligence layer across everything.
- Around earns one because "what's around me" is a standing need, separate from any trip.

**Rollback.**
- `NEXT_PUBLIC_MIRA_GO_ENTRY=go` restores Go · Journeys · You with the previous Go screen.
- `=legacy` restores the five-tab Today.
- The previous plan form stays reachable at `/plan/legs` (multi-leg, return planning and saving).

## 3. Screen hierarchy

```
Home /
├─ Header: avatar (→ /me) · Support
├─ Context line: area · local time · daylight now (sun sets in 40 min / dark until 6:12)
├─ Mira composer ("What are you about to do?") ───────────→ Mira (seeded)
├─ Situation intents (4): Go somewhere · Run or walk · Check a place · Travelling
│     → /plan?for=go     → /plan?for=run    → /around (search)  → /plan?for=travel
├─ Noticed (0–2, only when real): usual journey · saved plan · one local update · a Mira Check
└─ First-time only: "How Mira works" in three lines

Plan /plan?for=…
├─ Situation strip (Go somewhere · Run/walk · Travelling)
├─ Question rows: From · To (or Start + Duration) · When · How
├─ [resolves] → Brief
│    ├─ Map (route options drawn; lit segments shown only where evidence exists)
│    ├─ Options (2–3 cards: time, distance, lighting coverage, Help Points count)
│    ├─ Mira's take (deterministic)
│    ├─ Evidence ledger for the chosen option: daylight · lighting · walk time · Help Points at that time
│    │   · notes · local updates · not available
│    └─ Later-daylight alternative (when it's dark and daylight comes within 4 h)
└─ Action bar: [Go with Mira] (primary) · Save · Ask Mira about this
       └─ Confirm sheet: who can follow (Just me default) · check-in time · Start
```

```
Mira /mira
├─ Header + context chip (where/when Mira will use; tap to change or turn off)
├─ Empty: situation starters grouped (Going out · Running · Travelling · Right now)
├─ Turns: Mira text + structured brief cards with inline actions
│     trip → "Compare ways" (→ Plan) / "Go with Mira"
│     places / help_points → "Show in Around"
│     plan_brief → evidence ledger + "Open plan"
└─ Composer with AI disclosure
```

```
Journey /trip (immersive)
├─ Status band: destination · minutes left · ETA · who can follow · degraded flags
├─ Map (follow) with Help Points ahead
├─ Primary: I'm here (thumb zone, always)
├─ Quick row: +10 min · Send link · Help near
└─ "More" sheet: who follows (receipts, revoke, add) · change destination/check-in · position details · end early
States: active · missed (warm, "Are you okay?") · GPS off · upload failing · checks paused · arrived · ended
```

```
Around /around
├─ Header: area name · Support
├─ Check-a-place search
├─ Map (40% height): you, Help Points, selected place
├─ "Here, now" brief: daylight · Help Points open now (nearest 3) · notes count
├─ Local updates (sourced, dated; window 7 days)
├─ From people: community notes + "Add what you noticed" (light chips → report / lit vote / correction)
└─ Place sheet (when a place is chosen): walk brief from you → Plan going here · Ask Mira · Save
```

## 4. Major user journeys (Phase 1 click paths)

1. **"Can I go for a run here around 5 AM?"**
   - Home → *Run or walk* → Plan (start: here, 30 min, 05:00).
   - The brief shows: dark until 06:12 (Checked), first daylight 06:15 (alternative), Help Points near the start listed open at 05:00 (Checked hours; staffing not verified).
   - Mapped loops appear only where the walking graph exists; elsewhere they show as Not available.
   - Then: Save, or Go with Mira at run time.
2. **"Hotel to café at 10:30 PM."**
   - Mira or Home composer → intent hints seed the plan → places resolve from search.
   - Brief: two ways compared by lighting coverage and Help Points, dark at that time, local updates near the café.
   - Then Go with Mira → confirm who follows → Journey.
3. **"What should I know before walking around this neighbourhood?"**
   - Around → search the area → place sheet brief: Help Points open now, notes, updates, walk from you.
   - Then Ask Mira or Plan going here.
4. **"Travelling to Dubai tomorrow."**
   - Home → *Travelling* → Plan (arrive at airport/hotel, local time in the destination zone, ride).
   - Brief: provider travel time (Estimate), Help Points where you arrive, dark at arrival, the destination country's emergency number (Checked, reviewed status), and planned-time service as Not available.
5. **Moving.** Journey → glance (time left, who follows) → +10 min → I'm here → You made it.

## 5. Design principles

1. **Situation first, features never.** Every entry point is something a person is about to do.
2. **Show how Mira knows.** Each claim carries its state glyph; every brief ends with what Mira can't see.
3. **Calm by default, warm when it matters.** Attention colour appears only for missed check-ins, broken sharing or failed delivery, never for a place.
4. **One clear next step.** One filled button per screen, in the thumb zone. Everything else is quieter.
5. **Progressive disclosure.** Conclusion → action → who can see → evidence → details.
6. **Map when it answers something.** A map appears when there's a route or places to show, never as a backdrop.
7. **Degrade honestly.** Offline, no location, no source, a failed check: each gets its own words and a next step.
8. **No guesswork about people.** Receipts only. "Opened WhatsApp", "email accepted, receipt unknown".
9. **Phone first.** 375×812 is the design size and 320×700 must work. 44 px targets, one-handed, supports 200% text.

## 6. Component system (`src/components/mira/`)

| Component | Role |
|---|---|
| `Screen`, `RootHeader` | Root screen frame: safe areas, title, Support cluster, tab-bar spacing |
| `SupportCluster` | Restyled `SafetyAccess` / `HelpCluster`: quiet, compact, always the same place |
| `MiraVoice` | Mira's line: pulse + sentence (+ optional action). Used for greetings and "Mira's take" |
| `Composer` | The "Tell Mira" input with AI disclosure. Home is a link-style launcher; Mira is the real input |
| `IntentTile` | One situation (icon, verb phrase, one-line promise) |
| `EvidenceLedger`, `EvidenceRow`, `EvidenceGlyph` | The evidence grammar above |
| `OptionCard` | One way or option: time, distance, two evidence facts, selected state |
| `QuestionRow` | Tappable plan field (label, value or placeholder, state); opens a picker sheet |
| `PlaceSearchSheet` | Search with saved places and "current location" (only by explicit choice) |
| `ActionBar` | Sticky bottom bar with one primary and quiet secondaries, above the safe area |
| `Sheet` | Modal bottom sheet (overlay-aware, focus-trapped) |
| `JourneyDock` | Active-journey capsule shown above the tab bar on every root |
| `StateNote` | Inline empty / failed / offline / permission notes with a next step |

**Tokens.**
- Keep the owner-approved navy/cobalt identity (D34).
- Add a dusk/daylight accent (`--color-dusk`) used only for daylight and lighting facts.
- Add a calm "people" tint for community facts.
- Increase radii (cards 20 px, sheets 28 px).
- Type scale: display 32/36, title 22/28, body 16/24, meta 13/18.
- Motion stays meaning-only (pulse states, rise on new evidence).

## 7. What is reused, rebuilt, or missing

See `02_PHASE1_REPORT.md` for the final list after the build.
