# UX Documentation Report — Launch UX Planning Phase

**Date:** 2026-09-28
**Branch:** `docs/launch-ux`, created from `release/beta-rc` @ `81db304` (the frozen public beta)
**Phase type:** documentation and planning only. **No application code, schema, API, route, dependency or deployment was changed.**

The only files added are under `docs/launch-ux/`:
- ten documents;
- 100 screenshots;
- one docs tool, `tools/capture-screens.mjs`, which is lint-clean and not part of the app.

Local-only side effects of the audit:
- `docker compose up -d` started MIRA's PostGIS and Mailpit.
- The `mira-verify` preview server ran on :3150.
- The local DB gained a first-name test account ("Asha"), one saved place, one finished test journey and one private test report. These live in the local dev DB only.

---

## 1. Repository understanding

Mira (MIRA in today's UI) is a Next.js 16 / React 19 / Tailwind 4 PWA with a MapLibre map over Google raster tiles, a PostGIS database, a separate worker, and provider adapters with honest evidence states. The main features:
- **Journeys:** walk, ride or transit, with per-contact live links (WhatsApp-first) and missed-arrival alerts when email is on.
- **Evidence-first route context:** lighting from walker votes, OSM and Mapillary; deterministic Help Points; safety updates.
- **"I feel unsafe":** deterministic and instant.
- **Cited emergency numbers** for 195 countries.
- **Mira, the Claude companion:** a guarded persona and tool cards that need a tap.
- **Contribution:** MIRA Checks, corrections, lighting votes, private moderated reports and aggregate community notes.
- **Verified-only impact and a quality-based trust status** (Local Steward).
- **Visible, reversible personalisation:** habits, travel preference and Help Point filters.

The product's substance already matches the frozen thesis closely. Its presentation does not. The full audit is in `01`.

## 2. Documents created (`docs/launch-ux/`)

| File | What it settles |
|---|---|
| `01_CURRENT_PRODUCT_AUDIT.md` | What exists: routes, systems and per-screen audit with screenshots; the feature classification (PRIMARY / CONTEXTUAL / SECONDARY / SETTINGS / REDUNDANT) |
| `02_MIRA_PRODUCT_EXPERIENCE_CONSTITUTION.md` | **The highest authority.** C-rules (MUST / SHOULD / MAY / MUST NOT) for every thesis area, compatible with `PRINCIPLES.md` |
| `03_UI_UX_INSPIRATION_RESEARCH.md` | 25 product references, AI-first products, open-source, motion and visual systems, real user feedback (USER_SIGNAL vs DESIGN_INTERPRETATION); what to adopt and reject; a reconciliation table of research ideas that conflict with Mira's principles |
| `04_MIRA_DESIGN_SYSTEM.md` | Tokens (KEEP / REFINE / REPLACE), type, colour, surfaces, icons, components, Mira Pulse, Mira line, Mira Scout mark, states, accessibility, dark mode, breakpoints, migration table |
| `05_MIRA_INTERACTION_AND_MOTION_SYSTEM.md` | Motion tokens; the Mira Pulse state machine; every motion's purpose, trigger, timing and reduced-motion path; haptics; removals |
| `06_SCREEN_BY_SCREEN_LAUNCH_SPEC.md` | The implementation blueprint for all 20 screens and states, with acceptance criteria |
| `07_ADAPTIVE_MIRA_AND_COMMUNITY_SPEC.md` | Deterministic Mira-line rules, the device-local usage signal, stable anchors vs adaptive surfaces, reset and privacy, the community trust model, Mira Scout, post-launch items |
| `08_LAUNCH_UX_EXECUTION_PLAN.md` | 13 phases (0–12): files, invariants, sequence, validation, exit (PASS / KNOWN RISK), cut order |
| `09_LAUNCH_UX_ACCEPTANCE_TESTS.md` | The persona and state matrix, E2E copy contracts and rename map, about 120 test cases, 30+ screenshot acceptance cases, and the launch-ready definition |
| `UX_DOCUMENTATION_REPORT.md` | This report |
| `screenshots/` | 100 audit screenshots: mobile day, mobile night, desktop day |
| `tools/capture-screens.mjs` | A reproducible Playwright capture of every state |

## 3. Major UX problems discovered

1. **The visual language contradicts the thesis.** Lavender canvas, a violet accent, violet-to-rose gradient CTAs, glass on every surface, a breathing gradient "AI orb", about 49 emoji used as icons, very round floating cards and extrabold type. This is the recognisable "AI app" look that research shows users now read as generic and low-trust.
2. **Hierarchy by accumulation.** Home, the route sheet, the journey sheet and Contribute present every true statement at equal weight. The *conclusion* ("16 min, mostly unmapped for lighting, 3 staffed places on the way") is never said. The user assembles it from evidence rows.
3. **The safety anchors get covered.** At the `full` sheet detent, the I feel unsafe and Emergency pills are hidden under the sheet on Home (seen on mobile and desktop). This is the only finding with safety weight, and it's fixed in Phase 2.
4. **The journey isn't immersive.** The tab bar stays over the live-journey sheet, and two filled primary buttons (I'm here / Send my live link) compete all the time.
5. **The adaptive element is invisible.** The habit suggestion ("like usual") sits below the fold at peek.
6. **"Mira for Everyone" is under-served.** For a new first-name account, Contribute shows the sign-in gate three times, and the one live action (Report) is third. After a report the contributor hears nothing more (a "void").
7. **Report taxonomy is incident-heavy in presentation.** Four of six tiles are incidents; street conditions share one tile.
8. **Mira's presence is decorative** (an orb) rather than state-carrying.
9. **Desktop** is a centred phone column. The toast overlaps the tab bar.
10. **Naming is inconsistent:** MIRA vs Mira; "Start with MIRA" means two different things; Local Steward vs Mira Scout.

## 4. Existing strengths to preserve

- **Truthfulness engineering.** Unknown ≠ empty ≠ failed ≠ unavailable; "Opened WhatsApp", never "sent"; honest banners.
- **Deterministic, instant help.** Unsafe sheet, cited emergency numbers, Help Points; no AI, no wait.
- **Privacy architecture.** No history, per-journey links, coarse reports, aggregate-only public output.
- **Quality-based trust already implemented** (Local Steward: verified, multi-day, multi-area, ≥80% agreement, anomaly flags). **Mira Scout needs a rename, not an engine.**
- **Visible, reversible personalisation** (habits with Forget all).
- **Time-of-day theming.**
- **A solid accessibility floor** and a reduced-motion kill switch.

## 5. Biggest opportunities

1. **The Mira line.** One deterministic sentence per decision turns existing evidence into Mira's voice: "Mira does the work." It needs no LLM and no API.
2. **Mira Pulse and the presence halo.** On a journey, Mira's presence *is* the halo around your own dot. That makes a recognisable, state-carrying signature from something that already exists.
3. **Contribute as a two-tap front door** for people who never take journeys. The report grid is deep-linked from Contribute (`/report?c=` already works).
4. **Close the loop honestly.** Surface "Someone else confirmed what you told Mira" and the Mira Scout recognition, using data `/api/contribute` already returns.
5. **Usage-balanced Home.** A device-local, day-stable, resettable signal reorders only the adaptive surfaces.

## 6. Proposed design direction

*Calm intelligence × living city × premium companion.*

**Colour and type:**
- Warm-neutral paper canvas (`#F6F5F1`), warm near-black at night (`#111312`).
- A single deep **lagoon teal** accent (`#1D6B63` / `#7CC4B9`) meaning "Mira / you / your journey".
- Amber reserved for lighting evidence on the map. Warm reserved for "needs you". Red only for failed operations.
- **Instrument Sans** plus lazily loaded **Noto Sans Devanagari**, weights 400/500/600.
- Five radius tokens. Borders instead of shadows on the canvas.

**Components:**
- A docked tab bar, with an immersive journey mode.
- Glyph icons replace emoji.
- Motion only to carry state, ≤300 ms for UI, and one ambient loop at most (the journey breath).

Details are in `04` and `05`.

## 7. Structural changes required

**`NONE`.**

Every launch item is presentation-layer:
- components, CSS tokens and copy;
- two new pure presentation modules (`mira-line.ts`, `usage-signal.ts`);
- device-local storage keys, disclosed and resettable;
- one UI-only query param (`/report?from=`).

No schema, API, worker, domain-rule or route changes.

**Decisions made by these documents that the owner may want to veto** (none needs a structural change, and each is an isolated, revertible step):
- **Naming:** "Mira" in React-rendered UI, and "Go with Mira" as the journey CTA (08 Phase 2, a separate commit). Server strings (emails, the companion persona, domain copy) keep "MIRA" for now. This is an accepted inconsistency, logged as post-launch item D14.
- **Moving "I feel unsafe" on the journey screen** from the sheet into the top help cluster, matching Home.
- **Hiding the tab bar during an open journey.**
- **Font change** to Instrument Sans (with a documented fallback to Plus Jakarta Sans).

**Items marked `REQUIRES_OWNER_APPROVAL`.** These are *not* in the launch plan and are documented only (07 §D):

| Item | Why it's not presentation-only |
|---|---|
| Report taxonomy extension (flooding, road hazard, damaged infrastructure) | DB constraint, moderation tags, aggregation templates |
| "Still there?" passer-by confirmations outside journeys | New server capability plus privacy review |
| Per-report status for reporters | New API over the user's reports |
| Area-named Mira Scout ("· Saket") | Area keys are HMAC hashes by design; this needs a readable-area privacy change (default: no) |
| Corroborated reports counting toward Mira Scout | Reverses an existing decision (default: no) |
| "Heightened watch" after I feel unsafe | Changes escalation behaviour and the worker |
| Discreet mode | Manifest and brand |
| Folding the Trips tab into Home | Changes the locked Day-0 navigation (default: keep five tabs) |

**Explicitly rejected thesis item:** a "suspicious activity" report category. It is people-reporting, which `PRINCIPLES.md` §3 and C-5.3 forbid. Threats and intimidation remain reportable.

## 8. Dependencies considered (none installed; none required)

| Candidate | Verdict |
|---|---|
| Motion (framer-motion), Vaul, Sonner, Magic UI, Aceternity, shadcn/ui, Radix, `@use-gesture/react`, deck.gl | **REJECT.** Existing primitives plus modern CSS cover the need. Size, maintenance and "AI-slop" risk |
| Base UI, React Aria | **CONSIDER LATER** (Base UI first) if a primitive is ever needed |
| Motion mini `animate()` | CONSIDER LATER, only if JS springs become essential |
| Fonts via `next/font` (Instrument Sans, Noto Sans Devanagari) | **ADOPT.** Build-time static assets, not a package |
| Native `<dialog>` / `popover` / `inert`; `navigator.vibrate` | ADOPT later / as progressive enhancement |
| Impeccable detector (`npx impeccable detect`) | CONSIDER LATER as a one-off dev audit |

The full table with sizes and sources is in `03` Part 3.

## 9. Top implementation risks

1. **The E2E copy contracts.** Renaming "Start with MIRA" and "MIRA" touches about 20 assertions across `a`, `g`, `h`, the helpers and two unit tests. Mitigation: the 09 §2 map, same-commit updates, and an isolated naming commit.
2. **The MapLibre padding gotcha** when sheet detents change (fits silently fail on phones). Mitigation: a single `setPadding`, plus M-3.
3. **Font metrics shift** causing truncation. Mitigation: a Phase 1 screenshot pass and the documented fallback font.
4. **The adaptive surfaces feeling unstable.** Mitigation: day-stability, hysteresis, stable anchors, reset (P-1, P-2).
5. **Journey immersive mode stranding users.** Mitigation: the back button, and N-2 / N-3.
6. **Time.** About 17 h of work against one night. Mitigation: a strict phase order and a documented cut order that never cuts safety, hierarchy or regression phases.
7. **Headless screenshots lack the Google basemap.** Map visuals need manual in-app-browser checks (M-1).

## 10. Scope explicitly rejected

- Any new screen, route, API, schema, worker job or dependency.
- A new report category.
- Public profiles.
- Leaderboards, points or streaks.
- Safety scores.
- Incident alerts or feeds.
- "Suspicious activity" reporting.
- A chat-first Home.
- An LLM-generated Mira line.
- Auto-changing safety settings.
- A family-tracking or always-on mode.
- A fake Dynamic Island.
- Server-string renaming.
- Deploying.
- Changes to `PRINCIPLES.md` or legal texts beyond the "Mira Scout" and naming terms in the UI.

## 11. Final verdict

**`READY_FOR_LAUNCH_UX_EXECUTION`**

An execution session can implement the redesign from these documents without reinterpreting Mira. They cover:
- what Mira is and is not (`02`);
- what exists and must stay (`01` §8, `06` "Must remain");
- what changes and how it looks and moves (`04`, `05`, `06`);
- how Mira becomes personal (`07` §A–B);
- how community trust and Mira Scout work (`07` §C);
- the order of work with validation and exit gates (`08`);
- how regressions are prevented and what launch-ready means (`09`).

**Nothing the plan depends on awaits owner approval.** The owner may veto the four listed decisions (§7), and each is isolated and revertible.
