# Mira — Phase 2 report

Branch `ux/phase2` (from local `main` 7dc7921). This branch is not merged and not pushed. It waits for the owner's approval of the screenshots.

## What changed, screen by screen

| Area | Before | Now |
|---|---|---|
| **Journeys** `/trips` | Bordered old cards. One "current plan" box, a separate saved list, and an "Earlier today" list that actually covered 24 h. | **Now** shows the live journey as the same sky-card glance used on `/trip`, or a private check-in, or the four ways to start. **Coming up** holds this tab's plan and the saved plans, ordered by when they start. **Last 24 hours** shows closed journeys. |
| **Plan identity** | Plans had no id or name. Reopening and saving a plan duplicated it. | One derived name and one *when* line ("To Hansraj College · Today, 9:00 PM · from Kamla Nagar"), shown the same way in Plan, Mira, Home and Journeys. A reopened saved plan updates its own copy (`PATCH /api/me/plans/:id`). Mira's plan strip offers **Start a new plan**. |
| **The way back** | Only possible in the old step planner (`/plan/legs`). | **Add the way back** sits inside Plan. It reverses the places, or asks where you're coming back to, then asks *when*, offering times after the trip there. Tapping a leg brings it into the brief so Mira checks it for that time, and the other direction stays one tap away. |
| **You** `/me` | A long stack of old sections. | Built from shared parts, top to bottom: identity card, Your Circle, Your places (added from a sheet), What you've added, travel preference, What Mira remembers, Help Point kinds, **emergency numbers and helplines for the current country**, account, notifications, app, privacy. Sign-out and account deletion are confirmed in sheets. The tab title is "You". |
| **Circle, Privacy** | Different frames. | Same frame as You (back button + Support pair, display title, Plan-style inputs). |
| **Report** | Text "Back" link, bordered tiles, its own chips. | Report types are shared rows. Form steps use Plan's chips and segmented control. The Support pair sits in the header. |
| **Contribute** | Opened with a "0" impact chart. | Opens with "Add what you know", then Mira Checks, then report shortcuts. Impact appears only once there is any. |
| **Updates** (inbox) | Unreachable from the new Home. | A **bell on Home** shows the unread count. The inbox uses shared rows with a tone per kind, unread dots and whole messages. |
| **Full map** `/around/map` | The legacy Home: overlapping chrome and two journey banners. | Same structure as the journey screen: the map above (back button + Support pair, centre-on-me) and a sheet below (Check a place, Help Points near you). Press and hold the map to get **This spot** with **Report here** and **Go here**. Maps inside pages now use two-finger gestures, so they no longer steal page scroll. |
| **Guest check-in** `/trip/local` | Legacy hero classes. | The same sky-card glance as a live journey, controls below it, and the Support pair in the header. |
| **Admin** | Old tokens. | Same cards, headings and wordmark. Still its own desktop frame. |

New shared parts in `src/components/mira/`:
- `Row`, `RowList`, `RowAction` — lists of things
- `Group`, `GroupRow`, `Toggle`, `Chip` — groups of settings and facts
- `JourneyGlance`
- `SituationChips`

The legacy `Section` now renders as a `Group`. The old card radius token was set to the Phase 1 value, so any remaining old card gets the same corners.

## Changed from the plan, and why

- **Report and Contribute stay pages, not sheets.** A report has several steps and a free-text field, which work better full screen. One-tap contributions remain inline on Home, Around and arrival. Both pages now share the same frame and parts.
- **The inbox is a page, not a sheet.** It is reached from the bell, and items deep-link out of it.
- **The legacy map moved to `/around/map/classic`, not deleted.** Nothing in the app links to it. It still carries flows the old E2E specs drive: the options comparison, starting a chosen or manual journey from the map, and multi-city legs. It is deleted together with `/plan/legs` in the retire-legacy step below.

## Not done in Phase 2 (honest gaps)

1. **Retiring legacy.**
   - Code still in place: `/plan/legs` (`PlanScreen`, for multi-city travel with per-leg time zones and country essentials), `/around/map/classic`, `TodayScreen`, `GoScreen`, the dead `AroundScreen`, and the `NEXT_PUBLIC_MIRA_GO_ENTRY` rollback flags.
   - What's needed: multi-city legs and the options comparison have to be ported into Plan first, and then about 25 E2E tests rewritten.
   - Recommended as the first task of the next phase.
2. **Backend gaps found while building You.**
   - There is no endpoint to forget a single habit; only "Forget all" exists.
   - There is no data export.
   - Both are needed before You can offer them.
3. **States pass.** All new and redesigned screens use `StateNote` for empty, offline, failed and signed-out states. Legacy screens were not touched.
4. **Follower live page** (`/t/…`). Reviewed and left as is: it already follows the map-and-sheet layout with a warm alert. It does not yet use the sky card.

## Verification

- `tsc` and `eslint` are clean.
- Unit tests: 970 / 970 pass.
- E2E, slice by slice on the mobile project: Journeys, way back, You, Circle, Report, Contribute, Updates, the new map and the guest check-in. The full mobile + desktop suite runs before merge.
- Screenshots are in `docs/phase2-ux/screenshots/`.
