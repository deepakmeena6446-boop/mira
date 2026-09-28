# 09 — Launch UX Acceptance Tests

**Purpose:** the definition of "launch-ready" for the UX redesign. Each case has:
- an **ID**;
- a **type**:
  - `AUTO-E2E`: an existing or updated Playwright spec;
  - `AUTO-UNIT`: Vitest;
  - `AUTO-SCRIPT`: a Playwright script check (08 §1 V-*);
  - `VISUAL`: a screenshot reviewed against the stated criteria;
  - `MANUAL`: a human or agent walkthrough;
- **steps / criteria**.

**Pass rule:**
- All `MUST` cases pass.
- `SHOULD` cases pass, or are logged as KNOWN RISK in `EXECUTION_LOG.md`.
- Anything citing a C-rule MUST from 02 is a MUST.

**Environments:**
- `mira-verify` (the prod build on :3150 plus the worker, live providers from `.env.local`) for VISUAL and MANUAL.
- The E2E harness (placeholder providers, `mira_e2e` DB, Mailpit) for AUTO-E2E.

**Viewports:**

| Name | Size |
|---|---|
| S | 360×740 (small Android) |
| M | 390×844 (primary) |
| T | 768×1024 |
| D | 1366×900 |
| E2E `mobile` | Pixel 7 |
| E2E `desktop` | 1280×900 |

---

## 1. Personas and states (the minimum matrix)

| ID | Persona / state | How to produce it |
|---|---|---|
| P1 | First-time visitor | New browser context, no storage → `/` redirects to `/welcome` |
| P2 | Logged-out user (welcomed) | Set `localStorage mira.welcomed=1`, no session |
| P3 | New user | Sign in with a first name (demo auth), no places, no Circle |
| P4 | Returning user | P3 + Home saved + one WhatsApp contact + one finished journey |
| P5 | Journey-heavy user | P4 + ≥3 arrived journeys to Home within ±1 h of now (seed through the UI, or the integration helpers in `tests/helpers`) + `mira.usage.v1` seeded with 6 `journey` events and 1 `report` over 10 days |
| P6 | Contribution-heavy user | A durable account (email link via Mailpit) + a ready MIRA Check + `mira.usage.v1` seeded with 6 `report`/`check`/`lit` events and 1 `journey` |
| P7 | Active journey | P4 + Go with Mira to Home |
| P8 | Normal route | A destination with a mapped route and lighting evidence (placeholder OSM extract: `Vishwavidyalaya Metro Gate No. 3` from `GEO` in `tests/e2e/helpers.ts`) |
| P9 | Potentially unsafe context | Night daypart + a route with lighting "not mapped" or "little mapped" + community notes present (the fixture `SAFETY_UPDATES=fixture` for Safety updates) |
| P10 | Report creation | Any persona → Report flow |
| P11 | Report verification | P6 answers a MIRA Check. A second account answers the same → verified |
| P12 | Help state | Any persona → I feel unsafe open |
| P13 | AI state | Signed in → Mira, send "What's open nearby?" |
| P14 | Network error | `context.setOffline(true)` after load; or block `/api/geo/*` with `page.route` → 500 |
| P15 | Empty community data | A fresh DB area without notes or checks (placeholder extract outside the pilot bbox) |
| P16 | Mobile viewport | M and S |
| P17 | Desktop viewport | D |

## 2. E2E copy contracts and the rename map

Baseline: `docs/launch-ux/e2e-contracts.baseline.txt` (Phase 0). **Every string below must remain, or change only through this table, with the spec updated in the same commit.**

| Old (tests) | New | Specs and tests to update |
|---|---|---|
| `button /Start with MIRA/` (journey CTA) | `button /Go with Mira/` | `a-share-trip`, `g-unsafe-and-contribution`, `h-375-evidence`, `docs/launch-ux/tools/capture-screens.mjs` |
| `button "Start with MIRA"` (Welcome step 1) | `button "Continue"` | `tests/e2e/helpers.ts newUser()`, specs with explicit onboarding, the capture tool |
| `"MIRA walkers…"`, `"MIRA couldn't…"`, `"MIRA could not confirm source coverage."` (LightingSummary UI) | "Mira walkers…", "Mira couldn't…", "Mira could not confirm…" | `tests/unit/components/journey-context.test.tsx` |
| `"MIRA attempts an email if you miss your check-in"` (a UI privacy claim) | "Mira attempts an email if you miss your check-in" | `tests/unit/privacy-claims.test.tsx` |
| /Location is off for MIRA/ | /Location is off for Mira/ | `g-unsafe-and-contribution` |
| `/MIRA attempts to email Mum a live link/` (Home UI) | `/Mira attempts to email Mum a live link/` | `a-share-trip` |
| `/Thank you/` | keep (the text becomes "Thank you."; the regex still matches) | none |
| `"Want MIRA with you on your journeys?"` (SharedTripView UI) | "Want Mira with you on your journeys?" | `a-share-trip` |
| `"Welcome to MIRA, Kiran"` (a server notification string) | **unchanged** (out of scope, 08 Phase 2) | none |
| Companion, persona, email and domain test strings containing "MIRA" | **unchanged** | none |

**Strings that must stay exactly** (non-exhaustive; the Phase 0 baseline file is authoritative):
- "Where are you going?" (heading, exact)
- "Search a place or address" (button and placeholder)
- "I feel unsafe"
- "Emergency call, 112" (link name)
- "Emergency options"
- "Emergency call options" (dialog)
- "Right now" (dialog)
- /Go to a Help Point/
- /Tell my people now/
- "I'm okay now"
- "Help Points near you" (dialog)
- "Help Points near me" (button name)
- /I'm here/
- /Send my live link/
- "End trip without arriving"
- "End trip"
- "Sharing live"
- /Nearest Help Point/
- "Are you okay?"
- /Nobody is alerted automatically/
- /Couldn.t email your link/
- /couldn't confirm the message went out/
- /Expected by/
- /You made it/
- "Journey ended"
- "Was the way lit?"
- "Send privately"
- /Dark or broken street/
- /^Reporting /
- label /Anything to add/
- /This looks like it includes a/
- /If you're in danger right now/
- "Message Mira…"
- "Send"
- role "log"
- /I'm not an emergency service/
- "🏠 Home" (the saved chip name; user data)
- "Saved as Home"
- "+ Add"
- label "Name"
- "Trusted"
- "Get started"
- "Your first name"
- /I confirm I.m 18 or older/
- "Continue"
- "Use my location"
- region "Lighting evidence before starting"
- region "Help Points along this route"
- "Sources and freshness"
- "The driving time from here is not known."
- navigation "Main" with links Home, Mira, Trips, Contribute, Me

## 3. Functional regression (MUST)

| ID | Type | Case |
|---|---|---|
| F-1 | AUTO | `npm run check` green (lint, typecheck, unit + integration) |
| F-2 | AUTO-E2E | `npm run test:e2e`: ≥ baseline passes (46), the same 4 intentional skips, 0 failures |
| F-3 | AUTO | `npm run audit:bundle`: no secrets in client assets |
| F-4 | AUTO-UNIT | The privacy allowlist and response tests (`tests/integration`) unchanged and green |
| F-5 | MANUAL | No console errors on any screen in `mira-verify` (in-app browser `read_console_messages`) for P2, P4, P7 |
| F-6 | AUTO-SCRIPT | No API request/response shape changed: compare `read_network_requests` endpoints for P4→P7 against the baseline list |

## 4. Mobile and responsive

| ID | Pri | Type | Case |
|---|---|---|---|
| R-1 | MUST | VISUAL | At M, Home peek (P4): Mira line, "Where are you going?", search, chips and Circle line all visible without scrolling |
| R-2 | MUST | VISUAL | At S, Home peek (P4): search and chips visible. At S, the route sheet half (P8): **Go with Mira** visible without scrolling |
| R-3 | MUST | AUTO-SCRIPT | V-anchor: Home and Trip at peek/half/full, sizes S/M/D. The I feel unsafe and Emergency boxes don't intersect the sheet |
| R-4 | MUST | VISUAL | At M, Contribute (P3): the report grid fully visible without scrolling |
| R-5 | MUST | VISUAL | At M, Report category screen: all six tiles plus "Something else" visible |
| R-6 | MUST | AUTO-SCRIPT | No horizontal scroll on any screen at S (`document.documentElement.scrollWidth <= innerWidth`) |
| R-7 | MUST | VISUAL | No content hidden under the tab bar at any detent. The last element of each tab-root page is fully visible when scrolled to the end |
| R-8 | SHOULD | VISUAL | At T, the sheet and modals are ≤560 px and centred |
| R-9 | SHOULD | VISUAL | At D, the side-panel layout (04 §29). If it's cut: the centred column and **the toast never overlaps the tab bar** (MUST) |
| R-10 | MUST | MANUAL | The on-screen keyboard (a real phone or Chrome device emulation): Mira's composer and the report note stay visible (`interactiveWidget: resizes-content` retained) |

## 5. Navigation

| ID | Pri | Type | Case |
|---|---|---|---|
| N-1 | MUST | AUTO-E2E | Tab links are exactly Home, Mira, Trips, Contribute, Me, in that order, with `aria-current` on the active one |
| N-2 | MUST | AUTO-SCRIPT | The tab bar is hidden on `/trip` while the journey is `active`/`missed`, and visible when closed and on all other `(app)` routes |
| N-3 | MUST | MANUAL | From an open journey, the header back button → `/trips` → the JourneyCapsule → back to `/trip` |
| N-4 | MUST | MANUAL | System back closes modal sheets (Unsafe, Emergency options, Help near, Sign in, Search) without leaving the screen |
| N-5 | MUST | AUTO-SCRIPT | Report reachable in ≤2 taps from each tab root: Home (secondary row → tile), Mira (Contribute tab → tile), Trips (Contribute tab → tile), Contribute (tile), Me (Report row → tile) |
| N-6 | SHOULD | MANUAL | Deep links `/me#places`, `#account`, `#help`, `#travel`, `#remembers`, `#app`, `#privacy`, `/contribute#checks`, `#impact` scroll to their section |

## 6. Maps

| ID | Pri | Type | Case |
|---|---|---|---|
| M-1 | MUST | MANUAL | The basemap renders day and night in the in-app browser (not headless). Google attribution and logo are visible |
| M-2 | MUST | VISUAL | Route colours: the chosen route is accent with a glow; alternatives are neutral; lit stretches have an amber glow; not-mapped stretches are dotted. No red anywhere on the map |
| M-3 | MUST | MANUAL | Fit-to-route on M: the whole route is visible between the chrome and the sheet at half (the MapLibre padding gotcha) |
| M-4 | MUST | VISUAL | Pins use glyph icons (no emoji). ≤8 pins before a destination; ≤6 on a journey |
| M-5 | MUST | MANUAL | Long-press → spot card → "Report here" opens Report at the spot (URL has no coordinates; `from=map` only). "Go here" opens the route sheet |
| M-6 | MUST | MANUAL | Everything on the map is also in the sheet as text (route summary, Help Points list) |
| M-7 | MUST | AUTO-SCRIPT | The journey presence halo animates only when the journey is active, the page is visible and reduced motion is off; `requestAnimationFrame` stops when hidden |

## 7. Journeys

| ID | Pri | Type | Case |
|---|---|---|---|
| J-1 | MUST | AUTO-E2E | `a-share-trip`: Home → saved chip → Go with Mira → trip → Tell my people now → I'm okay now → I'm here → the contact sees "arrived" |
| J-2 | MUST | AUTO-E2E | `b-missed-alert`: missed state "Are you okay?", honest alert copy |
| J-3 | MUST | AUTO-E2E | `j-whatsapp-circle`: "Send to {name}" → "Opened WhatsApp for {name} ✓"; never "sent" |
| J-4 | MUST | AUTO-UNIT | `journeyNextAction()`: unopened WhatsApp → "Send to {first}"; nobody following → "Send my live link"; otherwise "I'm here"; missed → "I'm here" |
| J-5 | MUST | AUTO-SCRIPT | V-one-primary on the trip in each J-4 branch |
| J-6 | MUST | VISUAL | The trip at M, half: Mira line status, ETA and next action visible. All banners keep their original strings |
| J-7 | MUST | MANUAL | End trip without arriving → inline confirm → End trip → "Journey ended" |
| J-8 | MUST | VISUAL | Arrived: a check icon (no 🎉, no orb), "You made it.", one question or nothing, the deletion line, Done |
| J-9 | MUST | VISUAL | The contact live view: status chip, name → destination, ETA with tz, freshness, **guidance line**, privacy footer; no emoji |
| J-10 | MUST | MANUAL | P5: the route sheet for Home says "Like last time, {name} will be able to follow." when `tripStartExtras` defaults sharing |

## 8. Accessibility (MUST unless noted)

| ID | Type | Case |
|---|---|---|
| Y-1 | AUTO-SCRIPT | `ariaSnapshot()` of Home, the route sheet, Trip, Unsafe, Mira, Contribute, Report and Me contains the headings and named controls in visual order (snapshot review) |
| Y-2 | MANUAL | Keyboard only: reach and operate search, chips, Go with Mira, the sheet handle (cycle detents), I feel unsafe, Emergency, all Unsafe actions, the tab bar, Report tiles, Send privately, Mira composer |
| Y-3 | MANUAL | Visible focus ring on every focusable element (accent, 2 px, offset) in day and night |
| Y-4 | AUTO-SCRIPT | Contrast: sample the computed colours of body, muted and subtle text, and of primary button text, in day and night; all ≥4.5:1 (script using the WCAG formula) |
| Y-5 | AUTO-SCRIPT | Touch targets: every visible `button`, `a` and `[role=radio]` in `(app)` has a bounding box ≥44×44, or ≥44 of hit area via padding (report offenders) |
| Y-6 | MANUAL | VoiceOver/TalkBack spot check (real device, owner): Home, Unsafe, Trip banners announced; Mira reply announced once |
| Y-7 | MANUAL | 200% text zoom at M: no clipped text in the sheets; the sheet scrolls |
| Y-8 | AUTO-UNIT | The Mira Pulse is `aria-hidden`, and every state has an adjacent text equivalent (component test) |
| Y-9 | MANUAL | Hindi input in Mira ("मेरा घर") renders in Noto Sans Devanagari with a 1.7 line-height |

## 9. Reduced motion (MUST)

| ID | Type | Case |
|---|---|---|
| RM-1 | AUTO-SCRIPT | V-rm on Home, the route sheet, Trip (active), Unsafe open, Mira streaming, Report thanks: no running animations after 1 s except ≤120 ms opacity |
| RM-2 | AUTO-SCRIPT | The map camera under reduced motion: `fitBounds` / `easeTo` durations are 0 |
| RM-3 | VISUAL | The Pulse states stay distinguishable without motion (the dashed arc for thinking, warm for attention, the double ring for scout) |

## 10. Reporting, contribution and Mira Scout

| ID | Pri | Type | Case |
|---|---|---|---|
| C-1 | MUST | AUTO-E2E | `d-reports`: report → moderation → aggregation flow unchanged |
| C-2 | MUST | MANUAL | P2 (anonymous): Contribute → "Dark or broken street" → Send privately → Thanks. Two taps plus send |
| C-3 | MUST | AUTO-UNIT | `reportGroupOrder(from, preset)`: journey/unsafe/mira/incident preset → "Something that happened" first; contribute/map/home/me/none → "On the street" first; unknown `from` ignored |
| C-4 | MUST | VISUAL | The report tiles use glyph icons, no pastel gradients; hint lines shown; the environment hint reads "Lighting, footpaths, blocked or flooded streets" |
| C-5 | MUST | VISUAL | Report thanks: "Thank you.", the close-the-loop line (07 §C.8) verbatim, the danger line with the number, Done, Report something else |
| C-6 | MUST | VISUAL | P3 (first-name account) on Contribute: the durable gate line appears **once**; the Report grid is fully usable |
| C-7 | MUST | AUTO-E2E | `g-unsafe-and-contribution`: the MIRA Check answered → "Waiting for someone else to confirm" (or the existing contract text) |
| C-8 | MUST | MANUAL | P11: after the second account confirms, P6's Home shows row 7 "Someone else confirmed what you told Mira." once, then not again (`mira.seen.verified`) |
| S-1 | MUST | AUTO-SCRIPT | `grep -rn "Local Steward" src/app src/components` returns only the privacy page's "(formerly Local Steward)" |
| S-2 | MUST | AUTO-UNIT | Mira Scout display is driven by `impact.steward.steward` only. The "What it takes" list equals `impact.steward.needs` |
| S-3 | MUST | MANUAL | Force the steward state (set `STEWARD_*` thresholds to 0/1 in the `mira-verify` env for a durable account with one verified receipt): the recognition card and Home row 3 appear once; Me shows the "Mira Scout" tag; nothing appears on `/t/*` or the map |
| S-4 | MUST | VISUAL | The Mira Scout mark is the Pulse plus a second ring. No medal, star, shield, count or leaderboard anywhere |
| S-5 | MUST | MANUAL | The copy never implies volume ("more reports → Scout"). The existing no-points line is present |

## 11. Ask Mira (AI)

| ID | Pri | Type | Case |
|---|---|---|---|
| A-1 | MUST | AUTO-E2E | `c-mira`: placeholder replies, cards, the not-an-emergency-service line, the log role, announce-once |
| A-2 | MUST | VISUAL | Mira messages without bubbles; one Pulse per Mira turn; user bubbles `sunken`; cards with one primary button; no orb or gradient |
| A-3 | MUST | MANUAL | Offline (P14) send: the warm failure message and the text returned to the composer |
| A-4 | MUST | AUTO-UNIT | `mira-line.ts`: every template passes the `companion-output` guard (no verdict words, any language) |
| A-5 | MUST | MANUAL | Home and the route sheet make **no** `/api/mira` request on load (network log) |
| A-6 | SHOULD | MANUAL | P6 chips start with "Report a broken streetlight"; P5 chips start with "Take me home"; at night the NIGHT list leads |

## 12. Help and emergency

| ID | Pri | Type | Case |
|---|---|---|---|
| H-1 | MUST | AUTO-UNIT | UnsafeSheet button-name order snapshot is identical to the baseline |
| H-2 | MUST | AUTO-E2E | `g`, `a`: the unsafe flows; "Right now" dialog; Tell my people now; I'm okay now |
| H-3 | MUST | MANUAL | The Emergency pill → `tel:{cited number}` in one tap (IN: 112). A country without an all-service number → "Emergency options" dialog |
| H-4 | MUST | MANUAL | The Unsafe sheet opens instantly with prefetched Help Points (P4 at M). With `/api/geo/help` blocked → the "couldn't check" copy, not "none" |
| H-5 | MUST | VISUAL | The Emergency pill is neutral (surface/ink), never red or accent. There are no siren or shield icons in the UI |
| H-6 | MUST | MANUAL | Opening Unsafe on a journey stops the halo breath (`elevated`); closing resumes it |

## 13. Personalisation

| ID | Pri | Type | Case |
|---|---|---|---|
| P-1 | MUST | AUTO-UNIT | `usageMode`: cold (<3 events); journey (J≥2C, J≥2); contribute (C≥2J, C≥2); mixed; hysteresis 2.5× / 1.5×; half-life 21 d; caps 60 events / 60 days; storage unavailable → cold |
| P-2 | MUST | AUTO-UNIT | Same-day stability: recording new events doesn't change the returned mode until the local date changes |
| P-3 | MUST | MANUAL | P6 at M: the Home secondary row order is Report · Help Points near me · Ask Mira; the Mira line prefers the ready check. P5: Help Points near me · Report · Ask Mira; the Mira line shows the habit with **Go with Mira** |
| P-4 | MUST | MANUAL | Night plus P6 with a habit match: the habit (row 5) precedes the check (row 4) |
| P-5 | MUST | MANUAL | Me → What Mira remembers → Reset how Mira arranges Home: keys cleared, Home back to the default order, toast shown |
| P-6 | MUST | MANUAL | Sign out and Delete account clear `mira.usage.v1` and `mira.seen.*` |
| P-7 | MUST | MANUAL | `/privacy` lists "What Mira keeps on this phone" |
| P-8 | MUST | AUTO-SCRIPT | No request body or URL contains `mira.usage` contents (network log during P5/P6 sessions) |
| P-9 | MUST | MANUAL | No explicit safety setting changes automatically (07 §B.6): compare `/api/me`, contacts and prefs before and after a P5/P6 session |
| P-10 | SHOULD | MANUAL | The "Why?" disclosure under the Mira line shows the reason text per 07 §A.5 |

## 14. Auth

| ID | Pri | Type | Case |
|---|---|---|---|
| U-1 | MUST | AUTO-E2E | `newUser()` onboarding and first-name sign-in work with "Continue" |
| U-2 | MUST | MANUAL | The email magic link via Mailpit upgrades the account (Me → Keep your account) and the durable gate on Contribute disappears |
| U-3 | MUST | MANUAL | Signed-out Mira shows the sign-in wall; the example chips open sign-in |

## 15. Loading, error and empty states (MUST)

| ID | Type | Case |
|---|---|---|
| E-1 | MANUAL | The four-state copy (04 §25) for lighting and Help Points: fixtures for unknown (approximate route), empty (no Help Points), failed (block `/api/geo/route` lighting / `/api/geo/help` → evidence failed), unavailable (Overpass unconfigured) all render **different** text |
| E-2 | MANUAL | P14 offline: Home shows the single offline line; search shows "Couldn't search right now"; Emergency still works (`tel:` link present) |
| E-3 | VISUAL | Empty states: Trips (no journey), Inbox (all quiet), Contribute impact (nothing confirmed), Around you (no places); no orb, one sentence, one action max |
| E-4 | MANUAL | Loading text appears only after 300 ms (throttle the network to "Slow 4G" and observe "Finding the way…" with the Pulse thinking) |
| E-5 | MANUAL | The trip banners: worker down (stop the worker), GPS denied (block permission), upload failing (offline) → each banner copy unchanged; the Pulse in `attention` |

## 16. Performance (SHOULD unless noted)

| ID | Type | Case |
|---|---|---|
| PF-1 | MANUAL | JS bundle for `/` grows ≤10% versus baseline (`next build` output) |
| PF-2 | MANUAL | Fonts: Latin preloaded; the Devanagari file is **not** downloaded on an English-only session (network log) (MUST) |
| PF-3 | MANUAL | The journey halo loop runs at 30 fps or less and stops when hidden (performance panel) |
| PF-4 | MANUAL | The Unsafe sheet renders < 100 ms after tap with prefetched data (MUST) |

## 17. Visual consistency (MUST)

| ID | Type | Case |
|---|---|---|
| V-1 | AUTO-SCRIPT | No `bg-mira`, `bg-companion`, `animate-breathe` or `animate-ping` classes in rendered DOM (`document.querySelectorAll`) on any screen |
| V-2 | AUTO-SCRIPT | V-one-primary on every listed state (Home default, habit, route sheet, trip ×3, arrived, Contribute, Report form, Mira card) |
| V-3 | VISUAL | Radii limited to the tokens (8/12/14/16/24/full); no violet hues; shadows only on over-map elements and sheets |
| V-4 | AUTO-SCRIPT | No emoji in system UI (the 08 Phase 11 grep), with documented exceptions only (saved-place emoji, chat mirror) |
| V-5 | VISUAL | Section labels are sentence case (no uppercase eyebrows) |

## 18. Copy consistency, privacy messaging and trust (MUST)

| ID | Type | Case |
|---|---|---|
| CP-1 | AUTO-SCRIPT | `grep -rniE "\b(stay safe|get home safely|safe route|unsafe area|dangerous|danger detected|you'll be fine)\b" src/app src/components` returns nothing. "I feel unsafe" (the user's own statement) and "safety updates" are allowed |
| CP-2 | AUTO-SCRIPT | The product name in React UI is "Mira" (not "MIRA") except the documented server-string exceptions (08 Phase 2) |
| CP-3 | MANUAL | "Go with Mira" is only the journey start; "Continue" on Welcome |
| CP-4 | MANUAL | No exclamation marks in UI copy except the optional "You made it." (no exclamation either). No motivational filler |
| PR-1 | MANUAL | Every live share shows who can see and until when (Trip Mira line and details) |
| PR-2 | MANUAL | The coarse-location line on Report ("Only a rough area…") is present |
| PR-3 | AUTO-SCRIPT | No coordinates in any URL during a full P7 session (network log: no `lat=`/`lon=` or decimal pairs in paths or queries to app routes) |
| T-1 | MANUAL | Every contextual claim (lighting, Help Point hours, Safety updates, community notes) has its source and age one tap away |
| T-2 | MANUAL | "Opened", "attempts" and "couldn't confirm" wording survives the redesign: diff the Trip, Circle and Unsafe copy against the baseline; only the approved shortenings appear, with the full text in the "Details" disclosures |
| T-3 | MANUAL | Absence is never reassurance: with no notes, nothing says "no reports" as positive (P15) |

## 19. Screenshot-based visual acceptance cases

Capture with `docs/launch-ux/tools/capture-screens.mjs` (update its selectors in Phase 2 for "Go with Mira" / "Continue") at M (day and night) and D (day), plus S for the marked items. Compare to `docs/launch-ux/screenshots/` (the before set). Each case must meet its criteria:

| Case | State (screenshot NN) | Must show | Must not show |
|---|---|---|---|
| VS-01 | Welcome 1 (01) | Pulse mark, promise, 3 rows + contribution row, Continue visible at S | orb, gradient, emoji |
| VS-02 | Welcome 2 (02) | Location reason and Use my location | orb |
| VS-03 | Home signed-out peek (03) | Signed-out Mira line, search, secondary row reachable, HelpCluster | gradient, emoji in greeting |
| VS-04 | Home signed-out full (04) | Help anchors visible above the sheet | anchors covered |
| VS-05 | Unsafe signed-out (05) | Lead line, the frozen order, ink Emergency, "I'm okay now" button | accent-tinted Help Point card, emoji |
| VS-07 | Help near (07) | Glyph icons, unwrapped hours | emoji |
| VS-08/09 | Search (08/09) | Flat canvas, saved first, kind icons | glow background |
| VS-10/11 | Route sheet (10/11) | Mira line summary, one lighting block before Go, Go with Mira visible at half | the duplicate "Lighting ·" row, gradient button |
| VS-12 | Spot card (12) | Two outlined actions with icons | 🚩🧭 emoji, tinted fills |
| VS-13 | Sign-in (13) | Pulse, primary Continue | orb, gradient |
| VS-14 | Home signed-in peek (14) | Mira line (adaptive), chips, Circle line, secondary row | the nudge below the fold |
| VS-15/16 | Route sheet signed-in (15/16) | Share radio, one-line disclosure plus Details, Save chips below Help Points; at full the anchors visible | anchors covered |
| VS-17/18 | Trip (17/18) | No tab bar, HelpCluster, Mira line, ETA, one filled next action | two filled buttons, the tab bar |
| VS-19 | Trip unsafe (19) | Same as VS-05; the halo static behind the scrim | n/a |
| VS-20 | Contact view (20) | The guidance line, freshness | 🎉 |
| VS-21 | Home with a trip (21) | JourneyCapsule (the Pulse with-you) | the gradient card |
| VS-22 | Trips (22) | Capsule, retention line | orb |
| VS-23 | Arrived (23) | Check, "You made it.", question, Done | 🎉, orb, gradient |
| VS-24/25 | Mira (24/25) | Header subtitle, a Mira turn without a bubble, one Pulse | an orb per message |
| VS-26 | Contribute (26) | The report grid first, the gate line once, the Mira Scout block | three gate paragraphs |
| VS-27/28/29 | Report (27/28/29) | Grouped tiles, cards, thanks copy | emoji, pastel gradients, 💜 |
| VS-30 | Me (30) | ≤6 groups, Report in Contributing, Reset row | Report under Privacy |
| VS-31 | Circle (31) | One-line explanation plus disclosure | multiple paragraphs |
| VS-32 | Inbox (32) | Glyph icons | emoji |
| VS-34 | Offline search (34) | "Couldn't search right now" | "No results" |
| VS-N | Night set (all of the above at night) | Warm near-black canvas, teal accent legible, Google dark basemap in the manual check | violet-black |
| VS-D | Desktop set | Side panel or a clean centred column; the toast not over the tab bar | overlaps |
| VS-P5 | Home, the journey-heavy fixture | The habit Mira line with Go with Mira; the default secondary order | n/a |
| VS-P6 | Home, the contribution-heavy fixture | The check Mira line; Report first in the secondary row | n/a |

## 20. Launch-ready definition (UX)

Mira's launch UX is **ready** when:
1. Sections 3–18 have every MUST passing, and every SHOULD passes or is a logged KNOWN RISK.
2. Every VS case is reviewed and recorded as passing (with a screenshot path) in `EXECUTION_LOG.md`.
3. There are no open `REQUIRES_OWNER_APPROVAL` items that the launch depends on. By design, none of the plan's items do.
4. The owner's real-phone smoke test (`PRODUCTION_SMOKE_TEST.md`) is scheduled. It remains owner-only and outside this sprint.
