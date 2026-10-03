# Mira — Phase 2 plan

Phase 1 rebuilt the five core experiences. Phase 2 brings every other surface into the same product, and closes the gaps Phase 1 left. Audit facts are from 3 Oct 2026 (four read-only audits of the `ux/phase2` branch base, `7dc7921`).

## Rule zero: one design language

Every Phase 2 screen is built only from Phase 1 parts. A new part is allowed only when Phase 1 has no equivalent. In that case it goes into `src/components/mira/` and the screen that needed it uses it from there.

| Need | Use |
|---|---|
| Screen frame | `m-screen bg-companion` + `m-screen-inner`, `RootHeader` (title + Support pair) |
| The one live/now surface | `SkyCard` |
| Lists of things (plans, journeys, places, people, updates) | `Row` / `RowList` (extracted from Home's "Mira noticed" rows) |
| Section titles | `m-label` above lists, `m-h` for content headings |
| Facts | `EvidenceRow` / `EvidenceLedger` / `EvidenceGlyph` |
| Empty, offline, failed, permission, signed-out | `StateNote` |
| Choices and forms | `Sheet` + `QuestionRow`; primary button `mira-primary`, one per screen |
| Sticky action | `ActionBar` |

Things that are not allowed on redesigned screens:
- `components/app/Section`
- `bg-surface` bordered boxes
- `ui/Notice`
- ad-hoc radii, colours or type sizes
- legacy `mira-*` classes, except `mira-primary` and `mira-wordmark`

Every screen is captured at 390×844 in day and night, and at 320 px, next to a Phase 1 screen before it is shown.

## Order of work

1. **Journeys + plan identity + the way back.**
   - `/trips` becomes three sections:
     - *Now*: the active journey as a sky card, or a private check-in.
     - *Upcoming*: this tab's plan and saved plans.
     - *Earlier today*: closed journeys, kept 24 h.
   - Plans get an `id` and a derived name and time ("To Hansraj College · Today, 11:11 PM"). Home, Mira and Journeys all say the same name.
   - A reopened saved plan updates its saved copy instead of duplicating it.
   - Plan gets **Add the way back** in place, instead of linking to the old step planner.
2. **You (profile).**
   - The current `/me` sections are regrouped as:
     - you and your account
     - Circle, including choosing who is pre-selected
     - places
     - what Mira remembers, with forget per habit
     - Help Point preferences
     - notifications
     - appearance
     - emergency numbers and helplines for the current country
     - privacy, sign out and delete
   - `/circle` and `/privacy` adopt the same frame.
   - Sign-in stays one sheet, and the 18+ attestation copy stays verbatim.
3. **Community.**
   - Report and Contribute become sheets opened where the thing was seen: Home, Around, Journey arrival and Mira.
   - The quick chips pass their real source instead of always `from=home`.
   - Mira Checks and the lighting vote use the `HelpNextCard` language.
   - "What you've added" (impact) lives in You.
4. **Notifications.**
   - A bell in Home's header (signed in) opens the inbox as a sheet, with an unread dot.
   - Each item deep-links to what it concerns.
5. **Map.**
   - Around's map expands to full screen, taking over the long-press actions "Report here" and "Go here" and the drop-pin search.
   - `cooperativeGestures` stops the map from capturing page scroll.
   - `/around/map` (the legacy HomeScreen) is retired with its rollback flags once the E2E specs move.
6. **States pass.** Every screen gets the same `StateNote` treatment for loading, empty, failed, offline, permission and signed out (the audit table is in the chat log of 3 Oct).
7. **Retire legacy.**
   - Retire `/plan/legs` and `PlanScreen` once Plan covers the remaining multi-leg travel: up to 3 legs, a time zone and country essentials per leg, and the full options comparison.
   - Also retire `GoScreen`, `TodayScreen`, `HomeScreen`, the dead `AroundScreen`, and the rollback flags.
   - About 25 E2E tests are rewritten against the new screens.
8. **Admin** keeps its own desktop frame, restyled to the same tokens.

## Out of scope (Phase 3+)

- Staging deploy
- Real-device QA
- Performance and accessibility audits
- Hindi copy
- Installable app with background location
- Push beyond the existing web-push toggle
