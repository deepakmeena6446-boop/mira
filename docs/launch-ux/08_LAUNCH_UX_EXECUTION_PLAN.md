# 08 — Launch UX Execution Plan

**For:** an autonomous Claude Code session implementing the launch UX overnight.
**Read first, in order:** 02 → 06 → 04 → 05 → 07 → this document → 09. Also read `AGENTS.md`: Next.js 16 differs from your training data, so read `node_modules/next/dist/docs/` for any Next API you touch (fonts: `01-app/03-api-reference/02-components/font.md`).

## 0. Ground rules for the executor

1. **Presentation only.** Do not change:
   - DB schemas or migrations;
   - API routes or their request/response shapes;
   - the worker;
   - domain *rules* (`src/domain/*` logic);
   - provider adapters;
   - auth;
   - privacy behaviour.

   Allowed:
   - components;
   - screens;
   - CSS/tokens;
   - copy;
   - new **pure presentation modules** (`src/domain/mira-line.ts`, `src/lib/usage-signal.ts`);
   - device-local storage keys listed in 07 §B;
   - a UI-only query param (`/report?from=`);
   - test updates for changed copy.

   Server-generated strings (emails, notifications, companion persona and scripted replies, domain copy) are **not** part of this sprint (see Phase 2 naming scope).
2. **No new npm dependencies.** Fonts through `next/font/google` are build-time static assets, not package installs.
3. **No deploy, no push** unless the owner asks. Work on branch **`feat/launch-ux`**, created from `docs/launch-ux` (which is `release/beta-rc` @ `81db304` plus these docs).
4. **One commit per phase step**, with a message like `ux(phase-N): …` and the attribution trailer.
5. **Every phase ends with a verdict** recorded in `docs/launch-ux/EXECUTION_LOG.md` (the executor creates this file): `PASS` or `KNOWN RISK: <what, why acceptable, follow-up>`. **Do not start phase N+1 until phase N is PASS or an accepted KNOWN RISK.** A failing MUST from 02 can never be a KNOWN RISK. It blocks.
6. When a rule blocks necessary work, stop that item, write `REQUIRES_OWNER_APPROVAL` with the C-rule ID in the log, and continue with the rest.
7. **E2E copy contracts** (09 §2): if a visible string changes, update the spec in the **same commit** and record the old → new mapping in the log.
8. **Repo gotchas that apply:**
   - **MapLibre padding:** set `map.setPadding()` once and never pass padding per `easeTo`/`fitBounds` call.
   - **Sheets:** sheets inside a fixed screen can't rise above the tab bar; portal them to `document.body`.
   - **`useOverlay(true)` sheets:** a sheet mounted already open closes under React dev double-effects. Keep sheets mounted and toggle `open`.
   - **Lightning CSS:** it keeps only the *last* of `backdrop-filter`/`-webkit-backdrop-filter`. Put the prefixed property first.
   - **One `next dev` per directory.** For verification use `.claude/launch.json` → `mira-verify` (prod build on :3150 with the worker). Run `npm run build` after stopping it.
   - **Fresh checkouts** need `next typegen` before `tsc`. `npm run typecheck` does this.
   - **Turbopack HMR** can serve stale bundles. Do a full reload before debugging UI.


## 0a. Owner corrections (2026-09-28, binding; they override anything below that conflicts)

1. **Contribution is a stable anchor.** Adaptive Mira may change the *prominence and order* of contribution entry points. Report/Contribute must always remain reachable within **1–2 interactions** from every tab root (09 N-5), whatever the usage mode.
2. **Non-incident local contribution works with existing capabilities.** Streetlight and community observations use what exists today: "Was the way lit?" votes, MIRA Checks, Correct a place, and the Report flow ("Dark or broken street"). Make these clearly accessible for people who never take a journey. **No backend or schema change, and no waiting for the taxonomy extension (07 §D1).**
3. **Freeze the philosophy, not arbitrary pixels.** The emotional direction, hierarchy, interaction principles and design-system structure (02, 04, 05, 06) are authoritative. Exact colour, font, spacing and radius values MAY be refined when the actual rendered screenshots clearly improve the product and stay consistent with the documented direction. Record each refinement in `EXECUTION_LOG.md`.

## 1. Standard validation toolkit (referenced by every phase)

| ID | Command / procedure | Notes |
|---|---|---|
| V-lint | `npm run lint` | must be clean |
| V-type | `npm run typecheck` | must be clean |
| V-unit | `npm run test:unit` | pure; fast |
| V-int | `npm run test:integration` | needs `docker compose up -d` (PostGIS on :54329, DB `mira_test`) |
| V-e2e | `npm run test:e2e` | build + Playwright, **6–10 min**, DB `mira_e2e` plus Mailpit. Don't run heavy jobs alongside it. Baseline: 46 passed, 4 intentional skips |
| V-e2e-one | `npx playwright test tests/e2e/<spec> --project=mobile` | after `npm run build`; the webServer starts its own env |
| V-shots | `node docs/launch-ux/tools/capture-screens.mjs <outDir> day mobile,desktop` and `… night mobile` against `mira-verify` (:3150) | produces the 09 §11 screenshot set |
| V-a11y | Playwright `locator.ariaSnapshot()` on each screen root (09 §8), plus the manual keyboard pass | no new deps |
| V-rm | Emulate `prefers-reduced-motion: reduce` (Playwright `page.emulateMedia({ reducedMotion: "reduce" })`) and assert no running animations: `document.getAnimations().filter(a => a.playState === "running").length === 0` after 1 s, excluding ≤120 ms opacity fades | |
| V-anchor | Script: at each snap (peek/half/full), `boundingBox()` of `button "I feel unsafe"` and `link /Emergency/` or `button /Emergency options/` must not intersect the sheet section's box | Home, Trip |
| V-one-primary | Count visible elements with the primary-button class (`[data-variant="primary"]`, added in Phase 1) must equal 1 per state | |

---

## Phase 0 — Freeze and baseline
- **Objective:** a known-good starting point and before-screenshots.
- **Files:** none in app code. Add `docs/launch-ux/EXECUTION_LOG.md`.
- **Must not break:** anything.
- **Dependencies:** Docker running. `docker compose up -d`. `.env.local` present.
- **Sequence:**
  1. `git switch docs/launch-ux && git switch -c feat/launch-ux`.
  2. `npm run check` (lint, typecheck and unit+integration tests).
  3. `npm run test:e2e`. Record the counts.
  4. `npm run build`, then start `mira-verify`, then V-shots for day mobile+desktop and night mobile → `docs/launch-ux/screenshots/baseline/`. The committed audit set in `docs/launch-ux/screenshots/` can serve as the baseline if the capture is unchanged.
  5. Record the E2E contract strings: run `grep -ohE "get(ByRole|ByText|ByPlaceholder|ByLabel)\([^)]*\)" tests/e2e/*.ts | sort -u > docs/launch-ux/e2e-contracts.baseline.txt`.
- **Validation:** all green, or known pre-existing failures documented.
- **Visual validation:** the screenshot set exists.
- **Regression tests:** the full suite.
- **Exit:** baseline numbers logged. **PASS.**
- **Risks:** pre-existing flaky E2E (trip timing). Mitigation: re-run the failing spec once, and log it if still flaky.

## Phase 1 — Design tokens and foundation
- **Objective:** re-skin the whole app through tokens, font, icons, the Pulse mark and button variants, with no layout changes yet.
- **Files:**
  - `src/app/globals.css`: token values (04 §4–7), dayparts, `.glass`, `bg-companion` → flat, `bg-mira` → accent alias, `.skeleton` colours, motion tokens (05 §1), a new `--color-scrim` / `--color-light` / `--map-*`, radius tokens, and the removal of `animate-breathe` usage.
  - `src/app/layout.tsx`: `Instrument_Sans` (latin, latin-ext) plus `Noto_Sans_Devanagari` (`preload:false`) via `next/font/google`, and the variables.
  - `src/components/ui/Button.tsx`: variants (`hero` → alias of primary; `ink`; `data-variant` attribute), radius, no shadows.
  - `src/components/ui/Icon.tsx`: ≈30 new glyphs (04 §8).
  - `src/components/app/kinds.ts`: add `kindIcon()` and keep `kindEmoji()` for compatibility until Phase 3.
  - **New** `src/components/app/MiraPulse.tsx` (static states only; animation is added in Phase 9).
  - `src/components/app/MiraOrb.tsx`: re-export `MiraPulse` (a compatibility shim).
  - `src/components/app/Section.tsx`: sentence-case label.
  - `src/components/ui/Toast.tsx`: radius and colours.
  - `src/components/map/WorldMap.tsx`: read the `--map-*` variables for route, glow, lit and alt colours (the paint values only).
- **Must not break:**
  - the daypart pre-paint script;
  - `color-scheme`;
  - the focus ring;
  - contrast;
  - map colours at night;
  - `EmergencyPill` rendering;
  - every accessible name.
- **Dependencies:** Phase 0.
- **Sequence:**
  1. Tokens in `globals.css` (values only).
  2. Font swap.
  3. Button variants.
  4. MiraPulse plus the MiraOrb shim.
  5. Icons.
  6. Map colour variables.
  7. The Section label.
  8. Search for `bg-mira`, `rounded-[`, `font-extrabold`, `uppercase tracking-wider` and `shadow-[0_` and migrate them per 04 §30 (mechanical).
- **Validation:** V-lint, V-type, V-unit.
- **Visual validation:**
  - V-shots day and night mobile.
  - Check: no violet, no gradient, no orb glow.
  - Text contrast spot-check with devtools: ink-subtle on canvas ≥ 4.5.
  - Hindi text renders in Noto Sans Devanagari: type "मेरा घर" into Mira's composer and screenshot it.
- **Regression tests:** V-e2e (no copy changed yet, so all must pass).
- **Exit:**
  - All tests are green.
  - The screenshots show the new palette in all four dayparts. Force them via `document.documentElement.dataset.daypart`.
  - The 13 px Instrument Sans legibility check passes. **Otherwise:** revert to Plus Jakarta Sans (04 §2.1 fallback). That is a **KNOWN RISK** allowed.
- **Risks:**
  - Font metrics shift layouts, and truncations appear. Mitigation: check `truncate` rows in V-shots.
  - The map route colour on Google night tiles. Mitigation: night screenshot.

## Phase 2 — Navigation, shell and naming
- **Objective:**
  - A docked tab bar.
  - An immersive journey (tab bar hidden).
  - Safe paddings.
  - Help anchors that are never covered.
  - Product naming ("Mira", "Go with Mira").
- **Files:**
  - `src/components/app/TabBar.tsx`: docked, active indicator, and hidden when on `/trip` with an open journey. Detect it via `usePathname()==="/trip"` plus a lightweight context or a `data-journey-open` attribute set by `TripScreen` on `<html>`.
  - `src/app/(app)/layout.tsx`: the `--tabbar-h` variable.
  - `src/components/app/BottomSheet.tsx`: detent heights (04 §14), `full = calc(100dvh - var(--chrome-top))`, and the `onSnap` callback reporting the height so the screen can call `map.setPadding` once.
  - **New** `src/components/app/HelpCluster.tsx`.
  - `src/app/(app)/HomeScreen.tsx` and `trip/TripScreen.tsx`: set `--chrome-top` from a measured chrome ref (`ResizeObserver`), and use `HelpCluster`. **On Trip, "I feel unsafe" moves from the sheet grid into the cluster. Exactly one per page.**
  - `src/components/ui/Toast.tsx`: bottom offset uses `--tabbar-h`. On `/trip` it sits above the sheet.
  - **Naming pass (React-rendered UI only):**
    - User-visible "MIRA" becomes "Mira" in JSX text and `aria-label`s under `src/app/**` (pages, screens, components), in `src/components/**`, in `src/app/manifest.ts` (`name`, `short_name`), and in page `metadata` titles/descriptions.
    - "Start with MIRA" becomes **"Go with Mira"** (the journey CTA). The Welcome CTA becomes **"Continue"**.
    - **Excluded (unchanged at launch):** server-generated text, meaning:
      - `src/server/mail/*` email templates and sender names;
      - in-app notification titles written by API routes (for example "Welcome to MIRA, {name}");
      - the Mira persona and scripted engine (`src/server/providers/companion/*`);
      - `src/domain/*` copy (for example the habits text "Start the journey with MIRA");
      - share-message text (`src/domain/phone.ts`, `src/lib/share.ts`);
      - the safety-updates wording.

      Changing these alters AI prompts, email templates and unit-tested domain copy. They are listed as post-launch item D14 in the report. **KNOWN RISK (accepted):** Mira's replies and emails may still say "MIRA".
  - **Tests:** update every affected E2E spec string and component unit test (09 §2 mapping table). Server and domain tests are untouched.
- **Must not break:**
  - Tab link names Home/Mira/Trips/Contribute/Me.
  - Emergency `tel:`.
  - `useOverlay` history behaviour.
  - Sheet keyboard operability.
  - The `MAP_PADDING` framing. Replace the per-call padding with a single `setPadding`, and **verify fits on a 390 px phone** (repo gotcha).
- **Dependencies:** Phase 1.
- **Sequence:**
  1. TabBar docked plus `--tabbar-h`.
  2. Journey-open hide.
  3. HelpCluster on Home and Trip.
  4. `--chrome-top` plus the full detent.
  5. Map padding via `setPadding`.
  6. Toast offset.
  7. **Naming pass as a separate commit** (`ux(phase-2): naming — Mira, Go with Mira`) with the test updates, so it can be reverted on its own.
- **Validation:** V-lint, V-type, V-unit, V-anchor (Home and Trip at 3 snaps × 390×844 and 360×740), V-one-primary.
- **Visual validation:** V-shots. Check that the full-snap screenshots show the cluster uncovered, and that the trip has no tab bar.
- **Regression tests:** V-e2e (the naming changes are applied to the specs in the same commit).
- **Exit:** V-anchor passes at all snaps. E2E green. **PASS.**
- **Risks:**
  - Hiding the tab bar may strand users. Mitigation: the Trip back button exists, and 09 J-7 tests it.
  - `setPadding` regressions in fits. Mitigation: 09 M-3.
  - The naming pass misses strings. Mitigation: `grep -rn "MIRA" src | grep -v "^src/.*\.test\." | grep -vi "mira_\|MIRA_\|process.env"` and review what remains.

## Phase 3 — Home
- **Objective:** Home becomes "context + intent + intelligent action" (06 §3.2 to §3.4).
- **Files:**
  - **New** `src/domain/mira-line.ts` (pure) plus `tests/unit/mira-line.test.ts`. The tests cover the rule table, the swap rule, night precedence, the route templates, and **every template through `companion-output` guard**.
  - **New** `src/components/app/MiraLine.tsx`, `src/components/app/JourneyCapsule.tsx`.
  - `src/app/(app)/HomeScreen.tsx`:
    - the sheet order per 06 §3.2;
    - the Circle line shortened plus `<details>`;
    - the secondary row (3 buttons);
    - map pins capped at 8;
    - the route sheet per 06 §3.4 (merge `RouteContextLines` into the Mira line, keep the lighting block before the button, Save chips below Help Points);
    - a lazy `GET /api/contribute` when signed in (for `readyCheck`, `impact`, `steward`), once per mount, after first paint.
  - `src/components/app/RouteOptions.tsx` (compact rows), `HelpPointList.tsx` (icons), `LightingSummary.tsx` (the "Why not known?" moves into the disclosure).
  - `src/components/app/SearchOverlay.tsx` (restyle, icons, flat background).
  - `src/components/app/Chip.tsx` (style).
  - The long-press spot card restyle (06 §3.20). "Report here" navigates to `/report?from=map`.
- **Must not break:**
  - Every Home contract (06 §3.2 "Must remain").
  - Habit suggestion logic (`/api/me/habits/suggestion`).
  - Help prefetch.
  - Long-press ghost-tap guard.
  - Pin drop.
  - The UX-01 lighting-before-Start rule.
  - The UX-02 failed ≠ empty rule.
- **Dependencies:** Phase 2. `usageMode` defaults to `"cold"` until Phase 7.
- **Sequence:**
  1. `mira-line.ts` plus tests (TDD).
  2. MiraLine component.
  3. Home default sheet.
  4. JourneyCapsule.
  5. Route sheet.
  6. Search overlay.
  7. The spot card.
- **Validation:** V-unit (mira-line), V-type, V-lint, V-one-primary (Home default, habit, route sheet), V-anchor.
- **Visual validation:** V-shots of states 03, 04, 08–16 and 21. Compare against 06 acceptance items 1–8.
- **Regression tests:** V-e2e-one `a-share-trip`, `f-mobile-extras`, `h-375-evidence`, `g-unsafe-and-contribution`, `i-safety-updates`, then the full V-e2e.
- **Exit:** 06 §3.2 and §3.4 acceptance met. **PASS.**
- **Risks:**
  - The extra `/api/contribute` call on Home prepares checks (a bounded server pass). Mitigation: signed in only, once per mount, and failure ignored silently (no UI change). **KNOWN RISK** acceptable. The rate limit is 30/min.
  - Fold budgets at `peek` on small phones. Mitigation: 09 R-2.

## Phase 4 — Journey experience
- **Objective:** an immersive, calm, single-next-action journey, plus an honest arrival, plus a better contact view (06 §3.5, §3.6, §3.17).
- **Files:**
  - `src/app/(app)/trip/TripScreen.tsx`: layout, the next-action rule, the "About this journey" `<details>`, and the Mira line status.
  - `src/components/app/AfterArrival.tsx`, `CheckCard.tsx`: style only.
  - `src/app/t/[token]/SharedTripView.tsx`: style plus the guidance line.
  - `src/app/(app)/trips/page.tsx`: JourneyCapsule and the empty state.
  - `src/app/(app)/trips/TripsSignedOut.tsx`.
- **Must not break:**
  - Location upload throttling.
  - Wake lock.
  - Every banner string.
  - The WhatsApp "Opened … ✓" behaviour.
  - +10 min once.
  - The End confirm.
  - The contact view's data, freshness and expiry.
  - `AfterArrival` (one question, preparing, none).
- **Dependencies:** Phase 3 (JourneyCapsule, MiraLine).
- **Sequence:**
  1. The next-action rule, as a pure helper `journeyNextAction()` in `src/lib/trip-actions.ts` with unit tests for the 3 branches plus missed.
  2. Trip layout.
  3. Arrived state.
  4. Trips tab.
  5. Contact view.
- **Validation:** V-unit (next-action), V-one-primary for 3 fixtures (WhatsApp unopened / nobody following / following), V-anchor on Trip.
- **Visual validation:** V-shots 17–23. Night journey screenshot: halo static until Phase 9.
- **Regression tests:** V-e2e-one `a-share-trip`, `b-missed-alert`, `j-whatsapp-circle`, then the full suite.
- **Exit:** 06 §3.5 acceptance 1–5. **PASS.**
- **Risks:**
  - Moving "I feel unsafe" to the top cluster changes muscle memory. Mitigation: it now matches Home (a stable anchor), so this is an accepted improvement.
  - Contact-view copy gets translated by users' browsers. Acceptable.

## Phase 5 — Community and reporting
- **Objective:** Mira for Everyone. Report in 2 taps, one gate line, Mira Scout, loop-closure copy (06 §3.12, §3.13; 07 §C).
- **Files:**
  - `src/app/(app)/contribute/ContributeScreen.tsx`: layout, inline report grid (links to `/report?c=…&from=contribute`), the gate line, signed-out layout, the Mira Scout block, the recognition card (`mira.seen.scout`).
  - `src/app/(app)/report/ReportScreen.tsx`: groups and ordering by `from` (a pure helper `reportGroupOrder(from, preset)` with a unit test), icons, the thanks screen copy, Done → `router.back()` with a Home fallback, and the tile hint for environment.
  - `src/app/(app)/report/page.tsx`: read `from` (whitelist values) and pass it through.
  - `src/app/(app)/me/ImpactRow.tsx`: the "Mira Scout" tag.
  - `src/app/(app)/privacy/page.tsx`: "Local Steward" becomes "Mira Scout (formerly Local Steward)" once, then "Mira Scout".
  - Entry points that pass `from`:
    - arrival link (`from=journey`);
    - UnsafeSheet report link, if any (`from=unsafe`);
    - Mira report card (`from=mira`);
    - Home secondary row (`from=home`);
    - Me row (`from=me`);
    - spot card (`from=map`, done in Phase 3).
- **Must not break:**
  - Report API payloads.
  - PII warning.
  - Idempotency.
  - The pending-spot handover in memory (never in the URL).
  - Durable gating.
  - Impact wording rules.
  - E2E `d-reports` (moderation flow) and `g`.
- **Dependencies:** Phase 3.
- **Sequence:**
  1. `reportGroupOrder` plus its test.
  2. Report screen.
  3. The `from` plumbing.
  4. Contribute layout.
  5. Mira Scout rename (UI strings only; domain names unchanged).
  6. Recognition card.
- **Validation:** V-unit, V-type, and a manual: from the Contribute tab, 2 taps plus Send.
- **Visual validation:** V-shots 26–29 plus the signed-out Contribute state (new capture state).
- **Regression tests:** V-e2e-one `d-reports`, `g-unsafe-and-contribution`, then the full suite.
- **Exit:** 06 §3.12 acceptance 1–4, 06 §3.13. `grep -rn "Local Steward" src/app src/components` returns only the privacy page's "formerly" mention. **PASS.**
- **Risks:** `from` param misuse. Mitigation: whitelist it, and ignore unknown values.

## Phase 6 — Mira AI interaction
- **Objective:** Mira chat restyled. Presence via the Pulse. Cards as actions (06 §3.10).
- **Files:**
  - `src/app/(app)/mira/MiraChat.tsx`: header, message layout (one Pulse per Mira turn), card buttons `primary`, and chips from the usage mode (Phase 7 provides it; default until then). The report card links with `from=mira`.
  - `src/components/app/SignInSheet.tsx`: the Pulse replaces the orb.
- **Must not break:**
  - The NDJSON stream parsing.
  - Announce-once.
  - The failure path returning text to the box.
  - The sign-in wall.
  - Card behaviours.
  - E2E `c-mira` strings.
- **Dependencies:** Phase 1.
- **Sequence:**
  1. Header and log.
  2. Cards.
  3. Composer and chips.
- **Validation:** V-type, V-lint. Manual: send "What's open nearby?" with live Claude **or** the placeholder engine (tests force the placeholder).
- **Visual validation:** V-shots 24, 25.
- **Regression tests:** V-e2e-one `c-mira`.
- **Exit:** 06 §3.10 acceptance. **PASS.**
- **Risks:** low.

## Phase 7 — Personalisation surfaces
- **Objective:** the device-local usage signal, mode, adaptive ordering, reset and disclosure (07 §B).
- **Files:**
  - **New** `src/lib/usage-signal.ts`:
    - `recordUsage(kind)`;
    - `usageMode(now)` (implements 07 §B.2: half-life, thresholds, hysteresis, day-stability);
    - `resetUsage()`;
    - all storage access wrapped in try/catch.
  - **New** `tests/unit/usage-signal.test.ts`, covering:
    - cold start;
    - each mode;
    - hysteresis;
    - same-day stability;
    - decay;
    - the 60-event/60-day caps;
    - storage-unavailable behaviour.
  - Call sites that record usage:
    - `HomeScreen` `startTrip` / unsafe share (`journey`);
    - `MiraChat` `startTrip` (`journey`) and send (`mira`);
    - `ReportScreen` success (`report`);
    - `CheckCard` answer (`check`);
    - `ContributeScreen` correction (`correction`);
    - `AfterArrival` lit answer (`lit`).
  - `HomeScreen`: feed `usageMode` into `miraLine` and the secondary-row order.
  - `SearchOverlay`: saved-place ordering by habit for the hour (07 §B.2).
  - `MiraChat`: chip ordering.
  - `src/app/(app)/me/PersonalSections.tsx`: "On this phone" line plus **Reset how Mira arranges Home**.
  - `src/app/(app)/me/MeScreen.tsx`: the grouped layout (06 §3.14), the Report row moved, and clearing the local keys on sign out and delete.
  - `src/app/(app)/privacy/page.tsx`: the "What Mira keeps on this phone" subsection.
  - `AfterArrival`: the "Mira will remember" line (≤3 times).
- **Must not break:**
  - Server-side habits.
  - The `/api/me/prefs` switch.
  - Forget all.
  - The privacy allowlist tests (no new server data).
  - Sign-out and delete flows.
- **Dependencies:** Phases 3, 5 and 6.
- **Sequence:**
  1. The lib plus tests.
  2. Record calls.
  3. Consumers.
  4. Me grouping.
  5. Reset and disclosure.
- **Validation:** V-unit.
- **Manual test:**
  1. Seed localStorage with contribution-heavy events and reload the next "day" by faking the clock in the test.
  2. The Home secondary order becomes Report-first. The Mira line prefers a check.
  3. Reset returns it to the default.
- **Visual validation:** V-shots of Home in a contributor-heavy fixture and a journey-heavy fixture (09 §11 P-states).
- **Regression tests:** the full V-e2e (Me changes affect `a`, `e`, `j`).
- **Exit:** 07 §B acceptance (09 §6). **PASS.**
- **Risks:**
  - Arrangement jitter. Mitigation: day-stability test.
  - localStorage blocked. Mitigation: default `cold`, and a test for it.

## Phase 8 — Help and emergency states
- **Objective:** restyle the Unsafe, Emergency options and Help-near sheets and the trip banners, without changing any content order (06 §3.7 to §3.9).
- **Files:** `src/components/app/UnsafeSheet.tsx`, `EmergencyPill.tsx`, `HelpNearSheet.tsx`, `HelpPointList.tsx`, `TripScreen.tsx` banners, `Notice.tsx`.
- **Must not break:**
  - The action order (snapshot test).
  - No-AI/no-wait.
  - `tel:` links.
  - Helpline rows.
  - Location-in-words copy.
  - Every contract string.
- **Dependencies:** Phase 2.
- **Sequence:**
  1. Add an order snapshot test **first**: `tests/unit/unsafe-order.test.tsx` renders UnsafeSheet with fixtures and asserts the button-name order.
  2. Restyle.
  3. Add the calm lead line.
  4. Make "I'm okay now" a full-width secondary button.
- **Validation:** V-unit (snapshot), V-anchor, V-rm.
- **Visual validation:** V-shots 05, 07, 19. The emergency-options fallback: set the country to one without an all-service number. The E2E fixture already covers this.
- **Regression tests:** V-e2e-one `g-unsafe-and-contribution`, `e-privacy`, `a-share-trip`.
- **Exit:** the order snapshot is unchanged, and the sheet opens in < 100 ms with prefetched data (measure with `performance.now()` around open to first paint in a Playwright trace). **PASS.**
- **Risks:** none beyond regression. The content is frozen.

## Phase 9 — Motion and polish
- **Objective:** implement 05. Remove decorative motion.
- **Files:**
  - `globals.css` keyframes (`mira-arc`, `mira-ripple`, `mira-breath`, `mira-check`) plus `@starting-style` entrances.
  - `MiraPulse.tsx` states.
  - `WorldMap.tsx`: the presence halo rAF loop (journey only, visibility-paused, reduced-motion static).
  - `BottomSheet.tsx`: `--dur-sheet`/`--ease-sheet`.
  - Screens: remove `animate-rise` from static content, and remove `animate-ping`.
  - Haptics: `src/lib/haptics.ts` (feature-detected `navigator.vibrate`).
  - **Optional:** the `transform`-based BottomSheet with velocity snapping (04 §14).
- **Must not break:**
  - Reduced motion.
  - Map performance.
  - Battery (the rAF loop stops when hidden).
  - Sheet keyboard operation.
- **Dependencies:** Phases 3 to 8.
- **Sequence:**
  1. Tokens applied.
  2. Pulse states.
  3. The halo.
  4. Removals.
  5. Check draw.
  6. Haptics.
  7. (Optional) sheet refactor, **in its own commit**.
- **Validation:** V-rm and 05 §7 checks 1–5.
- **Visual validation:** record a short Playwright video of the journey start and arrival (`recordVideo`) for review.
- **Regression tests:** the full V-e2e.
- **Exit:** 05 §7 all pass. **PASS.** If the optional sheet refactor fails any test, revert that commit. That is a **KNOWN RISK** allowed (the height-based sheet stays).
- **Risks:** the rAF loop and MapLibre repaint cost on low-end Android. Mitigation: cap it at 30 fps. If frame drops appear, fall back to a static halo (KNOWN RISK allowed).

## Phase 10 — Responsive and accessibility
- **Objective:** small phones, tablets and desktop (the side panel), plus the full a11y pass.
- **Files:**
  - `BottomSheet.tsx`: an `lg:` panel mode (no drag, full height, 400 px).
  - `TabBar.tsx`: an `lg:` left rail.
  - Home and Trip: map padding (`left: panelWidth`) via `setPadding`.
  - Modal sheets: `sm+` centred dialogs.
  - `ContributeScreen`: `lg` two columns.
  - `MiraChat`: a 640 px column.
- **Must not break:** mobile layouts, and the anchors (V-anchor at lg too).
- **Dependencies:** Phase 9.
- **Sequence:**
  1. Panel mode.
  2. Rail.
  3. Padding.
  4. Dialogs.
  5. A11y fixes found by the 09 §8 pass.
- **Validation:**
  - V-anchor at 1366×900.
  - V-a11y.
  - Keyboard-only pass: every screen reachable, focus visible, sheets operable.
  - 200% zoom at 390 px width.
- **Visual validation:** V-shots at 360×740, 390×844, 768×1024 and 1366×900.
- **Regression tests:** the full V-e2e (the desktop project included).
- **Exit:** 09 §3 (responsive) and §8 (a11y) all pass. The desktop side panel is **SHOULD**: if it's cut, it's a **KNOWN RISK**, and the centred column must still pass V-anchor and the toast position.
- **Risks:** desktop panel complexity. Mitigation: timebox it to 2 hours, then fall back.

## Phase 11 — Visual QA
- **Objective:** screenshot-based acceptance (09 §11) and copy consistency (09 §9).
- **Files:** fixes only.
- **Sequence:**
  1. V-shots full matrix (day and night × mobile, desktop and small).
  2. Walk the 09 §11 checklist per image.
  3. Fix.
  4. Re-shoot.
  5. Copy grep checks (09 §9).
- **Validation:**
  - No emoji in system UI: `grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/app src/components`. Allowed hits: user-data rendering and the Mira reply mirror. Document each allowed hit.
  - No verdict words (09 §9).
- **Exit:** every 09 §11 case is marked pass in the log, with its screenshot path. **PASS.**

## Phase 12 — Regression and release readiness
- **Objective:** prove nothing broke.
- **Sequence:**
  1. `npm run check`.
  2. `npm run test:e2e`, with counts ≥ baseline (46 passed, 4 intentional skips), or each difference explained (for example a new test added).
  3. `npm run audit:bundle`: no secrets. Also compare the JS size against the baseline (`.next` build output) and flag any growth over 10%.
  4. Lighthouse-style manual check in the in-app browser on `mira-verify`: no console errors on any screen (`read_console_messages`).
  5. Write the final `EXECUTION_LOG.md` summary: phases, verdicts, known risks, the owner items (real-phone smoke per `PRODUCTION_SMOKE_TEST.md`).
- **Exit:** everything green, or KNOWN RISKs accepted in the log. **PASS.** Do not deploy.

---

## 2. Phase dependency graph
```
0 → 1 → 2 → 3 → 4 ─┐
          │   └→ 5 ─┤
          └→ 6 ─────┤
              3,5,6 → 7
          2 → 8 ────┤
                3–8 → 9 → 10 → 11 → 12
```

## 3. Time budget (overnight, indicative)
| Phase | Budget |
|---|---|
| 0 | 0.5 h |
| 1 | 1.5 h |
| 2 | 1.5 h |
| 3 | 2.5 h |
| 4 | 1.5 h |
| 5 | 1.5 h |
| 6 | 0.75 h |
| 7 | 1.5 h |
| 8 | 0.75 h |
| 9 | 1.5 h |
| 10 | 1.5 h |
| 11 | 1 h |
| 12 | 1 h |
| **Total** | **≈ 17 h** |

This is more than one night. **If time runs short, the cut order (last cut first) is:**
1. the Phase 10 desktop panel;
2. the Phase 9 optional sheet refactor;
3. Phase 7 search ordering and chip ordering;
4. the Phase 4 contact-view restyle.

**Never cut:**
- Phases 0–3;
- Phase 4's next-action rule and hidden tab bar;
- Phase 5's report and Contribute hierarchy;
- Phase 8's order test;
- Phase 12.

## 4. What is explicitly out of scope for execution
- Everything in 07 §D.
- Any change to `PRINCIPLES.md` or legal texts beyond the naming and "Mira Scout" terms.
- Tab-set changes (for example folding Trips).
- New report categories.
- Server, API, schema or worker changes.
- Dependencies.
- Deploys.
