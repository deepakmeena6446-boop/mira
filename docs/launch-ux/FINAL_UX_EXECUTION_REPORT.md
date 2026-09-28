# Final UX Execution Report

**Branch:** `feat/launch-ux`, from `docs/launch-ux` @ `1111b24` (frozen beta `81db304` plus the planning docs).
**Commits:**
- `e532c43` ux(phase-6..11)
- `ec7a2ab` ux(phase-3,4,5)
- the Phase 1–2 commit
- docs and log commits

**Not pushed. Not deployed.** The per-phase evidence is in `docs/launch-ux/EXECUTION_LOG.md`.

## Phases completed

| Phase | Status |
|---|---|
| 0 Freeze and baseline | **PASS** |
| 1 Design tokens and foundation | **PASS** |
| 2 Navigation, shell and naming | **PASS** (KNOWN RISK: naming shares a commit with styling) |
| 3 Home | **PASS** (after one fix loop) |
| 4 Journey experience | **PASS** |
| 5 Community and reporting | **PASS** |
| 6 Mira AI interaction | **PASS** |
| 7 Personalisation surfaces | **PASS** (2 SHOULD items cut per the documented cut order) |
| 8 Help and emergency states | **PASS** |
| 9 Motion and polish | **PASS** (KNOWN RISK: halo repaint cost on low-end Android; the optional transform-based sheet was not done) |
| 10 Responsive and accessibility | **PASS** (KNOWN RISK, minor: first Tab on `/mira` lands on the chips) |
| 11 Visual QA | **PASS** |
| 12 Regression | **PASS** |

## Major UI/UX changes

### Visual language
- The violet, gradient, glass and orb look is gone. In its place:
  - a warm paper canvas, with a warm near-black at night;
  - one lagoon-teal accent;
  - warm reserved for "needs you", and red only for failures;
  - Instrument Sans, with Noto Sans Devanagari loaded lazily;
  - a 5-token radius scale;
  - hairline borders instead of floating shadows;
  - line icons instead of about 49 emoji.
- The time-of-day theming is kept.

### Mira presence
- The **Mira Pulse** mark replaces the orb. It carries state:
  - thinking: a turning arc;
  - noticed: one ripple;
  - with-you: the only ambient breath;
  - attention: warm.
- On an open journey, **the presence halo around your own dot** is Mira's signature.

### The Mira line
- One deterministic, evidence-only sentence on Home, the route sheet and the journey. For example: "16 min walk, arrive around 12:07 am. Lighting on this way isn't mapped. 3 Help Points on the way, the first 7 min in."
- No LLM is involved. Every template is checked by the companion output guard.

### Home
- The sheet order is: context and suggestion, then intent (search and chips), then who follows, then Help near me · Report · Ask Mira, then the evidence below.
- The adaptive slot carries at most one item: a habit with "Go with Mira", a ready check, a newly confirmed answer, the Mira Scout moment, or saving Home.
- **The help anchors are never covered** at any detent (the audit's safety finding is fixed).

### Journey
- Immersive: no tab bar.
- **Exactly one filled next action**: "Send to {name}" / "Send my live link" / "I'm here".
- The status sentence is the Mira line.
- Calm arrival.
- The contact view gains the guidance line "If you're worried, call {name} first…".

### Mira for Everyone
- On Contribute, street observations come first: **2 taps to a report, anonymous OK**. This covers streetlights, blocked and flooded streets, transport and positives, using the existing flows (owner correction 2).
- The sign-in gate is said once.
- Report tiles are grouped by entry point.
- The report thanks screen closes the loop honestly.
- **Mira Scout** is the UI name for the existing Local Steward. The criteria are unchanged, it's private, and there's a one-time recognition.

### Adaptive Mira
- A device-local, day-stable usage mode (journey / contribute / mixed / cold) reorders only the adaptive surfaces.
- Stable anchors never move.
- The Me screen offers "Reset how Mira arranges Home".
- The device-local data is disclosed on /privacy.

### Other screens
- **Me:** grouped into 6 sections. Report moved from Privacy into Contributing.
- **Welcome:** adds a "For everyone" contribution line and says "Continue".
- **Mira chat:** plain replies and usage-ordered chips.
- **I feel unsafe:** a calm lead line, with the frozen order enforced by a test.
- **Desktop ≥ 1024:** left rail and a 400 px side panel.

### Naming
- React UI says **Mira**, and the journey CTA is **Go with Mira**. Server, domain and email strings are unchanged by design.

## Screenshots / visual QA summary
- **Before:** `docs/launch-ux/screenshots/` (100 images).
- **After:** `docs/launch-ux/screenshots/after/` (108 images: mobile day and night, desktop, tablet, 200% text zoom).
- Reproduce with `docs/launch-ux/tools/capture-screens.mjs`.
- Headless Chromium draws the overlays but not the Google raster basemap. The in-app browser renders the map correctly (M-1 verified).
- Every 06 screen was inspected on mobile first, then desktop. Issues found this way and fixed:
  - the fold position of Go with Mira at 360 px;
  - a detached icon in the arrival report link;
  - an emoji in the trip Help Point row;
  - the Google logo covered by the desktop panel;
  - "I feel unsafe" pushed off-screen at 200% text;
  - the locate button overlapping Emergency;
  - the "Mira · Mira" page title.

## Tests run and results

| Suite | Result |
|---|---|
| `npm run check`: lint, typecheck, unit + integration | **PASS: 64 files, 797 tests** (baseline 764; 33 new) |
| `npm run test:e2e` (fresh build, mobile + desktop) | **47 passed, 5 skipped, 0 failed**, identical to the baseline |
| `tools/ux-checks.mjs` | **99/99**: help anchors never covered (S/M/D, every detent); one primary button per state; no horizontal scroll; tab bar hidden, then returning, on the journey; no running animation under reduced motion |
| `tools/a11y-checks.mjs` | **45/46**: contrast ≥ 4.5:1 for all text tokens day and night; all targets ≥ 44 px; skip link and visible focus. The 1 exception is noted below |
| Tablet 768 and 200% text zoom | no horizontal overflow; anchors visible |
| `npm run audit:bundle` | **PASS**: no secrets |
| Bundle size vs `81db304` | JS **+2.3%** gz (717 KB → 734 KB, all client chunks), CSS +2.6%, within the 10% budget |
| Console errors (10 screens) | **0 app errors**. The only errors are headless Google-tile fetches (an environment effect, present in the baseline too) |
| Fonts | only the Latin files load on an English session; the Devanagari font stays lazy |
| New unit tests | `mira-line` (14), `usage-signal` (9), `trip-actions` (5), `report-groups` (4), `unsafe-order` (1) |

## Functionality preserved
- Every flow and every E2E contract survives (47/47 pass). Copy renames were applied only through the 09 §2 map, with the tests updated in the same commit.
- **Truthfulness:**
  - "Opened WhatsApp", never "sent";
  - alert-channel sentences stay visible where they were tested;
  - unknown ≠ empty ≠ failed ≠ unavailable stays distinct;
  - all trip banners are unchanged.
- **Privacy:**
  - no new server data, API, schema or worker change;
  - the only additions are device-local, date-only usage events, disclosed and resettable;
  - `/report?from=` is a whitelisted UI hint with no coordinates (the long-press test still asserts that).
- **Safety:**
  - Emergency is still one tap to `tel:` with the cited number;
  - "I feel unsafe" keeps its frozen order, stays instant, and uses no AI;
  - the help anchors are now guaranteed visible.
- **One naming seam found and fixed:** `LightingSummary` matched the server label "MIRA walkers". The key is kept, and it's shown as "Mira walkers".

## Anything skipped
1. Phase 7: the arrival line "Mira will remember this walk home" and habit-ordered saved places in Search. Both are SHOULD items in the cut order and need extra data wiring. Nothing was partially built.
2. Phase 9: the optional `transform`-based sheet with velocity snapping. The height-based sheet is kept.
3. **Deviation:** Contribute shows the 3 street tiles plus a "Something that happened" row, not all 6 tiles inline. This keeps the focus on everyday observations; the incident tiles are one tap further.
4. The PNG app icons were redrawn from the new `icon.svg`. They still need an on-device check of how the OS masks them.

## `REQUIRES_OWNER_APPROVAL` items
None were needed for this work. The deferred items from 07 §D still stand, none of them started:
- report taxonomy extension (flooding, road hazard);
- "Still there?" prompts outside journeys;
- per-report status for reporters;
- area-named Mira Scout ("· Saket");
- corroborated reports counting toward Scout;
- "heightened watch";
- discreet mode;
- folding Trips into Home.

Decisions the owner may still veto (each can be reverted on its own):
- "Mira" naming and "Go with Mira";
- "I feel unsafe" moved into the journey's top cluster;
- the hidden tab bar during a journey;
- the Instrument Sans font;
- the 60dvh / 64dvh half detent.

## Remaining launch blockers
These are all owner-only and pre-existing. The UX work adds none.
1. Hosting (Railway paid plan) and a domain.
2. The Google sign-in OAuth client. Resend is optional.
3. A **real-phone smoke test** per `PRODUCTION_SMOKE_TEST.md`. For this redesign, also check on an Android and an iPhone:
   - presence-halo smoothness and battery;
   - haptics (Android);
   - the masked app icon;
   - VoiceOver/TalkBack announcements (09 Y-6).
4. **Server-side strings still say "MIRA"** (emails, notifications, Mira's persona and scripted replies, domain copy), by design. Accepted as launch-safe; a follow-up pass is item D14.

## Final verdict

**`READY_FOR_BETA_DEPLOYMENT`**

The launch UX is implemented, validated phase by phase, and regression-clean:
- 797 unit + integration tests;
- E2E 47 / 5 / 0 (identical to the baseline);
- invariant checks 99/99;
- accessibility checks 45/46, with one documented minor item.

It adds no deployment blockers. The remaining blockers are the pre-existing owner-only operations and the real-phone smoke test.
