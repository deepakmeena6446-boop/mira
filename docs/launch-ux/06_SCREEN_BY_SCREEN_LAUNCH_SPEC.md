# 06 — Screen-by-Screen Launch Spec

**The UX implementation blueprint.** Every screen here exists today (01 §2). **No new routes or screens.** A few new *components* are introduced (`MiraPulse`, `MiraLine`, `JourneyCapsule`, `HelpCluster`, `AdaptiveSlot`). They are presentation only.

**Authority:** 02 (rules C-x.y), 04 (visual tokens), 05 (motion), 07 (adaptive logic).

---

## 1. Global rules applied to every screen

1. **One filled accent button per screen state** (C-11.1). Emergency's ink fill is exempt.
2. **Decision order** (C-11.2):
   1. Mira line (conclusion);
   2. primary action;
   3. what it depends on;
   4. evidence;
   5. secondary actions;
   6. fine print.
3. **Help anchors** (`HelpCluster` = [I feel unsafe] [Emergency]) sit at a fixed top-right position on Home and Trip. They are never covered (C-10.2). They appear **exactly once per screen** (Playwright strict-mode contract).
4. **Honesty sentences keep their truth.** Long ones become a short line plus a "Details" disclosure. The *full existing sentence* moves into the disclosure verbatim unless 09 §2 lists a replacement string. Never delete a qualifier.
5. **E2E copy contracts** (09 §2) are preserved, or changed only in the same commit as the updated test, with the reason recorded.
6. **Emoji** are removed from system UI (04 §8). User-chosen saved-place emoji stay as user data.
7. **Tab bar:** docked. It is hidden on an open journey (`/trip` with state `active`/`missed`).
8. **Bottom padding** uses `--tabbar-h`. No content hides under the tab bar at any detent.
9. **Four states** (unknown / empty / failed / unavailable) keep distinct copy (04 §25).

## 2. Shared components (new or refined)

| Component | File (proposed) | Contract |
|---|---|---|
| `MiraPulse` | `components/app/MiraPulse.tsx` | `size`, `state: observing \| thinking \| noticed \| attention \| with-you`, `scout?: boolean`. `aria-hidden`. The state is also conveyed in adjacent text. |
| `MiraLine` | `components/app/MiraLine.tsx` | `{ text, state, action?: {label, onClick \| href, variant: "quiet" \| "primary"}, detail?: ReactNode }`. Rendered as `<p>` plus an optional button and an optional `<details>`. The text comes from `domain/mira-line.ts` (07 §A.2). |
| `HelpCluster` | `components/app/HelpCluster.tsx` | Renders the I feel unsafe button and `<EmergencyPill/>` in one row. The props pass through to the existing sheets. |
| `JourneyCapsule` | `components/app/JourneyCapsule.tsx` | Compact card for an open journey: Pulse `with-you`/`attention`, "On your way to {dest}", "ETA {time} · {who can see}". Links to `/trip`. Replaces the gradient card on Home and is also used on Trips. |
| `AdaptiveSlot` | inside `HomeScreen` | Renders ≤ 1 item chosen by `pickHomeSlot()` (07 §B.3). |
| `SectionLabel` | `components/app/Section.tsx` (REFINE) | Footnote sentence-case label. Replaces the ad-hoc uppercase labels. |

---

## 3. Screens

Each screen uses the same template:
- **Intent**, then **Mira's job**, then **Information priority**, then **Must remain**.
- **Primary**, then **Secondary**, then **Disappears / merges**.
- **Flow**, then **Components**.
- **Mobile**, then **Desktop**.
- **Empty**, then **Loading**, then **Error**.
- **Personalised**, then **Contributor-heavy**, then **Journey-heavy**.
- **A11y**, then **Acceptance**.

### 3.1 Welcome (`/welcome`)
- **Intent:** "What is this, and can I trust it with my location?"
- **Mira's job:** State the promise in one breath, show both ways to use Mira, and ask for location with a reason.
- **Information priority:**
  1. The promise.
  2. Three one-line capabilities (the way / your people / help), plus one line on contributing.
  3. Privacy line.
  4. Continue.
- **Must remain:**
  - two steps;
  - explain-then-ask location;
  - Skip;
  - sign-in entry;
  - `mira.welcomed` flag;
  - `heading "With you until you arrive."` and the buttons "Use my location" and "Start with MIRA"/its replacement (09 §2).
- **Primary:** **Continue** (step 1) and **Use my location** (step 2).
- **Secondary:** "Already use Mira? Sign in" and Skip.
- **Disappears / merges:**
  - the orb (replaced by a 40 px Pulse mark);
  - the emoji feature cards (replaced by three unboxed icon rows);
  - the "Mira, your companion…" paragraph (condensed into one line).
- **Flow:**
  - **Step 1:**
    - Pulse mark.
    - "With you until you arrive." (`display`).
    - One sentence: "Mira helps you understand the way, lets the people you choose follow until you arrive, and keeps help one tap away."
    - Three rows:
      - `route` "Before you go: the way, its lighting and places with staff on it."
      - `eye` "On the way: your people follow a live link that switches off when you arrive."
      - `phone` "If something feels wrong: help nearby, your people, and the local emergency number."
    - One contribution row: `lamp` "See a broken streetlight or a closed entrance? Tell Mira in two taps. It helps everyone."
    - Footnote: "Designed around the realities women face moving through cities. Useful to anyone. Mira keeps no history of where you've been."
    - **Continue**.
  - **Step 2:** unchanged content, restyled.
- **Components:** `MiraPulse`, `Icon`, `Button primary`.
- **Mobile:** the CTA stays sticky (KEEP). Step 1 fits in 1.3 screens on 390×844 (today it's 1.8).
- **Desktop:** a centred 480 px column on canvas.
- **Empty / Loading / Error:** "Use my location" `busy` "Asking…" (KEEP). Denied or unavailable goes to Home, which explains (KEEP).
- **Personalised / Contributor / Journey:** not applicable (first run).
- **A11y:** the step indicator is an `aria-label` "Step 1 of 2" (KEEP). The heading is `h1` per step.
- **Acceptance:**
  - (a) No gradient, orb or emoji.
  - (b) The contribution line is present.
  - (c) The step-1 CTA is visible without scrolling at 360×740.
  - (d) The E2E onboarding helper passes (`newUser()` in `tests/e2e/helpers.ts`) with the updated button name.
  - (e) "Start with MIRA" is not used for "continue" (C-17.4). The E2E helper and specs are updated in the same commit.

### 3.2 Home (`/`): default state (no destination)
- **Intent:** "Where am I going / what's going on here / I need help / I want to tell Mira something."
- **Mira's job:** Offer the single most useful next thing for *this person, now*, and make every intent one tap away.
- **Information priority:**
  1. Mira line (context plus a suggestion).
  2. Where are you going (search plus saved chips).
  3. Circle status (one line).
  4. Secondary actions (Help Points near me · Report · Ask Mira; adaptive order).
  5. Around you.
  6. Safety updates.
  7. Install.
- **Must remain:** everything in 01 §4.2 "must be preserved". In particular:
  - heading `"Where are you going?"` (exact);
  - `button /Search a place or address/`;
  - saved-place chips as buttons named with emoji plus label (`"🏠 Home"`; the chip keeps the user's emoji text);
  - the `link "Emergency call, 112"`;
  - the `button "I feel unsafe"`;
  - Help Points near me;
  - long-press;
  - pin drop;
  - bell;
  - avatar;
  - Sign in.
- **Primary:** the search field plus chips. If the Mira line carries an action (for example "Go with Mira" on a habit), *that* is the one filled button and the chips stay outlined.
- **Secondary:** the secondary actions row, bell, locate.
- **Disappears / merges:**
  - The greeting emoji (🌙 ☀️).
  - The explanatory sentence under the title. It becomes the signed-out/cold-start Mira line.
  - The multi-sentence Circle line becomes one line plus "Details".
  - The nudge card becomes the Mira line / adaptive slot.
  - The gradient active-trip card becomes `JourneyCapsule`.
- **Top chrome** (fixed, `.glass`, one card):
  - Left: `callout 600` "Good evening, Asha" / `footnote` "10:44 pm · Banarsi Das Estate" (or "Finding you…" / "Location off").
  - Right: bell (badge) and avatar, or **Sign in** (secondary button, *not* accent-filled, so the Mira line's action can be the one filled button).
  - Below it, right-aligned: **HelpCluster**.
  - Location-off / unavailable banner below the cluster (KEEP the copy). Pin-mode bar (KEEP). Spot card (KEEP; restyled).
- **Sheet at peek (`max(40dvh, 300px)`)**, in order:
  1. **Mira line** (07 §A.2 rule table).
  2. `h2` "Where are you going?" (`title-2`). Search field. Saved chips (horizontal scroll, "+ Add" last).
  3. **Circle line**, one line, truthful:
     - signed-out: "When you start, you can send a live link to anyone you choose."
     - with Circle: "{names} can follow when you share."
     - WhatsApp only: "{names} are one tap away on WhatsApp."
     - no Circle: "Only people you send your link to can follow. [Add someone]"

     A "Details" disclosure holds today's full `circleStartLine()` text.
  4. **Secondary actions row:** three equal buttons (icon over label, 64 px tall, `surface` with a `line` border) in adaptive order (07 §B.3). Labels:
     - "Help near me" (accessible name **"Help Points near me"**, a contract);
     - "Report";
     - "Ask Mira".
- **Half / full:**
  5. "Around you" (max 5 rows).
  6. Safety updates (KEEP the component; restyle).
  7. Install card (only if not dismissed, and only when the adaptive slot didn't already show it).
- **Map pins:** before a destination, at most **8** nearby places, and only those listed in "Around you" plus Help Points ≤ 600 m. Today it's up to 20.
- **Flow:**
  - Tap search → overlay (3.3).
  - Tap a chip → route sheet (3.4).
  - Tap a Mira line action → its action (start / open check / open Circle).
  - Long-press the map → spot card → Report here (Report with the spot) or Go here (route sheet).
- **Components:** `WorldMap`, `BottomSheet`, `MiraLine`, `HelpCluster`, `Chip`, `JourneyCapsule`, `SafetyUpdatesSection`, `InstallCard`, `SearchOverlay`, `UnsafeSheet`, `HelpNearSheet`, `SignInSheet`.
- **Mobile:**
  - `--chrome-top` is measured from the chrome card plus the cluster.
  - The full detent never exceeds `100dvh − --chrome-top`.
  - The locate button follows the sheet top.
- **Desktop (≥1024):** side panel (04 §29). The chrome and cluster sit at the top of the panel, and the map fills the right.
- **Empty:** no nearby places gives "No detailed places for this area yet. Search or drop a pin." (KEEP).
- **Loading:**
  - Location asking: "Finding you…" in the chrome.
  - The Mira line shows `thinking` only if it waits on data (habit or checks). Otherwise it shows its default immediately.
- **Error:**
  - Nearby failed: "Couldn't load what's around you. Check your connection." (KEEP).
  - Offline: the one offline line (04 §25).
- **Personalised states (Mira line / slot)** follow 07 §B.3. Examples:
  - **Returning, journey-heavy, 21:58 near their usual hour:** "Heading to Home? You usually walk there around this time." [Go with Mira] *(habit, ≥3 journeys)*.
  - **Contributor-heavy, check ready:** "One quick question about Apollo Pharmacy from your walk." [Answer]. The secondary row order is Report · Help near me · Ask Mira.
  - **Contributor-heavy, answer confirmed since last visit:** "Someone else confirmed what you told Mira about Apollo Pharmacy." [See impact].
  - **Cold start, signed in, no Home:** "Save Home once, and the walk back is one tap." [Find it].
  - **Signed out:** "Search anywhere to see the way, its lighting and places with staff on it. No account needed."
  - **Active journey:** `JourneyCapsule` replaces the Mira line (it is always first and never adaptive).
- **A11y:**
  - Sheet `aria-label` "Where are you going?" (KEEP).
  - The Mira line is plain text, not a live region, except that a *changed* line is announced politely once.
  - The secondary buttons have full accessible names.
- **Acceptance:**
  1. At peek on 390×844, signed-in with Home saved: the Mira line, search, chips and Circle line are visible without scrolling.
  2. At **every** detent, the I feel unsafe and Emergency controls are visible and tappable (bounding boxes don't intersect the sheet).
  3. Exactly one accent-filled button is visible.
  4. No emoji outside user chips.
  5. The secondary row always contains Help Points near me, Report and Ask Mira (order may vary).
  6. The adaptive slot shows ≤ 1 item.
  7. With OS reduced motion, no animation.
  8. E2E `a-share-trip`, `f-mobile-extras` and `h-375-evidence` pass.

### 3.3 Search overlay
- **Intent:** find a place fast.
- **Mira's job:** saved places first, then results, then a pin-drop escape.
- **Must remain:**
  - dialog `"Where to?"`;
  - placeholder "Search a place or address";
  - saved section;
  - results;
  - "Choose on the map";
  - the honest offline state.
- **Primary:** the input (autofocused).
- **Disappears / merges:** the companion glow background becomes canvas. Emoji become kind icons.
- **Flow:** type → results (debounced, KEEP) → pick → route sheet.
- **Mobile:** full screen with the input at the top. Motion per 05 §4.20.
- **Desktop:** inside the side panel (no full-screen takeover).
- **Empty:** "Type a place, an address or a landmark."
- **Loading:** a quiet 3-row skeleton after 300 ms.
- **Error:** "Couldn't search right now. Check your connection." plus retry.
- **Personalised:** saved places ordered by habit strength for the current hour (07 §B.2), then the rest. Launch-safe (client-side from `/api/me/habits`).
- **A11y:** results are a list of buttons. The input has a visible label for screen readers ("Search a place or address").
- **Acceptance:** 09 search tests. Offline shows the error string, not "no results".

### 3.4 Route sheet: destination → context → start (Home, `dest` set)
- **Intent:** "Should I go this way, and go now?"
- **Mira's job:** Summarise the way in one line, let the user start in one tap, and keep the evidence a tap away.
- **Information priority:**
  1. Destination and time.
  2. **Mira line summary.**
  3. Mode.
  4. Alternatives (if any).
  5. **Lighting evidence block (before Start, a rule).**
  6. **Go with Mira** plus share choice plus a one-line disclosure.
  7. Help Points along the way.
  8. Community notes.
  9. Safety updates near there.
  10. Save this place.
- **Must remain:**
  - every evidence state;
  - alternatives;
  - mode switch and ETA chips;
  - Share with / Just me radio;
  - the pre-start disclosure (in a disclosure if long);
  - Help Point list default-open;
  - notes with "Why am I seeing this?";
  - Safety updates;
  - Save chips;
  - `region "Lighting evidence before starting"`;
  - `region "Help Points along this route"`;
  - `radio /Share with …/`;
  - `button /Start with MIRA/` (renamed with its test, see 09 §2);
  - "Sources and freshness";
  - "The driving time from here is not known.";
  - `/expected in 45 min/`.
- **Primary:** **Go with Mira** (accent, lg). Disabled with a stated reason when there's no location ("Turn on location to start from here").
- **Secondary:** the mode switch, alternatives, "Just me", and Save chips (outlined, **below** the Help Points).
- **Disappears / merges:**
  - `RouteContextLines` (the "Lighting · …" / "Help · …" rows) merge into the Mira line.
  - The lighting box keeps the bar plus the "Sources and freshness" disclosure, and "Why not known?" moves inside that disclosure.
  - The destination emoji tile becomes a kind icon.
- **Mira line templates** (walk, deterministic, 07 §A.2): "{16 min} walk, arrive around {11:00 pm}." plus a lighting clause plus a help clause.
  - **Lighting clause:**
    - "Most of it is mapped as lit."
    - "About half is mapped as lit."
    - "Little of it is mapped as lit."
    - "Lighting on this way isn't mapped."
    - "Couldn't check lighting right now."
  - **Help clause:**
    - "{n} places with staff on the way, first in {m} min."
    - "No Help Points found on the way."
    - "Couldn't check Help Points."
  - **With alternatives:** "{A: 16 min, mostly mapped as lit}. Another way adds {4} min and is {better/less} mapped." The trade-off is stated, never a recommendation verdict.
  - **Ride / transit:** "{By cab} about {22 min}. Mira expects you by {11:20 pm}." / "Transit times aren't known. Choose when you expect to arrive."
  - **Approximate:** "This is a straight-line estimate. There's no street map here, so lighting and Help Points aren't known."
- **Flow:** pick destination → the sheet goes to `half` → the Mira line is `thinking` → the summary is `noticed` → (optionally) change mode or alternative → **Go with Mira** → `/trip`.
- **Components:** `MiraLine`, `RouteOptions` (restyled as compact rows: time, lighting phrase, "{n} Help Points"; selected has an accent border), `LightingSummary compact`, `HelpPointList`, `SafetyUpdatesSection`, `Chip`.
- **Mobile:** at `half` on 390×844 the header, Mira line, mode, lighting block and **Go with Mira** are all visible without scrolling (today Start can fall below the fold).
- **Desktop:** side panel. The map shows all alternatives, tappable.
- **Empty:** no Help Points → the help clause "No Help Points found on the way." (empty ≠ failed).
- **Loading:** "Finding the way…" (Mira line `thinking`). **Go with Mira** is enabled for a walk while the route loads (as today, a walk can start without a route). It is disabled for ride/transit while loading (KEEP).
- **Error:** route failed → "Couldn't get the walking time. You can still go with Mira." (KEEP the meaning).
- **Personalised:**
  - Journey-heavy: if the destination is a saved place with a habit, the share radio defaults to last time's people (existing `tripStartExtras`), and the Mira line appends "Like last time, Priya will be able to follow."
  - Travel preference sets the default mode (existing).
- **Contributor-heavy:** no change (the decision screen stays stable).
- **A11y:**
  - The mode switch is a `radiogroup` (KEEP).
  - Alternatives are radios with full text names.
  - The lighting bar has a text equivalent (KEEP).
- **Acceptance:**
  1. The lighting fact appears **before** the Go button in DOM order and visually.
  2. No second lighting line exists.
  3. All four evidence states render distinct text (fixtures in 09 §5).
  4. One filled button.
  5. E2E `a`, `g` and `h` pass.
  6. The Mira line never contains verdict words (unit test through `companion-output` guard).

### 3.5 Journey: active (`/trip`, state `active` / `missed`)
- **Intent:** "Get there; know I'm covered; act fast if needed."
- **Mira's job:** Show who can see you and until when, the ETA, the next thing to do, and help ahead. Be quiet otherwise.
- **Information priority:**
  1. Status banners (only when something needs attention).
  2. **Mira line status** (who can see / what happens if you don't arrive, short).
  3. ETA.
  4. **The one next action.**
  5. The other journey actions.
  6. Next Help Point.
  7. Details (awake note, full alert explanation, End).
- **Must remain** (01 §4.5): every status banner and its copy; I'm here; Send my live link; WhatsApp Send-to buttons with "Opened WhatsApp for {name} ✓"; +10 min (once); I feel unsafe; Emergency; End trip without arriving (with confirm); Nearest Help Point with Directions; the check-requested line; the awake note; the upload and throttling behaviour. Strings (09 §2):
  - "Sharing live";
  - /I'm here/;
  - /Send my live link/;
  - "End trip without arriving";
  - "End trip";
  - /Nearest Help Point/;
  - "Are you okay?";
  - /Nobody is alerted automatically/;
  - /couldn't confirm the message went out/;
  - /Couldn.t email your link/;
  - "Expected by" (the shared view).
- **Immersive mode:** **the tab bar is hidden** while the journey is open. The header back button leads to `/trips` (KEEP).
- **Top chrome:** back, then Pulse (`with-you` / `attention`), then `callout 600` "Walking to Kamla Nagar" / `footnote` "Sharing live" or "Only you" (the contract string "Sharing live" is kept when contacts were notified). Below it, right-aligned: **HelpCluster** (I feel unsafe moves here from the sheet grid, a stable anchor matching Home).
- **Sheet (`half` default):**
  1. Banners (warm), if any.
  2. **Mira line:**
     - "Priya can see where you are until you arrive."
     - or "Only people you send your link to can follow."

     Plus a "Details" disclosure with today's full alert sentence (email-alert truth).
  3. ETA block:
     - label "Expected in" (`footnote`);
     - value `display` tabular ("49 min");
     - line "ETA 11:34 pm, with time to spare · 1.8 km to go".
  4. **One next action (filled), by rule:**
     - If the journey has WhatsApp contacts not yet opened on this device, the first unopened contact becomes **"Send to {name}"** (filled). Other contacts are outlined "Send to …" buttons.
     - Else if nobody is following (`sharedOk` is empty and there are no WhatsApp contacts), **"Send my live link"** (filled).
     - Else **"I'm here"** (filled).
  5. **Journey actions** (outlined, a 2-column grid): **I'm here** (when not primary; full width), **Send my live link** (always present as a button, as secondary when not primary), **+10 min**.
  6. Next Help Point row (KEEP; restyled; glyph icon).
  7. `details` "About this journey":
     - the awake note;
     - "Your planned route stays on this phone · n Help Points along it";
     - the full Circle/alert explanation;
     - **End trip without arriving** (danger, confirm inline, KEEP).
- **Map:** follow mode (KEEP). Presence halo (04 §12). ≤ 6 Help Point pins (KEEP).
- **Flow:**
  - Start → send link(s) → walk → auto-arrive or I'm here → arrived state (3.6).
  - Missed → the banner "Are you okay? Tap 'I'm here' if you've arrived." → I'm here primary.
- **Components:** `WorldMap`, `BottomSheet`, `MiraLine`, `HelpCluster`, `Button`, `UnsafeSheet`.
- **Mobile:** at `half` on 390×844, the Mira line, ETA and next action are visible, and the second action row is visible at the fold. At `peek`, the Mira line, ETA and next action.
- **Desktop:** side panel. The map follows within the right area.
- **Empty:** not applicable.
- **Loading:** ETA "…" until the clock hydrates (KEEP).
- **Error:** the status banners (KEEP all four: worker down, GPS denied/lost, upload failing, email failed). The Pulse goes to `attention` whenever any is present.
- **Personalised:** the habit journey's Mira line appends "Your usual walk home" (from the habit match, optional).
- **A11y:**
  - Banners use `role=alert/status` (KEEP).
  - The ETA is announced on change at most once per 5 minutes (a polite live region). Today there is none, and that stays acceptable.
  - The halo is `aria-hidden`.
- **Acceptance:**
  1. The tab bar is absent while the journey is open and present once it has closed.
  2. Exactly one filled accent button in each rule branch (three fixtures).
  3. The Emergency and I feel unsafe controls are visible at all detents.
  4. Every banner string is unchanged.
  5. E2E `a`, `b` and `j` (WhatsApp) pass.
  6. With reduced motion, the halo is static.
  7. The rAF breath loop stops when hidden (a unit/integration check on the hook).

### 3.6 Journey closed / arrived (`/trip`, closed)
- **Intent:** "Done. Did it go through? Anything to add?"
- **Mira's job:** Confirm honestly, ask at most one question, then get out of the way.
- **Must remain:**
  - the arrived/ended/closed/sharing-stopped copy logic;
  - `AfterArrival` (the one question, or preparing, or nothing);
  - the deletion line;
  - the report link;
  - "Your trips";
  - the strings "You made it", "Journey ended", "Was the way lit?" and /Wa  the way lit\?|Nothing needed from you|Preparing|check later in Contribute/.
- **Primary:** the question's answer chips if a question exists. Otherwise **Done** (goes Home; replaces "Back home").
- **Disappears / merges:** the 84 px orb (replaced by a check-circle icon drawn once), 🎉, and the gradient.
- **Layout:**
  - Check icon.
  - "You made it." (`title-1`). The string "You made it" is kept.
  - One line: "Priya can see you arrived." or "Your live link now just says you arrived."
  - The question card.
  - Footnote: the deletion line.
  - Quiet link: "Something happened on the way? Report it privately." This opens Report in incident-first order (3.13).
  - **Done**.
  - Quiet "Your trips".
- **Tab bar:** visible again (the journey is closed).
- **Personalised:** if the journey was to a saved place and habits are on, a footnote reads "Mira will remember this walk home for next time. [What Mira remembers]". It's shown the first 3 times only (a device flag).
- **A11y:** the heading is `h1`. The question has a `radiogroup`.
- **Acceptance:** one filled button. No emoji. E2E `a`, `g` pass.

### 3.7 I feel unsafe (modal sheet, Home and Trip)
- **Intent:** "Something feels wrong. Help me act now."
- **Mira's job:** Put the next best actions in order, instantly, with no AI and no waiting.
- **Content and order: FROZEN** (C-16.2). Change nothing in order or actions:
  1. Go to a Help Point (plus 2 more).
  2. Share / Tell my people now.
  3. Call someone.
  4. Emergency.
  5. Helpline(s).
  6. Your location in words.
  7. Talk to Mira.
  8. I'm okay now.
- **Must remain:** `dialog "Right now"`, the buttons /Go to a Help Point/, /Tell my people now/, "I'm okay now", and every result string.
- **Visual changes only:**
  - The title row "Right now" plus a `footnote` "Near {area} · {time}".
  - **A calm lead line** (new, deterministic): "{Nearest Help Point} is about {5} min away." When unknown: "Here's what you can do right now."
  - Help Point highlight: `surface` with 1 px `line-strong` (**not** accent-soft), a glyph icon, and "Walk there" / "Show" as a quiet button.
  - The share/tell card is `surface` bordered.
  - Emergency is the `ink` block (KEEP).
  - The helpline row is `sunken`.
  - Location in words is `sunken`, with the Copy quiet button.
  - "I'm okay now" becomes a **secondary full-width button at the end** (not a text link), so it's easy to find.
- **Motion:** 05 §4.12. Ambient motion elsewhere stops.
- **Mobile:** the sheet opens to its content height (max 92dvh) and scrolls. "Go to a Help Point", "Tell my people now" and "Emergency" are visible without scrolling on 390×844.
- **Desktop:** a centred 480 px dialog.
- **Empty / Error:** Help Points none, failed or partial copy (KEEP the distinct strings).
- **A11y:** focus moves to the "Right now" heading. Escape and back close it. The order matches the visual order.
- **Acceptance:** DOM action order identical to today (a snapshot test on the button names). E2E `g-unsafe-and-contribution` and `a` pass.

### 3.8 Emergency options sheet
- **Must remain:** the logic, the cited numbers, qualifications, the status note, "Emergency call options" (`dialog`), and the tel: links.
- **Visual:** `ink` number rows (KEEP), `radius-card`, and the footnote note.
- **Acceptance:** E2E contract strings. The fallback sheet appears when a profile lacks an all-service number (`e`/`g` specs).

### 3.9 Help Points near me (modal sheet)
- **Must remain:** `dialog "Help Points near you"`, the ranking, hours honesty, filters, retry, and "Turn on location to see Help Points near you."
- **Visual:** glyph icons, 56 px rows, and hours on a second line without truncation (wrap to 2 lines).
- **Acceptance:** failed ≠ empty strings (UX-02).

### 3.10 Mira (`/mira`)
- **Intent:** "Ask Mira something open-ended, or get Mira to set something up."
- **Mira's job:** Answer briefly from evidence and propose one action as a card.
- **Must remain:**
  - all card types;
  - tap-to-act;
  - the sign-in wall with its reason;
  - `role="log"` plus a single announce;
  - placeholder "Message Mira…";
  - `button "Send"`;
  - the failure text;
  - the E2E strings /I'm not an emergency service/, /it's late/i and /Nearby pharmacies/i.
- **Primary:** the composer.
- **Secondary:** suggestion chips, card buttons.
- **Disappears / merges:**
  - the orb avatar on every message (one Pulse per Mira turn);
  - the gradient trip-card button (→ `primary`);
  - the subtitle jargon.
- **Layout:**
  - Header: Pulse (24, `observing` / `thinking` while streaming), "Mira", subtitle "Ask about places, your journey, or what Mira knows here."
  - Log: messages per 04 §22.
  - Composer docked above the tab bar, with chips above it.
- **Empty (signed in):** the intro paragraph per daypart (KEEP the text, restyled) plus the chips.
- **Signed out:** the SignedOutIntro (restyled). The example chips open sign-in (KEEP).
- **Loading:** the Pulse `thinking` plus the typing dots until the first token.
- **Error:** the `warm` failed message (KEEP).
- **Personalised:** chip ordering by usage mode (07 §B.3):
  - journey-heavy: "Take me home", "Find Help Points nearby", …
  - contributor-heavy: "Report a broken streetlight", "What's open nearby?", …

  Both apply daypart rules (KEEP the night list first when it's night).
- **Desktop:** the conversation column is 640 px centred. The composer is docked within it.
- **A11y:** KEEP the current pattern. Cards have headings.
- **Acceptance:** E2E `c-mira` passes. One filled button per card. No orb.

### 3.11 Trips (`/trips`)
- **Intent:** "Get back to my journey / see what just finished."
- **Must remain:** the route, the active card (becomes `JourneyCapsule` large), "Earlier today", the retention statement, and the signed-out component.
- **Visual:** a title-1 "Trips" with no orb. The empty state per 04 §23.
- **Option (NOT in plan): fold Trips into Home** (4 tabs). `REQUIRES_OWNER_APPROVAL`, because it changes the locked Day-0 navigation. Default: **keep the Trips tab**.
- **Acceptance:** E2E `a` (trips view) passes.

### 3.12 Contribute (`/contribute`)
- **Intent (Mira for Everyone):** "I noticed something. Let me tell Mira quickly," or "Did my help count?"
- **Mira's job:** Make reporting instant, surface the one pending question, and show verified impact honestly.
- **Information priority:**
  1. **Report something** (category grid inline).
  2. Mira Checks (if any, or a pending line).
  3. Correct a place.
  4. Your impact plus Mira Scout.
- **Must remain:**
  - all sections and rules;
  - the durable gate for checks and corrections;
  - the verified-only impact copy;
  - Local Steward logic (shown as Mira Scout);
  - "No points, streaks or leaderboards…";
  - the "reports are never counted" line;
  - the pending-check status;
  - the E2E strings.
- **Layout:**
  - Header: "Contribute" (`title-1`) plus "Help Mira understand your streets. What you send is private."
  - **Report something:**
    - Two groups of three tiles: "On the street" first, then "Something that happened". Each tile links to `/report?c={category}&from=contribute`. Deep-linking to the form means **2 taps** from the Contribute tab root to a sent report.
    - "Something else" (quiet).
    - Footnote: "Reports stay private and may be reviewed. They're never counted or rewarded." (the existing meaning, shortened; the full `REPORT_PRIVACY_LINE` stays in the form).
  - **Mira Checks:** check cards / "A journey question is still being prepared." / "After a journey, Mira may ask one quick question about something you passed."
  - **Correct a place:** "Something Mira shows about a place is wrong? Find it and choose what's wrong." [Find a place].
  - **Durable gate (non-durable accounts):** checks and corrections render **one** shared line in place of their bodies: "Checks and corrections need a Google or email sign-in, so each person counts once." [Keep your account → `/me#account`]. Report stays fully usable.
  - **Your impact:**
    - the impact line (or "Nothing confirmed yet.");
    - pending, differed and archived lines (KEEP);
    - the **Mira Scout** block: either "Mira Scout" with the scout mark and "Others keep confirming what you tell Mira, in different places and on different days. Your answers still need someone else to agree, like everyone's.", or a "What it takes" disclosure with the existing `needs` list, headed "Mira Scout".
    - Footnote: the no-points line.
- **Signed out:** the same layout. The Report grid is live (anonymous). Checks, corrections and impact collapse into one line: "Sign in to answer Mira Checks, correct places and see what you've helped confirm." [Sign in]. **REPLACE** today's orb hero.
- **Recognition (one time):** when steward goes from false to true (device-compared), show a card at the top: "You're a Mira Scout. Others keep confirming what you tell Mira." [What this means]. Dismissible, and it never returns.
- **Mobile:** the report grid is visible without scrolling on 390×844.
- **Desktop:** a two-column layout (report grid left, the rest right) inside a 960 px container, with the side rail.
- **Loading:** server-rendered (KEEP). The CheckCard answer is `busy`.
- **Error:** corrections "Not sent. Check your connection and try again." (KEEP).
- **Personalised / contributor-heavy:** if a check is pending, the Checks section moves **above** Report *only for that visit* (a clear, time-bound reason). Report stays in the first viewport either way.
- **Journey-heavy:** default order.
- **A11y:** section headings are `h2`. Tiles are links with names = label plus hint.
- **Acceptance:**
  1. From the Contribute tab: tap a street tile, then "Send privately", and the report is sent (2 taps plus the send), anonymous or signed in.
  2. A non-durable account sees the gate line once, not three times.
  3. No "Local Steward" string remains in the UI. **"Mira Scout" appears instead, with the same criteria.**
  4. E2E `d-reports` and `g` pass.

### 3.13 Report (`/report`)
- **Intent:** "Tell Mira what I noticed or what happened, privately and fast."
- **Must remain:**
  - the taxonomy and categories;
  - `c` preset;
  - pending spot from long-press (in memory);
  - location states;
  - When chips;
  - involvement toggle;
  - note with PII detection;
  - idempotency;
  - honest privacy lines;
  - the E2E strings: /Dark or broken street/, "Send privately", /Thank you/, /^Reporting /, `label /Anything to add/`, /This looks like it includes a/, /If you're in danger right now/.
- **Category screen:**
  - `h1` "What did you notice?"
  - Footnote: "Private. Only a rough area is kept."
  - **Two groups** (04 §20). **Order by entry point** (a new query param `from`, UI-only, no data):

    | Entry | First group |
    |---|---|
    | `from=journey` (arrival screen), `from=unsafe`, `from=mira` (report card), or `c` is an incident category | "Something that happened" |
    | `from=contribute`, `from=map` (long-press), `from=home`, `from=me`, or none | "On the street" |

  - Tile labels (the existing labels, KEEP): Dark or broken street · Transport problem · Something good | Harassment · Being followed · Unwanted touch. The hints come from `CATEGORY_HINT`.
  - "Something else" is a quiet button.
  - The long-press tip stays (footnote).
- **Form:** unchanged fields. Restyle:
  - One card for "Where and when" (location line plus change action, When chips, involvement segmented).
  - One card for the note.
  - **Send privately** (primary).
  - The privacy footnote.
- **Thanks:**
  - The check icon draws.
  - "Thank you." (`title-1`; keeps /Thank you/, but drops the 💜).
  - The **close-the-loop line** (new copy, truthful to the pipeline): "It's private. If others report something similar here, it can become a community note. Mira never shows one person's report."
  - "If you're in danger right now, call {number}." (KEEP).
  - **Done** (primary, back to where they came from: `router.back()` with a Home fallback).
  - "Report something else" (secondary).
- **Mobile:** the category grid is fully visible without scrolling on 390×844.
- **A11y:** tiles are buttons with label plus hint. The PII warning is linked to the textarea.
- **Acceptance:** E2E `d-reports` passes. No emoji or gradients. Group order follows the table (unit test on the ordering function).

### 3.14 Me (`/me`)
- **Intent:** "Set up my people and places; see and control what Mira knows."
- **Must remain:** every control, the anchors `#places #account #help #travel #remembers #app #privacy`, and the strings "+ Add", `label "Name"`, "Saved as Home".
- **Grouped layout (order):**
  1. **Header:** avatar, name, "{n} places · {n} in your Circle" (the Circle link KEEP).
  2. **Your people and places:** Circle row; Places section (KEEP content).
  3. **Contributing:** Impact row (with the "Mira Scout" tag when earned); "Report something" row (**moved** from Privacy).
  4. **How Mira works for you:**
     - What Mira remembers: the habits switch and list, Forget all, **plus the new "Reset how Mira arranges Home" row** (07 §B.5), which clears the device usage signal.
     - Travel preferences.
     - Help Point types (the switch grid restyled as a 2-column list of switches).
  5. **Account and device:**
     - Your account: collapsed into a row "Keep your account on other phones" that expands into today's form when not durable. When durable it shows "Signed in with Google/email · {hint}".
     - Notifications.
     - Appearance.
     - Install.
  6. **Privacy:** How Mira handles your data, Clear my chat with Mira, Sign out, Delete my account (KEEP the confirmations).
- **Signed out:** "Make Mira yours" (title-1). One sentence. **Get started** (primary). No orb. The E2E contract is `button "Get started"`.
- **Acceptance:** E2E `a`, `e` and `j` pass. All anchors resolve. Section count ≤ 6 groups.

### 3.15 Circle (`/circle`)
- **Must remain:** WhatsApp-first add, email optional, statuses, removal, and the strings "Trusted", "WhatsApp +91 •••• ••3210", /Priya saved/, /send Priya your live link on WhatsApp in one tap/.
- **Visual:**
  - Explanatory paragraphs become one line ("When you start a journey, send them your live link on WhatsApp in one tap. Mira opens WhatsApp; you press Send.") plus a "How Circle works" disclosure with today's full text.
  - The email-unavailable note stays (a footnote).
- **Acceptance:** E2E `j` passes.

### 3.16 Inbox (`/inbox`)
- **Visual:** emoji become glyph icons (`check-circle` accepted, `timer` missed, `wifi-off` paused, `pulse` welcome). Empty state per 04 §23.
- **Acceptance:** the "Welcome to MIRA, Kiran" string. If the brand casing changes (09 §2), this is a server string (`src/app/api/auth/demo/route.ts`), so its test is updated in the same commit.

### 3.17 Contact live view (`/t/[token]`)
- **Intent (contact):** "Is she OK and on her way? What should I do if worried?"
- **Must remain:** the data shown (name, mode, destination, ETA with tz, updated-ago), the arrived and ended states, the link expiry, "Expected by", and /they'll see your last spot/.
- **Visual:**
  - Status chip ("On the way" / "Arrived"; accent-soft, no uppercase).
  - Name and destination (`title-2`).
  - ETA line.
  - Freshness line.
  - **New guidance line (copy only):** "If you're worried, call {name} first. In an emergency, call your local emergency number."
  - The privacy footer.
  - After the trip: "{name} arrived." with a check (no 🎉) and "Try Mira" (quiet).
- **A11y:** the freshness line is included in the heading region.
- **Acceptance:** E2E `a`/`b` viewer assertions pass. No emoji.

### 3.18 Sign-in sheet
- **Must remain:** the first-name path, 18+ attestation, email and Google paths, the placeholder "Your first name", the checkbox /I confirm I.m 18 or older/, and `button "Continue"`.
- **Visual:**
  - The Pulse (24) replaces the orb.
  - Title per reason (KEEP).
  - Continue is `primary`.
  - The "account lives in this browser" footnote (KEEP).
- **Acceptance:** E2E `newUser()` passes.

### 3.19 Privacy, Terms
- Typography only: `max-w-prose`, `title-1`, `h2` sections, body 16/26.
- **Add** a "What Mira keeps on this phone" subsection listing the new device-local usage signal (07 §B.1) (C-9.4).
- **Acceptance:** the privacy allowlist tests (`tests/integration`) are unaffected. `e-privacy` passes.

### 3.20 Long-press spot card (Home)
- **Must remain:** the ghost-tap guard, reverse-geocoded name, "Report here" (sets the pending spot, goes to `/report?from=map`), "Go here", and Close.
- **Visual:** `surface` card below the chrome. A pin glyph. Two outlined buttons: "Report here" (icon `flag`) and "Go here" (icon `route`). No emoji, no tinted fills.
- **Acceptance:** E2E `f-mobile-extras` passes (it reports via long-press).

---

## 4. Cross-screen acceptance summary
| # | Criterion | Screens |
|---|---|---|
| X1 | Exactly one accent-filled button visible per state | all |
| X2 | Help anchors never covered, once per screen | Home, Trip |
| X3 | No emoji in system UI; the user's chip emoji allowed | all |
| X4 | No gradient, glass-on-sheet, orb or violet | all |
| X5 | Every E2E contract string present or updated in the same commit | all |
| X6 | Unknown/empty/failed/unavailable have distinct copy | Home, route, trip, unsafe, help-near, contribute |
| X7 | Reduced motion: nothing moves | all |
| X8 | Tab bar hidden on an open journey only | Trip |
| X9 | Report ≤ 2 taps from any tab root | all tabs |
| X10 | Adaptive surfaces ≤ 1 change per day; anchors fixed | Home, Contribute, Mira |
