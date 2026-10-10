# Mira companion — mobile UX redesign

Branch `design/mira-companion-ux`, from `sprint/mira-companion-48h` at `513b734`. A redesign of the
companion's existing flows; no new capabilities, providers, dependencies or data. Every screen still
shows only what the app actually checked, from its real states.

## What the walkthrough found (before)

Walked at 320, 390, 430 and 1280 on the local stack (Chromium emulation, deterministic providers):

- **Home** offered four equal tiles with no word on what each does; at 320 the first real choice sat
  below the fold, and the lower half of the screen was empty.
- **The brief** said the same fact up to four times (heading, summary, sky card, ledger) and ran about
  six screens. When a check failed, the failure was repeated three times.
- **Time zones:** the sky strip on the brief and the Around sky card used the device's zone, not the
  place's — a wrong clock for anyone planning somewhere else.
- **Plan** cut off its situation carousel; the trip card truncated the places it names.
- **Around** showed a meaningless "— to the nearest" stat, icon-only actions, and placed corrections as a
  bare link with no word on what happens to them. A page opened with its search up
  (`/around?check=1`) failed hydration.
- **Chat** truncated the plan strip's name; the private notice was 0.7rem grey text under the box.
- **Journeys** was a wall of four look-alike cards.

## Direction

Two directions were weighed:

- **A — warm paper companion (chosen).** Warm ivory canvas, plum-ink text, one indigo accent; a quiet
  serif (Instrument Serif) only for Mira's voice and the screen's one big line; everything else Instrument
  Sans. The sky card stays the one rich surface, because it carries the takeaway (the calculated sky at the
  time she chose). Calm, legible at night, and it makes the evidence — not decoration — the visual event.
- **B — sky-first.** Full-bleed time-of-day gradients behind every screen. Rejected: decorative, weaker
  contrast for small text at dusk, and it competes with the one card that carries information.

## Design system (compact)

All in `src/app/globals.css` tokens and a handful of classes.

- **Colour roles** (day / night): `canvas`, `surface`, `sunken`; `ink`, `ink-muted`, `ink-subtle`;
  `line`, `line-strong`; `accent`, `accent-strong`, `accent-soft`; plus the existing evidence roles
  (`warm`, `dusk`, `people`, `error`). Every text role is ≥ 4.5:1 on canvas and surface in both themes;
  control borders (`line-strong`) are ≥ 3:1.
- **Type:** `.m-display` (serif, one per screen), `.m-voice` (Mira's line), `m-title`, body 1rem,
  `m-label` for section labels, 0.8125rem for supporting lines; never below 0.75rem.
- **Controls:** `.mira-primary` (one per screen, pill, accent), `.m-btn-secondary` (outlined pill),
  `.m-link` (text action with icon); every target ≥ 44px, visible focus ring from the base styles.
- **Surfaces:** `.m-card` (surface + hairline), list cards with `divide-line` rows, `Sheet` (bottom sheet,
  safe-area padded), notices as tinted rounded blocks with an icon.
- **States:** loading (skeleton/“checking”), empty (says what will appear and how), unavailable (“Mira
  couldn’t check …” + Try again, the plan kept), success (`role="status"`), error (`role="alert"`).
- **Motion:** the existing `animate-rise`/`animate-fade`, both off under `prefers-reduced-motion`.
- **Layout:** long names wrap (`overflow-wrap:anywhere`) rather than truncate where the name is how she
  recognises the thing; the chat dock is measured so the latest reply always clears it.

## Flow by flow (after)

1. **Home and getting started.** One composer leads: “Where are you heading or what would you like to
   know?”, with three example chips that fill (never send) the box. Below, the two paths as explained rows
   — *Plan an outing* (“Choose where and when. Get a short brief before you go.”) and *Around a place*
   (“See what’s known near a place — no route or location needed.”) — then the presets as quiet links.
   Nothing asks for location; the footer says Mira asks only for what it needs.
2. **Preparing an outing.** A three-way segmented choice (Going somewhere / Run or walk / Travelling) instead
   of a cut-off carousel; one trip card that says the plan back once (“Planning a walk · From …”) with
   chips for time and mode; the next unanswered question is marked *Next*. The brief then reads in order:
   **takeaway** (the sky card: duration, qualifier and source, or a failed check with “Your plan is kept”
   and Try again) → **at most two more things** (“What matters”) → **next action** (Go with Mira, Save or
   the honest reason it can’t be saved) → **evidence**, folded into “What Mira checked · N checks · M
   couldn’t be checked”. The map stays behind “View map”.
3. **Around a place.** Times use the place’s zone. The sky card, then Mira’s take, then one primary
   (*Plan going here*) and two labelled secondaries (*Ask Mira*, *Save*). Help Points capped at three,
   names wrapping. Evidence folded. Then an optional **Know this place?** section: *Correct this
   information* explains what it covers; the note says a correction is private and Mira uses it only once
   someone else says the same; a sent correction reads “Sent privately.” plus its real outcome (waiting,
   matched, contradicted) — submitting is never shown as verified or published.
4. **Mira chat and Journeys.** Chat’s empty state uses the same serif line and list cards for starters. The
   plan strip wraps its name. The private notice is a banner above the box (lock icon, people tint) so it
   is in view with the keyboard open, with *New conversation* inline. Journeys uses the same start list as
   Home.

## Boundaries kept (unchanged code paths)

Safety-output guard; private conversation stickiness and in-memory context; provider provenance and
persistence limits (Google details never saved to the account); place-correction isolation per place
(keyed remount, late-response guard); explicit location consent; saving eligibility said before the tap;
remembered preferences as defaults only. The e2e and unit tests that pin these were kept and pass; where
copy moved, assertions were updated to the new copy without being loosened.

## Screenshots

`screenshots/` — Chromium emulation (Pixel 7 profile resized to each width) on the local stack with
deterministic providers; the theme follows the time of capture (night). Paired images are
before (sprint head `513b734`) on the left and after on the right.

| Flow | File |
| --- | --- |
| Home at 390 / 320 | `home-390.jpg`, `home-320.jpg` |
| Brief, first screen / whole page | `brief-390.jpg`, `brief-full-390.jpg` |
| Brief with the route check failing | `brief-failed-390.jpg` |
| Around a chosen place | `around-place-390.jpg` |
| Around with no location | `around-denied-390.jpg` |
| Place search failing | `search-failed-390.jpg` |
| Correction, signed in without email | `correction-390.jpg` |
| Mira, private conversation | `mira-private-390.jpg` |
| Journeys, guest and empty | `journeys-guest-390.jpg` |
| After only: switching place mid-correction, revisiting a plan via Back, chat box focused, Go sheet, I feel unsafe sheet, saving blocked by a GPS start, desktop Home, forced light theme, empty plan, signed-in Journeys | `after-*.jpg` |

## Refinement pass (2026-10-10)

1. **Around keeps a chosen place on its own clock.** While its zone is being looked up ("Local time…") or after the
   lookup fails ("Local time unknown"), nothing is said on the phone's or the country's clock: daylight changes are
   given from now ("changes in about 15 min" — a solar calculation needs no zone), and listed opening hours aren't
   read ("hours wait for local time" / "hours not checked: local time unknown"). Hours a provider marks open 24 h, and
   a fresh provider open/closed flag, still show. Around her own position is unchanged.
2. **Support stays in reach, quieter.** On ordinary task screens *I feel unsafe* and *Emergency* share one hairline
   capsule (`role="group"` "Support") instead of two outlined pills with an ink ring — same labels, same place, 44 px
   targets. Below 360 px the labels may take two short lines and the phone icon drops; with 200 % text the two stack
   rather than squeeze. Journey screens and Welcome keep the stronger form.
3. **The brief leads with the most decision-relevant fact, by fixed rules** (`chooseTakeaway`): a failed route check;
   on foot, the calculated sky when it's dark at the start or turns before she's due to finish; a released note from
   people whose day/evening/late band is the one she's going in; otherwise the travel-time estimate. Whatever doesn't
   lead stays in "What matters" with its qualifier.
4. **Chat answers scan.** A finished reply is grouped — facts first (a sentence each, qualifiers kept with their fact),
   the next step, "What this doesn't check" (shown, not folded) and the source line — in the server's exact words, so
   the output guard and provider attribution are untouched.
5. **Apple touch icon** redrawn from `icon.svg` in the approved palette.

New screenshots: `refine-zone-checking-390.jpg`, `refine-zone-unknown-390.jpg`, `refine-brief-night-390.jpg`,
`refine-chat-grouped-390.jpg`, `refine-header-320.jpg`, `refine-header-text200-390.jpg`.

## The two full-suite timeouts

Both were diagnosed from preserved traces and server logs (local diagnostic config: server/worker stdout piped,
`--output` outside `test-results`). Neither was a product defect; both were test-harness races. Timeouts and
assertions are unchanged.

- **`b-missed-alert` — "I'm here" detached.** The page at the timeout read "You made it." The server log had
  `trip.arrived by:"auto"` for that trip at the moment of the click. The test's fixture position sits inside the 75 m
  arrival radius, so after the 45 s dwell a routine location upload auto-arrived the journey, racing the test's
  click after a fixed 25 s wait. Forced on demand by lengthening the wait to 40 s (fails every time); with the owner
  ~550 m short of the destination — as someone who has missed her arrival is — the 40 s probe passes with
  `by:"user"`. The two sibling tests had the same exposure through their reloads.
- **`x-phase3-a11y` — "renderer stall".** The audit's `page.evaluate` was never sent. The test was in
  `waitForLoadState("networkidle")`, which has no deadline without a navigation timeout. Five link prefetches from the
  previous document were cancelled by the `goto("/")` and never reported finished, so Chromium's `networkIdle`
  lifecycle event never fired; every server response completed and the page was quiet after ~8 s. A 30-iteration probe
  of the same sequence didn't reproduce it (a rare race). The settle is now bounded at 10 s after the `main` landmark
  exists — still best-effort, as its `catch` intended; every audit check still runs on every screen.

## Verification (2026-10-10, local, at the head that carries this note)

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| Unit (`vitest --project unit`) | 1004 passed (94 files) |
| Integration (`vitest --project integration`, local PostGIS) | 204 passed (37 files) |
| `npm run build` | passed |
| `npm run audit:bundle` | passed — 131 files, 14 patterns, no secrets |
| E2E full suite, mobile + desktop, run 5 (final code) | **156 passed, 6 skipped, 0 failed** (15.7 min) |
| New e2e | `y-companion-zone` (Lisbon from India time, delayed and failed zone lookup), `y-companion-header` (six screens at 320 px), night-brief case in `y-companion-flows` |
| Capture spec (`zz-capture`, local only) | passed |

Earlier runs on this branch, for the record: run 1 — 1 failed (`x-phase3-a11y` stall); run 2 — 1 failed
(`b-missed-alert`); run 3 (previous build) — 0 failed; run 4 — 5 failed (`b-missed-alert`, plus two regressions from
this pass — the capsule overflowed at 200 % text, and a late-hours note led a midday brief — each on both projects);
a targeted run after those fixes — 1 failed (`x-phase3-a11y` stall, the trace above). Run 5 is the first full run with
every fix in place.

Simulation only: Chromium 1194 headless shell (the pinned 1243 build isn't installed here), device emulation,
deterministic companion and OSM fixtures, synthetic labelled fixtures for the Lisbon place. Not verified: a real phone
(keyboard overlap, safe areas, iOS fixed-position behaviour), a screen reader, live Google/Anthropic providers.
