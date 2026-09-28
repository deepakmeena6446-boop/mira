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
