# 01 — Current Product Audit

**Status:** Documentation only. Nothing in this document changes code.
**Audited build:** `release/beta-rc` @ `81db304` ("release: freeze MIRA public beta"). The code is identical to `f208ea3`.
**Method:**
1. Read every screen, shared component, the design tokens and the relevant domain modules in `src/`.
2. Read the existing product documents: `README.md`, `PRINCIPLES.md`, `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md` §1, §7–9 and §16, `MIRA_BETA_UX_ISSUES.md`, and the E2E specs.
3. Ran the production build locally (`next start` on :3150 plus the worker, with `.env.local` live providers: Google Maps, Claude, Mapillary).
4. Drove it with Playwright on a 390×844 phone (touch, 2×) and a 1366×900 desktop, in the pinned **Light** theme and the automatic **night** theme (real local time 22:43 IST). The fixed location was `28.6951, 77.2143` (Delhi, North Campus).
5. Spot-checked the map in the real in-app browser.

**Screenshots:** `docs/launch-ux/screenshots/` (index at the end of this document). The headless browser drew MapLibre overlays (route, pins, "you" dot) but **not the Google raster basemap**. The in-app browser shows the basemap correctly (world map, night style). Map-area blankness in the screenshots is a capture artefact, not a product bug.

---

## 1. Architecture summary (what matters for UI work)

| Layer | Fact | UI consequence |
|---|---|---|
| Framework | Next.js **16.3** App Router, React **19.2**, TypeScript, Tailwind **4.3** (`@theme` tokens in `src/app/globals.css`). Per `AGENTS.md`, read `node_modules/next/dist/docs/` before touching Next APIs. | Tokens are CSS variables, so one file re-skins the app. |
| UI kit | **No component library.** Hand-rolled: `components/ui/{Button,Field,Toast,Notice,Icon,cx}` and `components/app/*` (BottomSheet, TabBar, sheets, cards). | Every visual change is local and cheap, and there's no library to fight. |
| Icons | `components/ui/Icon.tsx`: 29 inline SVG strokes (home, sparkle, route, contribute, user, pin, flag, phone, shield, …). **Emoji** carry place kinds (`kinds.ts`), Help Point classes (`HELP_CLASSES[*].emoji`), report tiles, greetings and celebrations (≈49 literal emoji in UI code). | Icon language is split between SVG and emoji. |
| Font | `Plus_Jakarta_Sans` through `next/font/google`, **`subsets: ["latin"]` only**, with `Noto Sans Devanagari` as a system fallback in the stack. | Hindi and Hinglish render in a fallback face, so the typography is inconsistent. |
| Theme | **Time-of-day theming** (`data-daypart` = dawn / day / evening / night, set before paint by `/daypart.js`). The user can pin Light/Dark in Me → App (`localStorage mira.theme`). Night = dark UI plus the dark map style. | A distinctive, product-true idea ("living city"). Keep it. |
| Map | MapLibre GL **6.11** (`components/map/WorldMap.tsx`) over a **raster** base: Google Map Tiles (day and night styles) when keyed, OpenFreeMap otherwise. GeoJSON layers: `route`, `route-glow`, `route-approx` (dashed), `lit-glow` (amber `#ffc94d`), `lit-dark` (dotted), `notes` (peach circles), `me` and `me-halo`, `dest`. Place pins are **DOM markers** (`.mira-pin`: white circle, emoji, floating label). Fits use `fitBounds`/`easeTo` at 600–700 ms. Long-press opens a spot card. | Basemap styling is limited because Google raster tiles can't be restyled. Mira's visual identity on the map must come from **overlays**. |
| Sheets | `BottomSheet` (non-modal, three snaps: peek 40dvh, half 55dvh, full 88dvh, pointer drag, keyboard-operable handle). Modal sheets (`UnsafeSheet`, `HelpNearSheet`, `EmergencyOptionsSheet`, `SignInSheet`) are portalled to `document.body` and use `useOverlay` (history-back closes). | Correct primitives already exist. The snap *model* needs work (see §5). |
| Data | Postgres/PostGIS, a separate worker (missed arrivals, purge, checks, aggregation). Providers sit behind `src/server/providers/*` and have honest *evidence states* (`ok / partial / failed / unavailable`). | UI must keep four distinct states: **unknown ≠ empty ≠ failed ≠ unavailable** (owner rule). |
| AI | `/api/mira` streams NDJSON (`text`/`card`/`done`). Claude sits behind a frozen persona (`providers/companion/persona.ts`), falls back to a scripted engine, returns tool **cards** (`trip`, `places`, `help_points`, `report`, `sos`, `trip_status`, `save_place`) and runs an output guard (`domain/companion-output.ts`). | Mira can already *propose actions as cards*. The UI just shows them in a chat log. |
| Personal data | Saved places (≤10), Circle contacts (WhatsApp number and/or email), travel preference, **habits** (journeys to saved places, learned on arrival, visible, switch-off-able, deletable), Help Point exclusions, Mira chat (30 d). | Personalisation infrastructure exists (see §10). |
| Contribution | MIRA Checks (≤1 question per journey), structured Corrections, "Was the way lit?" votes, private Reports (moderated, aggregated at ≥5 contributors), **verified-only impact receipts**, **Local Steward** (quality-based trust status). | Mira Scout already has its engine (see §9). |

---

## 2. Routes and screens

| Route | File | Purpose | Auth |
|---|---|---|---|
| `/welcome` | `app/welcome/Welcome.tsx` | Two-step onboarding: the promise, then location permission | none |
| `/` | `app/(app)/HomeScreen.tsx` (927 lines) | Map plus sheet: where are you going, route context, start a journey | optional |
| `/trip` | `app/(app)/trip/TripScreen.tsx` (589) | Live journey, and the closed/arrived state | required |
| `/trips` | `app/(app)/trips/page.tsx` | Current journey plus journeys closed in the last day | optional |
| `/mira` | `app/(app)/mira/MiraChat.tsx` (391) | Companion chat with action cards | optional (sign-in wall) |
| `/contribute` | `app/(app)/contribute/ContributeScreen.tsx` | MIRA Checks, Correct something, Report, Your impact / Local Steward | optional |
| `/report` | `app/(app)/report/ReportScreen.tsx` | Six-tile private report | none (anonymous OK) |
| `/me` | `app/(app)/me/*` | Profile, Circle row, impact row, places, account, Help Point filters, travel prefs, habits, notifications, appearance, privacy, sign-out/delete | optional |
| `/circle` | `app/(app)/circle/CircleScreen.tsx` | Trusted contacts (WhatsApp-first; email optional) | required |
| `/inbox` | `app/(app)/inbox/InboxScreen.tsx` | In-app updates (bell on Home) | required |
| `/privacy`, `/terms` | `app/(app)/privacy`, `terms` | Legal and privacy text | none |
| `/t/[token]` | `app/t/[token]/SharedTripView.tsx` | **Contact's live view**, opened from WhatsApp | token |
| `/invite`, `/invite/[token]` | `app/invite/*` | Contact accepts an invite | token |
| `/auth/link[/token]` | `app/auth/link/*` | Email magic-link confirm | token |
| `/admin/*` | `app/admin/*` | Moderator console (reports, releases) | moderator |

**Navigation:** a floating glass pill `TabBar` with **Home · Mira · Trips · Contribute · Me** (called "the locked Day-0 navigation" in the code comment). Emergency is never a tab. Circle, Inbox and Privacy live under Me. Report is reached from Home's secondary row, long-press on the map, the arrival screen, Contribute, Me → Privacy and Mira cards.

---

## 3. Existing design system (as built)

From `src/app/globals.css`:

| Token group | Current values | Character |
|---|---|---|
| Canvas / surface | `--color-canvas #faf7ff` (lavender white), `surface #fff`, `sunken #f3effb` | cool lavender |
| Ink | `#1c1633` / muted `#5a546e` / subtle `#6c6682` | violet-black |
| Accent | `#6a44f5` violet, `accent-soft #efe9ff` | saturated violet |
| Extra hues | `peach #ff8a65`, `mint #15803d`, `warm #9a4d0e`, `error #c4281c` | five hues in play |
| Signature gradient | `bg-mira`: `#5b36e8 → #9333ea → #c43d62` (violet → purple → rose); `variant="hero"` buttons (15 uses), active-trip card, MiraOrb | "AI gradient" |
| Glass | `.glass`: 82% surface plus `blur(18px) saturate(1.4)` on the tab bar, map header card, bottom sheet (18 uses) | glassmorphism |
| Backdrop | `bg-companion`: two radial glows (peach and violet) on every full-page screen | "glowing blobs" |
| Radius | card `1.75rem`, control `1.1rem`, sheets `2rem`, plus `rounded-3xl` ×41, `rounded-2xl` ×66, `rounded-full` ×94, and 47 arbitrary `rounded-[…]` | very round, inconsistent |
| Shadow | `shadow-card` (violet-tinted), `shadow-float`; `shadow-[var(--shadow-card)]` ×60 | everything floats |
| Type | Plus Jakarta Sans; `font-extrabold` ×64; section labels `uppercase tracking-wider` ×21 | loud hierarchy |
| Motion | `rise` (420 ms, overshoot curve), `fade` 300 ms, `breathe` 4 s infinite (MiraOrb), `animate-ping` ×3 (live dots), sheet height transition 300 ms, map ease 600–700 ms. **Global `prefers-reduced-motion` kill switch.** | ornamental, but reduced motion is respected |
| Mira identity | `MiraOrb`: gradient sphere, white sparkle glyph, breathing (51 references) | a glowing AI orb |
| Dayparts | dawn / evening tint the canvas and glows; night swaps the whole palette to `#120f24` violet-black | distinctive |

**Verdict:** The *system* (tokens, dayparts, primitives, a11y floor) is sound. The *visual language* lands on the exact look the frozen thesis rejects (§9): lavender canvas, violet primary, violet-to-rose gradient CTAs, glass on everything, a breathing gradient orb, emoji iconography and very round floating cards. User-feedback research (03, §F) shows this "purple-gradient AI app" look is now read as generic and low-trust.

---

## 4. Screen-by-screen audit

Priority key: **P0** must change for launch polish · **P1** should · **P2** later.

### 4.1 Welcome (`/welcome`)
*Screens: `mobile-night-01-welcome-1`, `mobile-day-01-welcome-1-full`, `mobile-day-02-welcome-2`*

- **CURRENT PURPOSE:** Explain the promise, then ask for location with context.
- **CURRENT EXPERIENCE:**
  - Step 1: MiraOrb, "With you until you arrive.", a paragraph, the line "Designed around the realities women face… Useful to anyone.", three emoji feature cards (Before you go / On the way / If something feels wrong), a Mira paragraph and a gradient "Start with MIRA" CTA.
  - Step 2: a locate icon, "Where are you?" and an explanation.
  - The Skip link exists; the page is dark at night.
- **WHAT WORKS:**
  - Location is asked for *after* the explanation (a Headspace-grade pattern).
  - Browsing needs no account.
  - Privacy is stated at the point of asking.
  - The CTA stays sticky on small phones.
- **WHAT DOES NOT:**
  - Step 1 is a **feature list**, told in three cards plus two paragraphs. The fold on a 390 px phone cuts mid-card.
  - The copy frames the product as a women's-safety tool before it frames it as a companion.
  - "Start with MIRA" on the welcome screen means "continue", but everywhere else it means "start a journey". The same label carries two meanings.
  - The gradient orb and gradient CTA set the "AI app" tone in the first second.
  - Contribution ("Mira for Everyone") is not mentioned.
- **WHAT MUST BE PRESERVED:**
  - The two-step flow.
  - Explain-then-ask location, with the denied / unavailable handling.
  - No account needed.
  - The Skip link.
  - `localStorage mira.welcomed` gating.
  - The "Already use MIRA? Sign in" entry.
- **LAUNCH PRIORITY:** P1. Rewrite and re-skin; no flow change.

### 4.2 Home, signed-out and signed-in (`/`)
*Screens: `mobile-day-03/04` (signed out), `mobile-day-14` (signed in), `mobile-night-*`, `desktop-day-*`*

- **CURRENT PURPOSE:** "Where are you going?" is the primary action. Help and emergency are always reachable, and Mira and Report are secondary.
- **CURRENT EXPERIENCE:**
  - A full-bleed map.
  - Top: a glass greeting card ("Good evening, Asha 🌙 / 10:44 pm · Banarsi Das Estate", bell, avatar or Sign in). Below it sit two pills, **I feel unsafe** (accent text) and **Emergency 112** (or "Emergency options" when the country's number is not a verified all-service one).
  - The sheet at **peek (40dvh)** shows:
    - the title "Where are you going?";
    - an explanatory sentence (until she has places);
    - a search field;
    - saved-place chips;
    - a Circle line (a long honesty sentence).
  - Below the fold:
    - the *nudge* card (habit / "Heading home?" / "Save Home once");
    - a row of text links (Help Points near me · Ask Mira · Report something);
    - an Install card;
    - "Around you" (5 nearby places);
    - Safety updates.
  - Other behaviour:
    - the locate button floats above the sheet;
    - long-press opens a spot card ("🚩 Report here / 🧭 Go here");
    - pin-drop mode.
- **WHAT WORKS:**
  - Map-first with a non-modal detented sheet, the right model (Apple Maps).
  - The one primary question.
  - Emergency is one tap, with the **cited** local number, and options when a number is service-specific or unknown.
  - "I feel unsafe" opens instantly, with no AI and no network wait (Help Points are prefetched).
  - The habit nudge is real personalisation ("≥3 finished journeys to this saved place at this hour").
  - Location states are honest.
  - Long-press to report or go is a good contribution shortcut.
- **WHAT DOES NOT:**
  1. **The personal, adaptive element sits below the fold.** At peek, the nudge is hidden under the tab bar (`mobile-day-14`). The most "Mira knows me" moment is invisible.
  2. **The sheet reads as a feature directory:** search, chips, circle sentence, nudge, three links, install card, Around you, Safety updates. Every item has equal typographic weight.
  3. **Honesty copy is long and always on.** The Circle line under the search (for example "Send a live link when you start, or add someone to send it on WhatsApp in one tap (with their email, MIRA can also attempt an alert if you don't arrive)") is true but reads as fine print where the value proposition should be.
  4. **Help pills are permanently in the map's top-right**, styled as two heavy white pills. With the greeting card they take 25% of the map. That is a constant reminder of danger (thesis §8) even though the *content* is calm.
  5. **At `full` snap the sheet covers the I feel unsafe / Emergency pills** (`mobile-day-16`, `desktop-day-16`). A stable safety anchor disappears exactly when the user is reading details. **This is the only finding in this audit with safety weight.**
  6. The emoji in the greeting (🌙 ☀️) and chips (🏠 🎓 💼 ⭐) and the emoji place icons render differently per OS and read as casual.
  7. Contribution-heavy users have no presence on Home beyond a grey "Report something" link. Nothing says "there's a check waiting" or "your answer was confirmed".
  8. Desktop is a phone column centred on an empty map (`desktop-day-*`). It is usable but wastes the canvas.
- **WHAT MUST BE PRESERVED:**
  - Map-first layout.
  - Search and saved chips as primary.
  - Emergency one tap with the cited number.
  - I feel unsafe one tap from Home.
  - The bell with unread count.
  - Long-press spot card.
  - Pin drop.
  - The habit nudge and its rules.
  - "Around you".
  - Safety updates.
  - The Install card.
  - The honest location and help states.
  - Help Points prefetch.
  - The `useFlag("mira.welcomed")` redirect.
  - The `MAP_PADDING` framing contract (see the MapLibre padding gotcha).
- **LAUNCH PRIORITY:** **P0.** Hierarchy, the adaptive slot, help anchors that never hide, and re-skin.

### 4.3 Search overlay
*Screens: `mobile-day-08`, `mobile-day-09`, `mobile-day-34-offline-search`*

- **CURRENT PURPOSE:** Find a destination (saved first, then results), or drop a pin.
- **CURRENT EXPERIENCE:** A full-screen dialog "Where to?" with a back button, autofocused input, Saved places, results with emoji and distance, and "Choose on the map".
- **WHAT WORKS:** Fast. Saved places come first. Pin-drop fallback. Offline shows an honest failure line.
- **WHAT DOES NOT:** It is a full-screen takeover with a companion glow background and no transition continuity from the search field. Results use emoji.
- **WHAT MUST BE PRESERVED:** All behaviour, the `aria-label="Where to?"` dialog, and the placeholder "Search a place or address" (an E2E contract).
- **LAUNCH PRIORITY:** P1 (visual plus transition).

### 4.4 Route sheet: destination → context → start (Home, `dest` set)
*Screens: `mobile-day-10`, `-11`, `-15`, `-16`; night equivalents*

- **CURRENT PURPOSE:** Show the way, time, lighting and Help Points, then Start.
- **CURRENT EXPERIENCE:**
  - The destination header: emoji tile, name, "16 min walk · 1.1 km · arrive around 11:00 pm", and close.
  - A Walk / Ride / Transit segmented control.
  - Context lines ("Lighting · Lighting not known · Couldn't check OpenStreetMap · Community can improve this · Why not known?"; "Help · 3 mapped Help Points along the way · first: …").
  - A "LIGHTING ON THE WAY" bordered box with "Sources and freshness".
  - The gradient **Start with MIRA** button.
  - Share with {Circle} / Just me.
  - A disclosure sentence.
  - The Help Point list, community notes, Safety updates near there, and Save this place chips.
- **WHAT WORKS:**
  - Evidence-first and never a verdict.
  - Unknowns are stated, and "couldn't check" is distinct from "none" (UX-02 fixed).
  - Alternatives exist (`RouteOptions`).
  - Share-or-just-me is explicit before start.
  - Ride and transit ETA are her own choice.
  - Lighting is shown before Start (UX-01 fixed).
- **WHAT DOES NOT:**
  1. The **decision isn't said as a decision.** The user gets rows of evidence ("Lighting not known · Couldn't check OpenStreetMap"), not a one-line summary ("16 min, mostly unmapped for lighting; 3 Help Points on the way").
  2. There are two lighting representations (the context line *and* the box), plus a "Why not known?" link *and* a "Sources and freshness" disclosure.
  3. The Start button sits below the fold at `half` on a 390 px phone when lighting evidence is present.
  4. Emoji Help Point icons.
  5. The saved-place chips at the bottom ("Save this place") compete with the primary action in weight.
- **WHAT MUST BE PRESERVED:**
  - Every evidence state.
  - Lighting shown before Start, never after.
  - Sources one tap away.
  - The alternatives selector.
  - Mode switch and ETA choices.
  - Share / Just me radio.
  - The pre-start disclosure (its *truth*, not its length).
  - Help Point list default-open.
  - Community notes with "Why am I seeing this?".
  - Safety updates.
  - Save this place.
  - `region "Lighting evidence before starting"` (an E2E contract).
- **LAUNCH PRIORITY:** **P0.**

### 4.5 Journey screen: active (`/trip`)
*Screens: `mobile-day-17`, `-18`, `mobile-night-17`, `desktop-day-17/18`*

- **CURRENT PURPOSE:** Let her be followed until she arrives, with help ahead.
- **CURRENT EXPERIENCE:**
  - A glass header ("● Walk in progress / To Kamla Nagar · walking", back) with the Emergency pill below.
  - The map follows her. Help Point pins (emoji) sit on the route.
  - The sheet at half shows:
    - "EXPECTED IN / 49 min / ETA 11:34 pm, with time to spare · 1.8 km to go";
    - "Your planned route stays on this phone · 9 Help Points along it";
    - **two stacked full-width filled buttons**: gradient "I'm here" and violet "Send my live link";
    - WhatsApp "Send to {name}" buttons;
    - a Circle status box;
    - an I feel unsafe / +10 min grid;
    - Nearest Help Point;
    - a screen-awake note;
    - End trip without arriving.
  - The tab bar stays on top and hides the Circle status box at half.
- **WHAT WORKS:**
  - Honest status (worker down, GPS lost, upload failing, email failed, missed).
  - The WhatsApp "Opened ✓", never "sent".
  - Wake lock.
  - Throttled uploads.
  - The next Help Point ranked for now.
  - Confirmation before ending.
  - Emergency always present.
- **WHAT DOES NOT:**
  1. **Two competing primary buttons.** At the start of a journey the important act is *sending the link*; near the end it is *I'm here*. The UI gives both maximum weight all the time.
  2. **The tab bar is visible during a live journey**, covering content and inviting navigation away from the one screen that keeps location live ("Your location updates while this screen is open").
  3. "Who can see me" (the thing that makes it feel like "Mira has me") is below the fold.
  4. The live-state dot (`animate-ping`) and the gradient card on Home are the only "presence" cues, and both are generic.
  5. There is no designed "journey capsule" on other screens except the gradient link card on Home.
- **WHAT MUST BE PRESERVED:**
  - Every status banner and its copy truth.
  - I'm here, Send my live link, the WhatsApp per-contact buttons, +10 min (once), I feel unsafe, Emergency, and End trip without arriving (with confirm).
  - Nearest Help Point with directions.
  - The wake-lock note.
  - The check-requested line.
  - Upload throttling.
  - All E2E strings listed in 09 §2.
- **LAUNCH PRIORITY:** **P0.**

### 4.6 Journey closed / arrived (`/trip`, closed)
*Screen: `mobile-day-23-trip-arrived`*

- **CURRENT PURPOSE:** Close the loop. At most one contribution question. Privacy reassurance.
- **CURRENT EXPERIENCE:** A large gradient orb, "You made it 🎉", "Glad you're at Kamla Nagar…", the "Was the way lit?" card (Lit / Partly / Not lit, with a consent-rich caption), the deletion note, a report link, the gradient "Back home" and "Your trips".
- **WHAT WORKS:** The one-question rule. Honest deletion time. The report entry. The lighting question at night.
- **WHAT DOES NOT:** The party emoji and big orb are louder than the moment warrants. The lighting caption is four lines. "Back home" is ambiguous ("go to Home tab" vs. "you're back home").
- **WHAT MUST BE PRESERVED:** The one question or nothing (`AfterArrival`), the UX-03 preparing state, the deletion line, report entry, and the strings "You made it", "Journey ended" and "Was the way lit?".
- **LAUNCH PRIORITY:** P1.

### 4.7 I feel unsafe sheet (Home and Trip)
*Screens: `mobile-day-05` (signed out), `mobile-day-19` (on trip), night equivalents*

- **CURRENT PURPOSE:** A first-class "something feels wrong" state, deterministic and instant.
- **CURRENT EXPERIENCE:** A modal sheet titled "Right now · Near {area} · time", containing:
  - Go to a Help Point (highlighted: name, class, walking time, hours, source), plus two more;
  - Share / Tell my people now;
  - Call someone;
  - Emergency 112 (dark filled);
  - the helpline row (Women Helpline 181);
  - "Your location in words" with coordinates and Copy;
  - Talk to Mira;
  - I'm okay now;
  - a footnote.
- **WHAT WORKS:** Content and order are right: move, tell, call, words. No AI. Instant. Honest about outcomes. The cited helpline. Location in words for reading out. Deliberate tel: hand-off, never auto-dial.
- **WHAT DOES NOT:** Visual density (nine blocks), accent-tinted cards, and emoji class icons. The sheet has no top-level calm anchor ("You're near X. Here's what you can do."). On a 390 px screen "I'm okay now" is at the very bottom.
- **WHAT MUST BE PRESERVED:** The order of actions, every action, no-AI and no-network wait, the `dialog "Right now"` name, and "Go to a Help Point" / "Tell my people now" / "I'm okay now" (E2E contracts).
- **LAUNCH PRIORITY:** P1 (visual). Content frozen.

### 4.8 Emergency pill and options sheet
*Screens: pill on every Home and Trip screen; `06-emergency-options` appears only in a profile without a verified all-service number*

- **CURRENT PURPOSE:** Dial the reviewed local number. Explain when it isn't known.
- **WHAT WORKS:** Cited per-country data (195 countries), a service-specific options sheet, no guessed numbers, and "MIRA opens your phone's dialler; it does not make the call."
- **WHAT DOES NOT:** It is visually heavier than it needs to be on Home (the thesis says emergency access is a stable anchor, not a hero). It is hidden at full sheet snap (§4.2 #5).
- **WHAT MUST BE PRESERVED:** One tap to `tel:`, the accessible name "Emergency call, {number}", and the options-sheet logic.
- **LAUNCH PRIORITY:** P0 (never hidden), P1 (visual weight).

### 4.9 Help Points near me sheet
*Screen: `mobile-day-07-help-near-sheet`*

- **CURRENT PURPOSE:** List Help Points around her now, with honest hours and failure states.
- **WHAT WORKS:** Deterministic ranking, hours "as listed" or "not known", retry on failure, filters honoured.
- **WHAT DOES NOT:** Emoji icons. Long list rows (`"Hours not known · may be closed now"` truncates).
- **LAUNCH PRIORITY:** P2 (visual only).

### 4.10 Mira (`/mira`)
*Screens: `mobile-day-24-mira-empty`, `mobile-day-25-mira-reply`*

- **CURRENT PURPOSE:** Companion conversation. Proposes actions as cards.
- **CURRENT EXPERIENCE:** A header with MiraOrb, "Mira" and the subtitle "Your travel companion · facts from maps and MIRA's country data". A chat log with orb avatars, example chips above the composer, and a composer above the tab bar. The live reply to "I'm walking back to Kamla Nagar now. Anything I should know?" was: *"It's late, so want to share this walk with your Circle as you go? If Kamla Nagar is your saved Home, just say so and I'll set it up — you tap to start it whenever you're ready."*
- **WHAT WORKS:**
  - The persona is on-brand: brief, calm, no verdicts, actions need a tap.
  - Streaming.
  - Screen-reader announcement once per reply.
  - Honest offline failure.
  - Night-aware examples.
  - Cards route into Home.
- **WHAT DOES NOT:**
  1. It is a chatbot tab. It doesn't sit where the decision happens.
  2. In the observed reply Mira asked the user to confirm that Kamla Nagar was Home, even though Home was saved as Kamla Nagar a minute earlier. The tool context didn't connect them. That is a companion-quality issue: the user did the work.
  3. The subtitle is jargon.
  4. The orb repeats beside every message.
  5. The composer, chips and tab bar stack into three floating layers.
- **WHAT MUST BE PRESERVED:** All card types and their tap-to-act rule, the sign-in wall and its explanation, clear history (in Me), the `role="log"` and live-announce pattern, placeholder "Message Mira…", button "Send", and emergency never waiting on Mira.
- **LAUNCH PRIORITY:** P1 (presentation). The #2 context gap is a companion tool/prompt issue, logged in 07 §A as a *post-launch* fix, not UI work.

### 4.11 Trips (`/trips`)
*Screen: `mobile-day-22-trips-active`*

- **CURRENT PURPOSE:** The current journey, plus journeys closed in the last day (the retention rule: no history).
- **WHAT WORKS:** Honest retention copy. Active card.
- **WHAT DOES NOT:** It is a whole tab for, at most, one active card and a day of rows. By design it is almost always empty ("No journey right now"). The empty state repeats Home's CTA.
- **WHAT MUST BE PRESERVED:** The route and its content, the retention statement, and the active-journey card. It is the tab-bar route to the live journey.
- **LAUNCH PRIORITY:** P2. Keep the tab and restyle. The option to fold it into a Journey capsule is in 06 §3.11 as `REQUIRES_OWNER_APPROVAL` (tab change).

### 4.12 Contribute (`/contribute`)
*Screen: `mobile-day-26-contribute` (first-name account)*

- **CURRENT PURPOSE:** MIRA Checks, Correct something, Report, Your impact, Local Steward.
- **CURRENT EXPERIENCE:** For a first-name (non-durable) account, **three of four sections are explanatory text telling her to sign in with Google or add email first**. The only live action is "Report privately". Impact reads "Nothing verified yet." and Local Steward sits in a `<details>`. The tab bar floats over the impact card.
- **WHAT WORKS:**
  - Quality-over-volume principles are already stated ("No points, streaks or leaderboards…").
  - Verified-only impact.
  - Corrections are structured (no free text).
  - One voice per person.
  - The pending-check status line.
- **WHAT DOES NOT:**
  1. For most new users, the "Mira for Everyone" tab is a wall of conditions. The shopkeeper who wants to report a broken streetlight has to read three paragraphs to find the one button.
  2. The durable-account requirement is correct: one voice per person is a trust rule. But the gate is shown three times.
  3. Reporting is present, but it's the third section and phrased as "Something happened to you or near you?". It doesn't say "street problem".
  4. There is no sense of the *area* (the thesis's "nearby unresolved things"). The data layer doesn't expose nearby unresolved reports publicly, by design (principle 4).
- **WHAT MUST BE PRESERVED:**
  - Every section's rules.
  - The durable-account gate for checks and corrections.
  - The report path (anonymous OK).
  - Impact wording rules (verified only).
  - Local Steward criteria.
  - "Reports are never counted as contributions or rewarded" (an existing decision; see 07 §C.6).
- **LAUNCH PRIORITY:** **P0** (hierarchy for "Mira for Everyone").

### 4.13 Report (`/report`)
*Screens: `mobile-day-27-report-tiles`, `-28-report-form`, `-29-report-thanks`*

- **CURRENT PURPOSE:** A three-tap private report.
- **CURRENT EXPERIENCE:**
  - "What happened? Private and anonymous." Six pastel-gradient emoji tiles: 😣 Harassment, 👣 Being followed, ✋ Unwanted touch, 💡 Dark or broken street, 🚌 Transport problem, 💜 Something good. Then "Something else" and a long-press tip.
  - Form: a location card (about 1 km kept), When chips, "It happened to me / I saw it", optional note with PII detection, and "Send privately".
  - Thanks: "Thank you 💜".
- **WHAT WORKS:**
  - Three taps.
  - Location coarsened and said so.
  - PII warning.
  - Idempotency key.
  - Honest "may be reviewed".
  - No people-description fields (this aligns with the Nextdoor evidence in 03).
- **WHAT DOES NOT:**
  1. Emoji-led, pastel gradient tiles read childish in a harassment context.
  2. Four of six tiles are *incidents*. The **street-condition** reports the thesis lists (streetlight, flooding, accident, damaged infrastructure, unsafe road, closed help point) fold into one tile, "Dark or broken street", or into Correct something (a closed Help Point).
  3. After "Send", the reporter hears nothing more. It's a void. User research shows "reporting into a void" is a top churn cause (03 §F).
- **WHAT MUST BE PRESERVED:** The taxonomy (DB/moderation contract), the PII check, the coarse location, the three-tap flow, and "Send privately" / "Thank you" / "Dark or broken street" (E2E contracts).
- **LAUNCH PRIORITY:** P0 (tone and grouping). Taxonomy extension is post-launch and `REQUIRES_OWNER_APPROVAL` (07 §C.3).

### 4.14 Me (`/me`)
*Screen: `mobile-day-30-me` (full page)*

- **CURRENT PURPOSE:** Everything personal.
- **CURRENT EXPERIENCE:** A long single page containing:
  - avatar header;
  - Your circle row;
  - Your impact row;
  - Your places;
  - Your account (email / Google upgrade);
  - Help Points filters (8 toggles);
  - Travel preferences;
  - What MIRA remembers (switch, habit list, Forget all);
  - Notifications;
  - App (Appearance, Install);
  - Privacy (report, data handling, clear chat, sign out, delete).
- **WHAT WORKS:**
  - Personalisation is **visible and reversible** (the habit list, the switch, Forget all). That meets the thesis's "adaptive, reversible" requirement.
  - Honest demo-account sign-out.
  - Delete everything.
- **WHAT DOES NOT:** Eleven sections with equal weight make a settings dump. The account upgrade form sits mid-page as a large block. Help Point filters render as eight bordered pills.
- **WHAT MUST BE PRESERVED:** Every control, and the `#places`, `#account`, `#help`, `#travel`, `#remembers`, `#app`, `#privacy` anchors (linked from elsewhere).
- **LAUNCH PRIORITY:** P1 (grouping).

### 4.15 Circle (`/circle`)
*Screen: `mobile-day-31-circle`*

- **WHAT WORKS:** WhatsApp-first (the owner's decision). Honest "MIRA opens WhatsApp; you press Send." Statuses Trusted / WhatsApp / Invited.
- **WHAT DOES NOT:** Long explanatory paragraphs. The email caveat is repeated.
- **LAUNCH PRIORITY:** P1.

### 4.16 Inbox (`/inbox`) · Privacy · Terms
- Inbox: emoji type icons; "All quiet" empty state with orb. It works. **P2.**
- Privacy and Terms: long-form text on the companion backdrop. **P2** (typography only).

### 4.17 Contact live view (`/t/[token]`)
*Screen: `mobile-day-20-shared-live-view`*

- **CURRENT PURPOSE:** What a contact sees from WhatsApp. It is the product's **first impression for non-users**.
- **CURRENT EXPERIENCE:** A map plus a sheet: "ON THE WAY" chip, avatar, "Asha is walking to Kamla Nagar / Expected by 11:34 pm IST · updated just now", and a privacy footer. On arrival: "{name} arrived 🎉" and "Try MIRA".
- **WHAT WORKS:** It follows the Uber Share Trip recipient pattern (03 §A.9): ETA and status first, time zone labelled, staleness shown, the link dies after the trip.
- **WHAT DOES NOT:** It renders in the viewer's daypart (dark at night), which is correct, but the visual is sparse. There is no "what to do if you're worried" line for the contact.
- **LAUNCH PRIORITY:** P1. It's a growth and trust surface. **No data change** (a contact guidance line is copy only).

### 4.18 Sign-in sheet
*Screen: `mobile-night-13-signin-sheet`*

- **WHAT WORKS:** First-name account, 18+ attestation, the email path.
- **WHAT DOES NOT:** Orb, gradient CTA. "Let's get you set up" is generic.
- **LAUNCH PRIORITY:** P2.

### 4.19 Admin (`/admin`)
Out of scope for launch UX (moderator-only). Keep as is.

---

## 5. Cross-cutting findings

### 5.1 Strengths to preserve (non-negotiable)
1. **Truthfulness engineering.** Every promise is conditional on reality ("Opened WhatsApp", never "sent"; "couldn't check" ≠ "none"; worker-down banners). This is Mira's deepest moat. Visual work must never shorten a sentence in a way that changes its truth.
2. **Deterministic help.** I feel unsafe, Emergency and Help Points involve no model and no wait.
3. **Privacy architecture.** No location history, per-journey links, coarse reports, verified-only impact.
4. **Personalisation that is visible and reversible** (habits, preferences, filters).
5. **Quality-based trust** (Local Steward: verified, multi-day, multi-area, ≥80% agreement, anomaly flags).
6. **Time-of-day theming.**
7. **Accessibility floor:** 44–48 px targets, skip link, focus rings, live regions, reduced-motion kill switch, keyboard-operable sheet handle, `lang`/`text-mixed` line heights for Hindi.

### 5.2 Weaknesses (ordered by launch impact)
1. **Visual language contradicts the thesis:** a gradient / violet / glass / orb "AI app" look (§3).
2. **Hierarchy by accumulation.** Home, the route sheet, the trip sheet and Contribute present every true thing at equal weight. Value is buried under qualification.
3. **Safety anchors can be covered** by the full-height sheet (§4.2 #5).
4. **Journey mode isn't immersive.** The tab bar is present and the primary buttons compete.
5. **"Mira for Everyone" is under-served.** Contribution is gated or buried for new users, and there's no loop closure after a report.
6. **Emoji as icons** in about 49 places, and as class identity for Help Points on the map.
7. **Mira's presence is a decorative orb**, not a state-carrying element.
8. **Desktop** is a centred phone.

### 5.3 UX inconsistencies
- "Start with MIRA" means *continue onboarding* on Welcome and *start a journey* on Home and Mira cards.
- **MIRA** (product) vs **Mira** (companion). The frozen thesis names the product *Mira*. The UI uses both, sometimes in one sentence ("Mira, your companion… MIRA keeps no history").
- Local Steward (UI) vs Mira Scout (thesis).
- Back affordances: a round `back` button on Trip and Inbox, "Back" text on Report, none on Contribute and Me (tab roots, which is correct).
- Section headings: `uppercase tracking-wider` labels in sheets and Contribute, `Section` component titles in Me. Same role, different treatments.
- Success feedback: toast ("Saved as Home"), full-screen celebration (report and arrival), inline status (corrections). There's no rule.

### 5.4 Visual inconsistencies
- Five hues in use (violet, peach, mint, warm, error), plus a gradient, plus pastel tile gradients (`from-rose-50 to-orange-50`, …) on Report only.
- 47 arbitrary radii.
- Three different "filled" button looks: gradient hero, violet primary, and black (`EmergencyPill block`).
- The toast overlaps the tab bar area on desktop (`desktop-day-16`).

### 5.5 Dead or duplicated UI
- Lighting is shown twice in the route sheet (context line plus box).
- The "Report" entry appears on Home, Contribute, Me → Privacy, the arrival screen, the Mira card and long-press. That's intentional reach, but on Me it sits under "Privacy", which is wrong.
- `components/app/SignInNotice.tsx` and `InstallCard` both show "set up" prompts in different places.
- The `notes={[]}` prop on Home's map (community notes on the map are disabled on Home, and shown only as text in the route sheet). This is intentional (principle 12) and should be recorded as such, not "fixed".

### 5.6 Features that exist but are poorly exposed
| Feature | Where it lives | Exposure problem |
|---|---|---|
| Habit suggestion ("like usual") | Home nudge | Below the fold at peek |
| Route alternatives with lighting | `RouteOptions` | Only when there are more than one; the difference isn't summarised |
| Help Points ahead on the journey | Trip sheet | A single row, below two big buttons |
| MIRA Checks pending | Contribute | No signal outside the tab |
| Verified impact and Local Steward | Contribute, Me row | Private and quiet, which is correct, but there's no moment of recognition when it changes |
| Safety updates | Home (deep), destination | Bottom of the sheet |
| Help Point filters | Me | Settings only; unexplained on the unsafe sheet |
| Pin drop, long-press | Home | Tip text only |
| Contact live view quality | `/t/` | Not visible to the owner of the journey (no preview) |
| Discreet install as an app | `InstallCard` | A card in the sheet |

### 5.7 Where the design doesn't communicate the value proposition
The thesis: *"The user communicates their intent. Mira does the work."* Today the user **reads Mira's work**: lighting rows, source disclosures, Help Point lists, honesty sentences. Mira's conclusion is left for her to assemble. The product has the evidence but not the *voice of the decision*. The missing piece is one deterministic line per context: the **Mira line** (defined in 04 §13, 06, 07). For example: *"16 min walk. Lighting on most of it isn't mapped. 3 places with staff on the way."*

---

## 6. Responsive behaviour
- **Mobile (390×844):** Primary target. Works. Issues: fold positions (§4.2, §4.4), tab bar overlap (§4.5, §4.12).
- **Small phones (360×740 and 375×667):** Not captured. Risk: Start below the fold, the Welcome fold. See 09 §4 for required tests.
- **Desktop (1366×900):** Screens are `max-w-md`/`max-w-xl` columns centred on the map. The tab bar stays a bottom pill. It's usable, but the map's width is unused and the sheet covers the centre of the map.
- **Keyboard:** `interactiveWidget: resizes-content` keeps the composer and fields visible.

## 7. Current motion inventory
| Motion | Where | Meaning today |
|---|---|---|
| `rise` 420 ms with overshoot | 31 entrances (cards, headers, messages) | none (decoration) |
| `fade` 300 ms | overlays | entrance |
| `breathe` 4 s infinite | MiraOrb (non-calm) | "Mira is alive" (decorative) |
| `animate-ping` | live-trip dots | journey live ✓ (meaningful) |
| Sheet height 300 ms | BottomSheet | snap ✓ |
| `fitBounds`/`easeTo` 600–700 ms | map | orientation ✓ |
| `active:scale-[0.98]` | buttons | press feedback ✓ |
| Typing dots bounce | Mira | thinking ✓ |
| Skeleton shimmer | a few loaders | loading ✓ |
| Reduced motion | global CSS kill switch | ✓ |

---

## 8. Feature classification (thesis §19)

`PRIMARY` = always visible on its screen · `CONTEXTUAL` = appears when relevant · `SECONDARY` = one tap away, quiet · `SETTINGS` = in Me · `REMOVE/REDUNDANT` = duplicate presentation to be merged (**no functionality is removed**).

| Feature | Class | Notes |
|---|---|---|
| Where are you going (search + saved chips) | PRIMARY | Home |
| Start journey (Share with Circle / Just me) | PRIMARY | Route sheet |
| Emergency (cited number) | PRIMARY (stable anchor) | Home, Trip, Unsafe, Mira sos card |
| I feel unsafe | PRIMARY (stable anchor) | Home, Trip |
| I'm here / Send my live link / Send to {contact} | PRIMARY on Trip (one filled at a time, see 06) | |
| Mira line (new presentation of existing data) | PRIMARY | Home, route sheet, trip |
| Habit suggestion | CONTEXTUAL | the Home adaptive slot |
| Route alternatives | CONTEXTUAL | route sheet |
| Lighting evidence + sources | CONTEXTUAL (summary line PRIMARY within the route sheet) | merge the duplicate line and box |
| Help Points along route / near me / ahead | CONTEXTUAL | |
| Safety updates | CONTEXTUAL | only when there are updates or a failure; otherwise one quiet line |
| Community notes on route | CONTEXTUAL | |
| Long-press spot card / pin drop | CONTEXTUAL | |
| Report something | SECONDARY on Home, PRIMARY on Contribute (stable anchor) | |
| MIRA Checks | CONTEXTUAL (Home adaptive slot when pending), PRIMARY on Contribute | |
| Correct something | SECONDARY (Contribute) | |
| Your impact / Mira Scout (Local Steward) | SECONDARY (Contribute, Me row) | private |
| Ask Mira (chat) | SECONDARY (tab plus Home entry) | |
| Around you | SECONDARY (below the fold) | |
| Trips list | SECONDARY (tab) | |
| Inbox | SECONDARY (bell) | |
| Install card | CONTEXTUAL (adaptive slot, lowest priority) | |
| Saved places management, Circle, account, filters, travel prefs, what Mira remembers, notifications, appearance | SETTINGS | Me |
| Clear Mira chat, sign out, delete account, privacy docs | SETTINGS | Me |
| Duplicate lighting line + box | REMOVE/REDUNDANT (merge into one block) | |
| "Report" under Me → Privacy | REMOVE/REDUNDANT (move into Me → Contribute row; the route remains) | |
| Repeated durable-account gate text (×3 on Contribute) | REMOVE/REDUNDANT (one line) | |
| Decorative MiraOrb on empty/closed screens | REMOVE/REDUNDANT (replace with Mira Pulse mark, 04 §12) | |

---

## 9. Screenshot index (`docs/launch-ux/screenshots/`)

Naming: `{mobile|desktop}-{day|night}-{NN}-{state}.jpg`. Day = Light theme pinned. Night = automatic (22:4x IST). The basemap is blank in headless captures (see header).

| NN | State |
|---|---|
| 01 | Welcome step 1 (`-full` = full page) |
| 02 | Welcome step 2 (location) |
| 03 / 04 | Home signed-out, peek / half |
| 05 | I feel unsafe, signed out |
| 07 | Help Points near me |
| 08 / 09 | Search, empty / results |
| 10 / 11 | Route sheet signed-out, half / full |
| 12 | Long-press spot card |
| 13 | Sign-in sheet |
| 14 | Home signed-in, peek |
| 15 / 16 | Route sheet signed-in (Home saved), half / full (**sheet covers help pills**) |
| 17 / 18 | Active journey, half / full |
| 19 | I feel unsafe on a journey |
| 20 | Contact live view (`/t/…`) |
| 21 | Home with an active journey |
| 22 | Trips tab with an active journey |
| 23 | Arrived + "Was the way lit?" |
| 24 / 25 | Mira empty / live Claude reply |
| 26 | Contribute (first-name account) |
| 27 / 28 / 29 | Report tiles / form / thanks |
| 30 | Me (full page) |
| 31 | Circle |
| 32 | Inbox |
| 33 | Privacy |
| 34 | Offline search |

Capture script (scratch, not committed): Playwright against `mira-verify` (`.claude/launch.json`), a Delhi North Campus geolocation, and a first-name test account ("Asha"). To reproduce, see 09 §12.
