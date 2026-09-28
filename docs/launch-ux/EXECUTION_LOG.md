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
