# Launch UX — Execution Log

Branch `feat/launch-ux` (from `docs/launch-ux` @ `1111b24`). Plan: `08_LAUNCH_UX_EXECUTION_PLAN.md`, with the owner corrections in §0a.

## Phase 0 — Freeze and baseline — **PASS**
- `npm run check`: lint clean, typecheck clean, **59 files / 764 tests passed**.
- `npm run test:e2e` (on the untouched source): **47 passed, 5 skipped, 0 failed** (6.9 min). This is the regression baseline. The docs' figure of "46 / 4" was from the earlier freeze; the actual counts are recorded here.
- E2E copy contracts: `docs/launch-ux/e2e-contracts.baseline.txt`.
- Before-screenshots: `docs/launch-ux/screenshots/` (the audit set, same build).

## Phase 1 — Design tokens and foundation — **PASS**
- Token values (04 §4–7) with names kept: warm paper `#f6f5f1` / night `#111312`, lagoon-teal accent `#1d6b63` / `#7cc4b9`, warm = attention, red = failures only. `--shadow-card` became a 1 px hairline, so every canvas card is bordered, not floating. Glass is lighter (90%, blur 12 px, prefixed property first).
- `bg-mira` became a solid accent alias, `bg-companion` became a flat canvas, `breathe` was removed, and `rise` has no overshoot (240 ms).
- Fonts: Instrument Sans (latin, latin-ext) with Noto Sans Devanagari lazy (`preload:false`), via `next/font`.
- Icons are data-driven (`components/ui/icon-paths.ts`), with about 30 new glyphs. Map pins render SVG glyphs, not emoji; hospital and police get a strong ring.
- `MiraPulse` replaced the gradient orb (`MiraOrb` is a shim).
- Button variants: `hero` is an alias of `primary`, `ink` was added, and a `data-variant` attribute is used for the one-primary checks.
- Mechanical migration across 32 files: extrabold → semibold, uppercase eyebrows → sentence case, arbitrary radii → tokens, violet shadows and scrims → tokens.
- Brand constants: theme-color per daypart, manifest, avatar palette, offline page, `icon.svg`, OG image. The PNG icons are regenerated in Phase 11.
- Validation: lint, typecheck and unit tests all green.
- Visual check (mobile day and night, desktop): no violet, gradient or orb glow; the night accent is legible.
- **Refinement (owner correction 3):** none needed yet.

## Phase 2 — Navigation, shell and naming — **PASS**
- Docked tab bar with the same five items and order, and an accent top-bar indicator.
- **Immersive journey:** `html[data-journey="open"]` hides the tab bar, and toasts drop from the top so they never cover "I'm here".
- `HelpCluster` (I feel unsafe + Emergency) is used on Home and Trip. On Trip, "I feel unsafe" moved from the sheet grid into the cluster (exactly one per page).
- The sheet's full detent is bounded by the measured `--chrome-top` (`useChromeTop`), and the sheet sits above the tab bar.
- **The audit's safety finding (anchors covered at full snap) is fixed.**
- Naming pass in React UI: "Mira"; "Go with Mira" for the journey CTA; "Continue" on Welcome. Server, domain and share strings are unchanged (08 Phase 2 scope).
  - **Caught and fixed:** `LightingSummary` compared against the server's source label "MIRA walkers". The data key was kept, and a display-only mapping added.
- Tests updated in the same commit (E2E specs and helper, two component unit tests, the theme-color assertion `#111312`).
- **KNOWN RISK (accepted, documented):** the naming pass shares a commit with Phase 1–2 styling because the same lines changed. To revert it alone, run a reverse `Mira`→`MIRA` replacement over the files in the 09 §2 map.
- Validation:
  - `tools/ux-checks.mjs` **102/105**. V-anchor passes at peek, half and full on S, M and D; N-2 (tab bar hidden, then back) passes; R-6 and V-rm pass.
  - The 3 failures were "2 primary buttons on Trip", which is Phase 4's scoped fix.
  - E2E **47 passed / 5 skipped / 0 failed** (baseline parity).

## Phase 3 — Home — **PASS** (after one fix loop)
- `src/domain/mira-line.ts`: deterministic `homeLine` / `routeLine` / `tripLine`. **14 unit tests**, and every template passes `companionOutputIssue()`.
- Home sheet: Mira line (adaptive, at most one action; primary only for "Go with Mira" / "Take me home"), then "Where are you going?", search, chips, the Circle line, then the secondary row Help near me · Report · Ask Mira (all three always present; Report first for contribution-heavy users).
- Other Home changes:
  - The JourneyCapsule replaces the gradient card.
  - Pins are capped at 8.
  - The spot card uses icons, and "Report here" goes to `/report?from=map`.
  - The greeting has no emoji.
  - Sign in is a secondary button.
- Route sheet:
  - The Mira-line summary replaces `RouteContextLines`.
  - The lighting block still comes before the button (UX-01), with "Why not known?" folded into "Sources and freshness".
  - Kind icon; **Go with Mira** is primary.
  - The lazy `/api/contribute` call (signed in, once, after 400 ms) feeds the ready check, newly-verified and Scout rows; the seen flags are device-local.
- **Fix loop:**
  1. The first E2E run showed 3 failures.
     - (a) Home had hidden the alert-channel truth ("Mira attempts to email Mum…") in a disclosure. With a Circle, the full sentence is now visible again (C-3.3). The short line is used only when there's no Circle.
     - (b) The long-press URL assertion was tightened to `/report?from=map$`; it still proves no coordinates are in the URL.
  2. Fold check: "Go with Mira" at `half` was at the edge on 390×844 and 82 px under on 360×740.
     - Fix: the lighting block is compressed when lighting is unknown, the header tightened, half set to 60dvh, and 64dvh on screens ≤ 760 px tall.
     - Now visible at 390; 360 is re-verified in Phase 10.
- **Refinement (owner correction 3):** `--sheet-half` changed from 56dvh to 60dvh (64dvh on short phones). The rendered screenshots showed the primary decision falling below the fold.
- Unit 636/636. `ux-checks` 105/105 (on the build with Phases 3–5). E2E **47 / 5 / 0**.

## Phase 4 — Journey experience — **PASS**
- `src/lib/trip-actions.ts` `journeyNextAction()` with **5 unit tests**: an unopened WhatsApp contact leads to "Send to {name}"; nobody following leads to "Send my live link"; otherwise "I'm here"; a missed check-in always leads to "I'm here". **Exactly one filled button**, verified by `ux-checks` V-one on Trip at S, M and D.
- The status box is now the Mira line: Pulse (with-you / attention) and the unchanged truth sentence. The E2E combined-sentence contract is kept. The ETA block follows, then the next action, then secondary actions (I'm here / Send my live link / +10 min).
- The header's `animate-ping` became the Pulse. Help Point rows use icons.
- Arrival: check icon, "You made it.", the lit question without emoji, Done. The report link goes to `from=journey`.
- Contact view: solid sheet, and the guidance line "If you're worried, call {name} first…". No 🎉.
- The Trips tab uses the JourneyCapsule, with the empty state per 04 §23.
- E2E `a`, `b`, `j`, `g` pass within the full run (47/5/0).

## Phase 5 — Community and reporting — **PASS**
- `src/lib/report-groups.ts` with **4 unit tests**. Report tiles come in two groups ("On the street" / "Something that happened"), ordered by entry point, and `from` is whitelisted.
- Glyph tiles with hints. The environment hint reads "Lighting, footpaths, blocked or flooded streets", covering streetlight and flooding observations with existing capabilities (owner correction 2). The thanks screen closes the loop honestly.
- Contribute:
  - The street report tiles come first, 2 taps to the form, anonymous OK.
  - "Something that happened" is one row into the full grid. **Deviation from 06 §3.12:** the inline grid shows the 3 street tiles plus that row, not all 6, which keeps Contribute focused on everyday observations. The incident tiles are one tap further.
  - The durable gate is said once.
  - Mira Checks and Correct a place follow.
  - The impact section shows **Mira Scout** (unchanged `stewardStatus` criteria) with a one-time recognition card.
- "Local Steward" remains in the UI only as "Mira Scout (formerly Local Steward)" on /privacy.
- Usage events are recorded after API success (report, check, correction, lit, journey).

## Phase 6 — Mira AI interaction — **PASS**
- Header: Pulse (thinking while sending), "Mira", and the subtitle "Ask about places, your journey, or what Mira knows here."
- Mira turns render as plain text with one Pulse per turn (no orb, no bubble). User bubbles are `sunken`. Failed messages use the warm alert (unchanged behaviour).
- Cards: bordered, icons instead of emoji, one primary button. The report card links with `from=mira`.
- Chips are ordered by usage mode (the contributor list starts with "Report a broken streetlight"); the NIGHT list still leads after dark.
- The page title is "Ask Mira · Mira" (was "Mira · Mira").
- E2E `c-mira` passes (in the full runs). With live Claude, the reply now proposes "To Home" directly.

## Phase 7 — Personalisation surfaces — **PASS** (two small items cut, see below)
- `src/lib/usage-signal.ts` with **9 unit tests**: cold/journey/contribute/mixed, hysteresis, the 21-day half-life, the 60-event / 60-day caps, same-day stability, blocked storage, reset.
- Record calls fire after API success: journey (Home, the unsafe share, the Mira card), report, check, correction, lit, mira. Home's secondary order and the Mira-line swap read the mode.
- Me:
  - Grouped (people and places, Contributing with Report moved out of Privacy, How Mira works for you, Account and device, Privacy). All anchors kept.
  - "Reset how Mira arranges Home" was added.
  - Sign out and Delete clear the device keys.
- `/privacy`: "What Mira keeps on this phone" (C-9.4).
- **Cut (documented cut order, 08 §3):**
  1. The arrival line "Mira will remember this walk home" (07 §A.3).
  2. Habit-ordered saved places in Search (07 §B.2).

  Both are SHOULD-level and would need extra data wiring (`rememberHabits` and habits on the trip and search screens). They're skipped cleanly: no partial UI.

## Phase 8 — Help and emergency states — **PASS**
- `tests/unit/components/unsafe-order.test.tsx` was written **before** the restyle and passes before and after. The frozen order is Help Point → tell / share → call → emergency → location in words → Mira → I'm okay now.
- Visual changes:
  - A calm lead line ("IndianOil is about 5 min away.").
  - A neutral bordered Help Point card with icons.
  - "I'm okay now" is now a full-width secondary button.
  - Help-near sheet icons.
- No change to actions, data, AI or wait time. The emergency `tel:` is unchanged.

## Phase 9 — Motion and polish — **PASS**
- Pulse states:
  - thinking: a turning arc after a 300 ms delay;
  - noticed: one ripple, on a key change only;
  - with-you: the only ambient loop (JourneyCapsule on Home);
  - attention: warm, static.
- Journey presence halo on the map: rAF at ≤ 30 fps, paused when hidden, static under reduced motion, and stopped while "I feel unsafe" is open.
- The camera is instant under reduced motion. Check-draw on arrival and report thanks. The `animate-ping` / `breathe` loops were removed. Android haptics for journey start, arrival and long-press.
- `ux-checks` V-rm: 0 running animations under reduced motion on Home and Trip at S, M and D.
- **Not done (optional per 04 §14):** the transform-based sheet with velocity snapping. The height-based sheet is kept (**KNOWN RISK**, accepted by the plan).
- **KNOWN RISK:** `setPaintProperty` at 30 fps on low-end Android. Mitigation: it pauses when hidden, and reduced motion keeps it static. A real-device check is on the owner list.

## Phase 10 — Responsive and accessibility — **PASS** (one minor KNOWN RISK)
- Desktop ≥ 1024: left rail (88 px), a 400 px side panel under the top chrome, and map padding for the panel. The Google logo is moved beside the panel (licence, C-13.5). There is no rail on an open journey.
- `ux-checks` **99/99** at S, M and D.
- `a11y-checks` **45/46**:
  - Contrast is ≥ 4.5:1 for all text tokens, day and night.
  - All targets are ≥ 44 px after fixes: pins went from 32 to 44 px hit area, the avatar from 42 to 44.
  - Skip link first and focus visible on 7 of 8 screens.
- **KNOWN RISK (minor):** on `/mira`, the auto-scroll to the newest message moves Chrome's focus starting point, so the first Tab lands on the chips beside the composer instead of the skip link. The skip link is still first in DOM order and reachable. On a chat screen this is arguably the useful target.
- 768 px tablet: no overflow. At 200% text zoom there's no horizontal overflow, after these fixes:
  - the help cluster was pushing "I feel unsafe" off-screen (it now wraps);
  - tab labels collided (they now truncate);
  - the locate button overlapped Emergency (it now sits below the chrome layer).

## Phase 11 — Visual QA — **PASS**
- Full screenshot matrix: mobile day and night (33 states each) and desktop (33), plus tablet and 200% zoom, in `docs/launch-ux/screenshots/after/`. The before set is `docs/launch-ux/screenshots/`.
- Emoji sweep: none left in system UI. **Documented exceptions:**
  1. Saved-place emoji (user data stored with the place; also the E2E contract "🏠 Home").
  2. "✓" in "Opened WhatsApp for {name} ✓" (an E2E contract).
- CP-1: no verdict words in UI. CP-2: no "MIRA" in React UI except the server data key `"MIRA walkers"` (matched, and displayed as "Mira walkers").
- Welcome and Circle restyled (06 §3.1, §3.15). PNG app icons redrawn from the new `icon.svg`.
- **Refinements (owner correction 3):** none beyond the detent heights noted in Phase 3. Colours, fonts and radii are as documented.

## Phase 12 — Regression and release readiness — **PASS**
- `npm run check`: lint and typecheck clean, **64 files / 797 tests**.
- `npm run test:e2e` (fresh build): **47 passed / 5 skipped / 0 failed**, the same as the baseline.
- `npm run audit:bundle`: no secrets.
- Bundle size versus `81db304` (built in place from a detached checkout): JS gz 716,989 → 733,575 (**+2.3%**), CSS +2.6%.
- Console: 0 app errors across 10 screens. The only errors are headless Google-tile fetches, the same as the baseline.
- Fonts: the Devanagari file is not requested on an English session.
- M-1: the Google basemap renders in the in-app browser (world map, night style).
- Final report: `FINAL_UX_EXECUTION_REPORT.md`. Verdict **READY_FOR_BETA_DEPLOYMENT**; the owner-only operations and the real-phone smoke test remain.
