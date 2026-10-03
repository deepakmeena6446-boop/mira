# Phase 1 audit — what Mira has, and why it doesn't show

Branch `ux/phase1-core`, built on the main checkout's working tree as of 2026-10-03 17:37 (vNext candidate, uncommitted there).

## 1. Current frontend architecture

| Surface | Route | File | What it is today |
|---|---|---|---|
| Go (root) | `/` | `GoScreen.tsx` → `PlanScreen` | A text box ("What's your plan?") that seeds a plan draft, then swaps itself for the 3-step plan form. |
| Plan | `/plan` | `plan/PlanScreen.tsx` | A long form: activity, From/Find, To/Find, loop, timing, IANA time zone text field, mode select, constraints. Options, map, journey controls and plan chat sit under a second step tab. |
| Map | `/around/map` | `HomeScreen.tsx` (970 lines) | The old full-screen map with a bottom sheet: search, route options with lighting and Help Points, mode switch, Circle line, Go with Mira. The richest decision surface in the app, now buried two levels deep. |
| Around | `/around` | `around/AroundScreen.tsx` | A list of links: plan summary, search, place brief, Community pulse, news. |
| Ask | `/mira` | `mira/MiraChat.tsx` | A generic chat transcript and composer. It has structured cards (trip, places, help_points, plan_brief, sos, report), but they look like attachments. |
| Active journey | `/trip` | `trip/TripScreen.tsx` (803 lines) | Map plus a sheet holding ~25 controls and ~12 status paragraphs at once. |
| Manual journey | `/trip/local` | `LocalCheckInScreen.tsx` | A guest journey on this device only, with no GPS. |
| Journeys | `/trips` | `trips/page.tsx` | Saved plans and the current trip. |
| You | `/me` | `me/*` | Account, places, Circle, habits, impact, privacy. |
| Legacy | `/today` | `TodayScreen.tsx` | The previous home, kept behind a flag. |

**Navigation.** The tab bar is Go · Journeys · You (`TabBar.tsx`; legacy flag gives five tabs). Ask, Around and the map are reachable only by links inside other screens.

**Design system.**
- Tokens in `globals.css`: navy, cobalt and off-white, with time-of-day themes (night is dark).
- Font: Instrument Sans.
- Primitives: `Button`, `Icon` (line set), `BottomSheet`, `MiraPulse` (presence mark), `HelpCluster` / `SafetyAccess` (I feel unsafe + Emergency) and `Toast`.
- The newest screens use dense one-off Tailwind strings plus seven ad-hoc `.mira-*` classes.

## 2. The five journeys today

1. **Open the app.** You get a blank composer that asks you to write a plan. There is no sense of where or when you are, of what Mira knows nearby, or of what Mira is for, unless you already know.
2. **Ask Mira.** There's no visible bridge from an answer to an action except a "Review options" link. Guests are pushed to sign in.
3. **Go somewhere.**
   - You type your plan, then fill the form, press Find twice, type an IANA zone, open step 2, and read a paragraph-heavy options list.
   - The options list only covers the pilot walking graph (one campus).
   - The global evidence engine (`/api/geo/route`: Google or OSM routes, lighting along the way, Help Points along the way, community notes, alternatives) feeds only the buried map screen.
4. **Active journey.** One screen carries every receipt, caveat and control. The primary action "I'm here" competes with about six bordered buttons and long fine print.
5. **Around.** The local layer is a list of links. Help Points near you, lighting, community notes and Mira Checks don't appear together.

## 3. Capabilities that exist but are hidden or weakly exposed

| Capability | Backend | Where it shows today |
|---|---|---|
| Routes with lighting evidence along them | `/api/geo/route` (walk) | Only `/around/map` |
| Help Points along a route and at arrival, with hours at time | `/api/geo/route`, `/api/geo/help`, `hoursState` | Map sheet and journey |
| Ride/transit provider time + Help Points where you arrive | `/api/geo/route` (mode) | Map sheet |
| Daylight at the planned time, plus the first later daylight | `daylightAt`, `laterDaylight` (client-pure) | A grey paragraph in plan options |
| Local official/news updates (GDELT, sourced, dated) | `/api/safety-updates` | Bottom of Around and Today |
| Community notes (aggregated, released) | `/api/community/nearby`, notes in route | Around ("Local pulse") |
| Habit suggestion ("usually home around now") | `/api/me/habits/suggestion` | Map sheet line |
| Saved places / saved plans | `/api/me/places`, `/api/me/plans` | Me / Journeys |
| Mira Checks and impact, Mira Scout | `/api/contribute` | Contribute screen and the Mira line |
| Country emergency context | `/api/geo/reverse` → country, `/api/plan/country` | Emergency pill only |
| Movement-intent extraction | `/api/mira/intent` | Go composer (silent) |
| Notification inbox | `/api/me/notifications` | Bell on the map screen only |

## 4. Production-ready vs partial

- **Production-ready:**
  - Trips: start, location, arrive, end, extend, change, share, revoke, link, checkon, missed-alert worker.
  - Geo routes, help and reverse (Google, with OSM fallback).
  - Lighting evidence (OSM ways/poles plus walker votes).
  - Safety updates (GDELT, classified).
  - Mira chat (Claude, guarded by the deterministic output check).
  - Contacts (WhatsApp-first) and places.
- **Partial:**
  - Plan options: the pilot walking graph only. Loops exist only where that graph is imported.
  - Ride/transit planned-time service: always "unknown" by design.
  - Mira chat needs sign-in; guests get only the deterministic `/api/mira/plan`.
  - Notification push needs VAPID.
  - Background location: none (foreground only).
- **Missing:** no reminder or scheduled start, no loop generator outside the pilot area, no time-aware community layer, no crowd or live-incident data. These stay "unavailable", never faked.

## 5. Constraints carried into the redesign

These come from `docs/mira-vnext`, `PRINCIPLES.md` and the launch-ux constitution.

- No verdict words in the UI: safe, safer, unsafe, dangerous, well-lit, deserted.
- No score and no red/green.
- unknown ≠ empty ≠ failed ≠ unavailable.
- Every claim shows its source and age.
- Help Points are always candidates: staffing is unverified.
- Nothing is shared, started or sent without a tap. "Just me" is the default.
- Say only what a receipt proves ("Opened WhatsApp", "email accepted, receipt unknown").
- Emergency and "I feel unsafe" are reachable in every state, never covered, and quiet in style.
- A named origin is never replaced by GPS.
- The plan draft stays in the tab and expires after 2 h.
- One filled primary action per screen.
- Planning never forces sign-in or location.

## 6. Decisions this redesign reverses (owner instruction, 2026-10-03)

- **D06/D25 tabs:** Go · Journeys · You becomes Home · Mira · Around · Journeys. Profile moves to the avatar. The legacy flag is kept, and `NEXT_PUBLIC_MIRA_GO_ENTRY=go` restores the previous Go entry.
- **C-11.4 "no feature grids":** Home shows four situation intents. They are situations, not features.
- **"City news not shown on Go":** Home may surface **one** local update when it exists, with source and date, never a feed.
