# Phase 1 report — the five core experiences

- **Branch:** `ux/phase1-core`
- **Worktree:** `.claude/worktrees/phase1-ux`
- **Commits:** 4 on top of a baseline snapshot of the main checkout's uncommitted vNext work
- **Docs:** read with `00_AUDIT.md` (what existed) and `01_UX_ARCHITECTURE.md` (the model)
- **Screenshots:** `screenshots/` (390×844 unless named otherwise; live data, Kamla Nagar, Delhi)

## 1. Screens

| # | Experience | Screenshots |
|---|---|---|
| 0 | Before (previous Go) | `00-before-go.jpg` |
| 1 | **Home** | `01-home.jpg`; with a journey running (dock): `01b-…`; 320 px, night theme, location off: `01c-…` |
| 2 | **Mira** | Empty state and starters: `02-mira.jpg`; deterministic plan answer: `02b-…`; Claude companion with a Help Points card: `02c-…` |
| 3 | **Plan / decision** | Walk brief: `03-plan-brief.jpg`; run at 5 AM: `03b-…`, `03c-…`; consent sheet: `03d-…`; travel ledger: `03e-…`; honest gaps: `03f-…` |
| 4 | **Active journey** | Active: `04-journey-active.jpg`; missed check-in: `04b-…`; arrived: `04c-…`; "More" layer: `04d-…` |
| 5 | **Around** | Around me: `05-around-me.jpg`; place brief: `05b-…`; no location: `05c-…`; Help Points and the community layer: `05d-…` |

## 2. Main flow (verified in the browser, signed in and as a guest)

```
Home ─ "What are you about to do?" ──────────────► Mira (question handed over, never in the URL)
  │                                                   │  plan card → "Complete plan" / "Start where I am"
  ├─ I'm going somewhere ─► Plan (situation=go) ◄─────┘  trip card → "Compare ways" / "Go with Mira"
  ├─ A run or walk ───────► Plan (situation=run)
  ├─ I'm travelling ──────► Plan (situation=travel; times in the destination zone)
  └─ Check a place ───────► Around (search open) ─► place brief ─► Plan going here / Ask Mira / Save

Plan: questions → Mira's take → map → ways to compare → evidence ledger
   └─ Go with Mira (if leaving within 30 min) → consent sheet (Just me | people) → Journey
   └─ Save this plan (if later) · Ask Mira about this · Return trip or more legs (/plan/legs)

Journey: glance → one next action (Send to Priya / Send link / I'm here) → +10 min · Send link · Help near → More
   missed → "Are you okay?" (warm) → I'm here         arrive → "You made it." → Mira Check, way back
Every root: I feel unsafe · Emergency (country number), same place. A running journey shows a dock on Home and Around.
```

## 3. Navigation architecture

The tabs are **Home · Mira · Around · Journeys**. Every other surface sits in context:

- **Profile:** the avatar on Home.
- **Plan:** a flow opened from a situation.
- **Journey:** immersive, with no tab bar.
- **Support:** in the header of every root.

The rationale is in `01_UX_ARCHITECTURE.md` §2. Rollback options:

| Setting or route | What it gives you |
|---|---|
| `NEXT_PUBLIC_MIRA_GO_ENTRY=go` | Previous Go · Journeys · You |
| `NEXT_PUBLIC_MIRA_GO_ENTRY=legacy` | Previous five-tab Today |
| `/plan?planStep=…` and `/plan/legs` | The step planner, still working (return legs, multi-leg, save with return) |

## 4. Existing backend reused (no backend code changed)

| Capability | API / module | Used in |
|---|---|---|
| Walk routes + lighting + Help Points along + notes + alternatives | `POST /api/geo/route` | Plan, Around place brief, Journey |
| Ride/transit provider time + Help Points where you arrive | `POST /api/geo/route` (mode) | Plan (go, travel) |
| Mapped loops (pilot graph), daylight alternatives | `POST /api/plan/options` | Plan (run) |
| Help Points near a point with hours; ranking; hours at a time | `POST /api/geo/help`, `hoursState`, `rankHelpPoints` | Plan (run), Around, Journey |
| Area name, country, emergency numbers, country timezone | `POST /api/geo/reverse`, `emergencyActions` | Header pill, Plan (travel), Mira |
| Local official/news updates | `POST /api/safety-updates` | Home (one line), Plan, Around |
| Community notes (released) | `POST /api/community/nearby`, route notes | Plan, Around (map and list) |
| Place search | `POST /api/geo/search` | Plan, Around |
| Mira companion (Claude) + deterministic plan Ask + intent hints | `/api/mira`, `/api/mira/plan`, `draftFromAsk` | Mira, Home hand-off |
| Habit suggestion, Mira Checks, saved plans, saved places | `/api/me/habits/suggestion`, `/api/contribute`, `/api/me/plans`, `/api/me/places` | Home "Mira noticed", Around Save |
| Journeys (start, location, arrive, extend, share, revoke, link, change, checkon), safety net | `/api/trips/**` | Go sheet, Journey (all logic kept) |
| Daylight (NOAA approximation), later daylight | `daylightAt`, `laterDaylight` (+ new pure `domain/daylight.ts`) | Home, Plan, Around |
| Private manual check-in (guest) | `local-check-in-store` | Go sheet (signed out) |

**Rebuilt frontend (new or replaced files):**

- **Shared components:**
  - `components/mira/{Evidence,Frame,BriefMap,JourneyDock}.tsx`
  - `lib/{brief,decision-take,ask-handoff}.ts`
  - `domain/daylight.ts`
- **Screens:**
  - Home: `HomeNow.tsx`
  - Plan: `plan/{PlanDecision,PlanSheets,GoSheet}.tsx`
  - Around: `around/AroundNow.tsx`
  - Mira: `mira/MiraChat.tsx`
  - Journey: the render half of `trip/TripScreen.tsx`
- **Changed in place:**
  - `TabBar`
  - `HelpCluster`, `EmergencyPill`, `SafetyAccess` (adds a compact variant)
  - `(app)/layout.tsx` (journey dock)
  - `globals.css` (evidence tints, layout utilities)

## 5. Still hidden or not integrated

- **Journeys tab:** unchanged (Phase 2). Saved plans, history and the current plan still use the old card style.
- **Profile, Circle, inbox, privacy, habits, contribute, report, Scout:** reachable but not redesigned. Community "Add what you noticed" links into the old Contribute and Report screens.
- **Notification inbox:** no entry point on the new Home yet. The bell lived on the old map header.
- **Old full-screen map (`/around/map`):** no longer reachable from the roots. Its long-press "Report here / Go here" and "drop a pin" have no new home yet.
- **Lighting vote ("Was the way lit?"):** only after arrival (AfterArrival) and in Contribute.
- **Multi-leg / return planning:** only through "Return trip or more legs" (the old planner).
- **Unused leftovers:** `GoScreen`, `AroundScreen`, `PlanOptions`, `PlanJourneyControls` stay only for the rollback flags and `/plan/legs`. Delete them in Phase 2 once the flags are retired.

## 6. UX issues found while building

1. **One tab, one plan.** A plan seeded by Mira (a 5 AM run) leaked into "I'm going somewhere".
   - *Fixed:* a different situation chosen on Home now starts fresh.
   - *Remaining:* Mira answers about whichever plan is in the tab. Phase 2 needs explicit plan identity ("this plan / new plan").
2. **The companion's prose repeats its own card.** The Claude reply lists every Help Point, then the card lists them again. This is fixable in the companion prompt (one-line lead-in when a card is attached).
3. **Mira's plan answers are deterministic and form-like.** For example: "enter the date and local time zone so I don't guess an instant". They're correct, but they read like validation errors. The plan card now offers "Start where I am" and "Complete plan" as the conversational next step.
4. **The map captures scroll** inside a brief on touch devices. It needs `cooperativeGestures` (two-finger pan) or a static preview that you tap to expand.
5. **Bug found and fixed (pre-existing in the baseline):**
   - `TripScreen.freshMe` rejected any fix more than 10 s newer than `useClock()`, which lags real time by up to ~30 s.
   - Effect: for most of each minute a fresh fix counted as "too old", and Help Point ranking disappeared mid-journey.
6. **Hydration mismatch (pre-existing pattern):** a sessionStorage route rendered during SSR. Fixed by gating it on the client clock.
7. **Saving a plan built from Google search results is refused** (`provider_content`: Google content can't be stored). The UI explains this, but most real plans outside the pilot area can't be saved today.
8. **Very long `I'm here` area in the missed state** pushes the quick row below the fold on 667 px phones. Consider a compact missed layout.
9. **Help Point counts can be large** ("12 on this way" for 0.9 km) because the corridor is 200 m. "Listed open then" is the useful number. Consider leading with it.

## 7. Backend gaps (UI marks these as Not available; nothing is faked)

| Gap | Effect today |
|---|---|
| Loop/run routes outside the imported pilot graph | Run plans show daylight + Help Points near the start; "Mira can't map a loop here yet" |
| Planned-time transit/ride service | Always "not checked" |
| Reminders / scheduled start for a saved plan ("remind me at 4:50 AM") | Not possible; Save only |
| Background location (native) | The journey is foreground-only, as said in the UI |
| Lighting along ride/transit last-walk legs | Not computed |
| Local updates provider (GDELT) failing intermittently | Shown as "Couldn't check · Try again" (seen throughout testing) |
| Storable place identity for Google results | Plans with Google places can't be saved |
| Crowds / live incidents | No source; always listed under "Mira can't see" |

**Environment notes:**
- **Migration:** I applied the pending, additive `0024_trip_recipient_delivery` migration to the local dev DB. Without it every worker's journeys job failed and journeys couldn't start. It is in the main checkout's journal.
- **Docker restart:** OrbStack restarted itself during testing. I restarted `mira-db-1` and `mira-mailpit-1`, which have no restart policy.

## 8. Tests

- **Typecheck:** clean.
- **ESLint (`src`):** clean.
- **Unit tests:** 784/784 pass. One failure along the way was a real regression (return-journey link), and it is fixed.
- **E2E: not run.** These specs drive the old Go/Plan UI by exact strings and will need rewriting for Phase 1: a, d, g, h, k, l, m, n, o, p, q, r, u. The strings involved include "What's your plan?", the Go/Journeys/You tabs, "Compare my options", "Let's plan", "Local pulse" and "Start chosen journey".
- **Recommended:**
  - Run the suite with `NEXT_PUBLIC_MIRA_GO_ENTRY=go` to confirm the rollback path is intact.
  - Add new specs for the Phase 1 click paths in §2.

## 9. Proposed Phase 2 architecture

Phase 2 keeps one visual system: the components in `components/mira/` plus the evidence grammar.

1. **Journeys (Activity):**
   - One timeline: the active journey card (same as the dock), *Upcoming* (saved plans with "Check again for that time"), and *Earlier today* (closed journeys, 24 h).
   - Return/multi-leg planning folds into Plan as "Add the way back".
   - The old step planner is retired.
2. **Plan identity:** named plans in the tab (current + one previous), so Mira and Home always say which plan they mean.
3. **You (Profile):**
   - Header card (name, durable account).
   - Circle (WhatsApp-first contacts, default "Just me").
   - Places.
   - Habits & privacy (with forget controls).
   - Appearance.
   - Emergency info for the current country.
   - Sign-in and onboarding: one sheet with the 18+ attestation kept verbatim.
4. **Community:**
   - Contribute and Report become sheets launched from Around and Journey, not pages.
   - Mira Checks become one-tap cards.
   - Lighting vote: three chips.
   - Corrections: pick the place from the map.
   - Mira Scout and impact live in You → "What you've added".
5. **Notifications:** a bell in Home's header (signed in) opens an inbox sheet. Each item deep-links to the brief or journey it concerns.
6. **Map:**
   - Retire `/around/map`.
   - Long-press "Report here / Go here" moves into Around's map (expandable to full screen).
   - Add `cooperativeGestures` to fix scroll capture.
7. **States pass:** one inventory of initial, loading, empty, failed, offline, permission and signed-out across every screen, using `StateNote` and the evidence kinds.
8. **Moderator/admin:** keep it separate (desktop), but restyle it to the same tokens.
9. **Tests:** rewrite the E2E specs per experience around roles and labels that the new components guarantee.
