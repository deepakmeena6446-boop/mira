# MIRA — Product Truth, Wedge & Public Launch Audit

*Audit date: 2026-09-26 · commit `ba671c3` (main). One document combining the product-truth audit, wedge analysis, user-need audit, privacy reality, open-source model and the six-hour release plan.*

## Contents

- **Part 0 — Executive summary**
- **Part 1 — Current product truth**: journeys, capability map, per-feature value, safety/map audit, AI audit, mobile/PWA
- **Part 2 — Wedge analysis**: candidate wedges, job to be done, ideal flows, community loop, hero, messaging
- **Part 3 — User need audit**: need, risks by launch class, first-time friction, test scenarios A–J
- **Part 4 — Privacy reality**: what is stored, who sees it, inaccurate claims, minimum-data rules
- **Part 5 — Open-source & community model**: public vs private, contribution flow, trust levels, protected areas, principles
- **Part 6 — Six-hour public release plan**: delete/hide list, timeline, P0/P1/P2 tasks, release validation, go/no-go

---

# Part 0 — Executive summary

### MIRA in one sentence
MIRA lets you share a walk in one tap: the people you trust watch you on a live map until you arrive, MIRA notices when you get there and turns the link off, and if you don't arrive it emails them.

### The user problem
"Reach home and message me" is a ritual families already run every day. It depends on her remembering to text, and on someone else remembering to worry. WhatsApp live location doesn't know where she's going, doesn't notice when she arrives, can't tell anyone when she *doesn't* arrive, and keeps running afterwards.

### The wedge
**Automating "text me when you reach"** for women who walk home. Lighting on the route makes each walk better informed, and a one-tap "Was the way lit?" is how people contribute. It scored 31/35 against 12–22 for the alternatives, works with one user and one friend, and is already built.

### Why women would use it
1. Walking home after dark takes one tap (🏠 Home → Share), and it switches itself off when she arrives.
2. She doesn't have to text "reached", and nobody has to keep checking on her.
3. She can see how much of the route is lit before she walks it.

### Why they would keep it
1. Most of them walk the same way home every day, and a saved Home turns that into one tap.
2. The safety net runs in the background: if she doesn't arrive, her people get an email.
3. The lighting information gets better as more people walk with MIRA.

### Why they would contribute
It costs one tap at the moment of relief ("You made it 🎉 — was the way lit?"). It asks for nothing personal, it's about streets rather than people, and the lighting bar she saw before her own walk exists because others tapped.

### The community flywheel
User → shares a walk → her friend watches the link and sees MIRA → she arrives and taps "was it lit?" → dark stretches get marked for the next walker → her friend starts using MIRA for her own walks → User

### Hero experience
**"Walk me home."** She taps 🏠 Home, then **Share my walk**. The trip runs live, MIRA says "You made it 🎉" on arrival, her people see "Asha arrived", and she answers "Was the way lit?" with one tap.

### Current product reality
**Working (locally; 169/169 tests pass; walked through on a phone-sized screen):**
- Trip sharing: live links, arrival detected automatically, +10 min, and a "Share link" button that opens WhatsApp.
- The page your contact sees, and the missed check-in email (it only reaches the local test mailbox so far).
- Trusted contact invites, saved places, map and search, walking routes, and lighting.
- Mira on Claude, reports and moderation, installing to the home screen, account deletion.

**Partial:**
- Community notes: built and tested, but none has ever been published (each needs 5 people reporting the same thing in the same area and time of day, and a moderator approving every report).
- Lighting from walkers' answers: no answers recorded yet.
- A trip without contacts: nobody else is ever told anything.
- Accounts: a first name only, with no way to recover them.
- Walking only: auto and cab rides aren't supported. No push notifications.

**Missing:**
- Hosting, a domain, HTTPS and a production database.
- **Real email sending.** Every contact alert goes by email.
- Google sign-in, WhatsApp or SMS alerts, and location tracking while the phone is locked.

### Biggest product problem today
The app presents itself as an AI character ("Hi, I'm Mira") and a map of nearby places. Its real value, "your people see you get home", is the third line of the welcome screen, and nothing in onboarding gets her to a first shared walk.

### Biggest user friction today
Her contacts have to accept an **email** invite before they can receive alerts. In India family communication happens on WhatsApp, and email gets read late or lands in spam. The "Share link" button avoids this but gets no attention in onboarding.

### Biggest safety / trust risk
Promises the code doesn't keep:
- A trip with no contacts says "I'll still check that you arrive… they'll see your last spot". No one is told anything.
- There's no emergency button on Home or on a live trip; the fastest route to 112 is typing to Mira and waiting about 4 s.
- "I feel uneasy" gets a question back from Claude and no options.
- The privacy page says Mira's chat history keeps nothing about where she was, but her own messages are stored exactly as typed.

### What we change in the next 6 hours
1. Rewrite the first screen around the promise: **"Walk home. Your people will know."**
2. Add a calm "Emergency" (112) button, always visible on Home and on the trip screen.
3. Make the copy honest: trips without contacts, alerts go by email, the privacy page, remove "coming soon".
4. Make "I feel uneasy" give options straight away, and cap Mira at 60 messages per person per day.
5. Host the web app and background worker with Postgres + PostGIS, HTTPS, and a monitor on `/api/health/ready`.
6. Set up real email from a verified domain; confirm a missed-arrival email lands in a Gmail inbox.
7. Rotate all four demo API keys, restrict them, and set spending limits.
8. Test on real phones: an Android trip, whether an iPhone home-screen install keeps the account, a missed check-in.

### What we absolutely do not build today
Safety scores, heatmaps or "felt unsafe here" ratings; push notifications, WhatsApp/SMS alerts, Google sign-in or a native app; cab and auto trips; any promise that community notes exist; any new use of the AI.

### Can MIRA be publicly released today?
**Yes, as a limited public beta for women who walk home in India**, but only if by about hour 4 the web app and worker are live on HTTPS, a missed-arrival email has been **seen in a real inbox**, and the copy, emergency button and spending-cap fixes are merged. If real email can't be set up today, launch only the "Share link" flow and say plainly that nobody gets alerted automatically yet, or wait a day. Not ready for a broad press launch.

### Remaining success-condition answers
- **Better than WhatsApp + Maps + calling someone:** MIRA notices when she arrives and tells people when she doesn't. WhatsApp can do neither.
- **First minute:** today she gets a map; after the fixes, onboarding should lead to her first shared walk.
- **Before thousands of users:** the core loop needs only her and one friend; lighting starts from OpenStreetMap data.
- **Public contribution:** anyone can open a PR, but only 1–3 maintainers merge and deploy; changes to trips, alerts, authentication, privacy, location and moderation need two reviews plus a checklist.

---

# Part 1 — Current product truth

*Audit date: 2026-09-26 · commit `ba671c3` (main) · audited by reading the implementation, running the test suite, and walking the app as a new user on a 375 × 812 phone viewport.*

> The V0 specs in this folder (`MIRA_PRODUCT_SPEC.md`, `MIRA_UX_UI_SPEC.md`, `MIRA_TECHNICAL_ARCHITECTURE.md`, `MIRA_OVERNIGHT_EXECUTION_PLAN.md`) describe the **DU North Campus V0 pilot, not the current app**. Don't use them as evidence of what MIRA does. This document and `README.md` describe MIRA 2.0 as it is.

### How this was established

| Evidence | What it proved |
|---|---|
| Read every screen in `src/app/(app)`, `/welcome`, `/t/[token]`, `/invite`, `/admin` | What a user can actually see and tap |
| Read the services behind them (`src/server/trips`, `journey/worker.ts`, `account/*`, `report/*`, `aggregate/*`, `notes`, `lighting`, `providers/*`) | What actually happens after the tap |
| `npm test`: **169/169 unit + integration tests pass** | Domain rules, APIs, privacy allowlists and retention behave as the code claims |
| E2E suite (`tests/e2e`, 17 scenarios, mobile + desktop, run in earlier sessions; not re-run today) | End-to-end trip → contact view → arrival → missed alert → moderation → community note |
| **Live walkthrough today** on local dev with Google Maps + Claude keys active (Delhi, North Campus, simulated GPS) | Onboarding, home, search, route + lighting, trip start/end, Mira "I feel uneasy" / "someone is following me", Me |
| Local database counts | `aggregate_releases = 0`, `lit_votes = 0`, `reports = 2 (0 approved)`: **no community output has ever existed outside tests** |
| Environment | Only local: PostGIS + Mailpit in Docker. **No host, domain, HTTPS, production DB or production SMTP exists.** |

---

### 1. What MIRA actually is, in one paragraph

MIRA is an installable web app (PWA) whose one fully working, genuinely useful loop is: **pick where you're walking to → share the trip → the people you trust watch a live dot and an ETA → MIRA notices when you arrive and switches the link off → if you don't arrive, each accepted contact gets one email.** Around that loop sit: a map of what's nearby (Google Places), walking routes (Google Routes) with a **street-lighting bar** (OpenStreetMap `lit` tags, Mapillary streetlight poles, and walkers' one-tap votes), an AI chat companion ("Mira", Claude) that can propose the same actions, a private **report** form whose output is thresholded, moderated community notes, and a deliberately minimal privacy model. Trips are **walking only** (≤ 25 km, ≤ ~3 h walk).

---

### 2. User journeys (as built, observed)

#### Discovery — what does she think MIRA is?
- There is **no landing page**. `/` redirects a first-time visitor to `/welcome`, which opens with a purple orb and **"Hi, I'm Mira — Your walking companion."**
- Three bullets: *See what's around you and along your walk · Share your trip live in one tap · Look out for each other, anonymously.*
- **Verdict:** she learns there's an AI character and something about walking. The actual promise ("your people know you got home") is the third clause of a sentence. The link preview on WhatsApp/Instagram has a title and description but **no preview image** (`src/app/layout.tsx` has no `openGraph.images`).

#### Onboarding — what must she give before value?
1. "Let's go" → 2. "Use my location" (browser permission prompt) → 3. first name → Home. **About 40 s, 3 taps and one word.** "Skip" exists on every step.
- The name creates a real account (`/api/auth/demo`). No email, no phone, no password. **Google sign-in shows "coming soon."**
- **Consequence:** the account exists only as a cookie in this browser. Clear the cookie, change phone, or tap Sign out (which deletes the account, with a warning) and her contacts and places are gone. Whether an iPhone home-screen install shares the Safari cookie is **UNKNOWN**: it must be tested on a real device.

#### First value — what's the first useful thing?
- At T+40 s: a map of the neighbourhood with café, bus and metro pins, "Good morning, Asha · 10:13 AM · University Enclave", and a nudge: *"Save your home and I can share your walk back in one tap."*
- That is **Google Maps with fewer features.** The first *distinctive* value (trip sharing) needs a destination, and it needs a trusted contact for anyone else to be involved.

#### Normal day (no emergency)
- Nearby places, search, walking time, what's along the route, lighting on the route. Useful but not differentiated, except lighting.
- Mira can answer "pharmacy near me" and list places.

#### Uncertain situations
| Situation | What MIRA does today | Observed |
|---|---|---|
| Feels uncomfortable | Mira tab → "I feel uneasy" chip | **Claude replies with a question and no action** ("Are you somewhere you feel unsafe…? say the word"). ~4 s. The scripted fallback (`placeholder.ts:89`) is *more* useful: it shows open places nearby plus a "share trip home" card. **Regression.** |
| Somewhere unfamiliar | Search → route sheet: minutes, distance, lighting %, places along the way | Works (Kamla Nagar: 21 min, 1.5 km, "Lit 30% · Not known 70% · From OpenStreetMap") |
| Travelling alone | Start trip → live link | Works **for walking**. For an auto/cab/metro ride MIRA has no mode: the ETA is walking time × 1.25 + 5 min, and anything over 25 km is refused as "too far to walk." |
| Wants someone aware | Trip "Share link" opens the phone share sheet (WhatsApp etc.) | Works with **no contact setup**. The best zero-friction path in the product. |
| Notices something concerning | Report tab, or press and hold the map | 3 taps, private, reviewed. The public effect is weeks away at best (see §4). |
| Wants context before going | Route sheet + community notes on route | Lighting: yes. Community notes: **none exist.** |

#### Incident / emergency
- **No emergency control on Home or on the live Trip screen.** A "call 112" link appears only (a) inside Mira's SOS card, (b) on the trip screen *after* a missed check-in, (c) on the report "thank you" screen.
- Fastest path today: open app → Mira tab → type → wait ~4 s for Claude → tap "Call 112". Observed: "someone is following me" produced ~60 words of text, then the Call 112 card. The keyword safety net guarantees the card appears but not quickly.
- MIRA cannot alert contacts *now*. Alerts go out only at **ETA + 10 min**, by email, and only if a trip is running.

#### After an incident
- Report flow ("It happened to me / I saw it", optional note, PII warning). Thank-you screen with 112. Nothing else: no follow-up, no resources, no "tell a contact".

#### Community contribution
- **Report** (6 tiles, ~3 taps + send).
- **"Was the way lit?"** one tap after arriving, **only** if the trip ended by arrival between 18:00 and 06:00 and a real street route was loaded.
- No confirm/disagree, no updates to existing notes, no place feedback.

#### Return behaviour
- Reason to come back: the walk home. Saved Home chip → route → Share. **That is the retention loop, and nothing else in the app creates one.** No push notifications exist (in-app inbox only), so MIRA cannot re-engage anyone.

---

### 3. Capability map

Status key: **WORKING** = end-to-end behaviour verified · **PARTIAL** = works but the user journey is incomplete · **MOCK** = UI without real behaviour · **PLANNED** = referenced, not built · **BROKEN/UNKNOWN** = can't be trusted yet.

> Everything marked WORKING works **on the laptop**. In production, anything that depends on email is BROKEN until SMTP is configured, and nothing runs until hosting exists.

| Capability | User-facing behaviour | Status | Problem solved | Trigger | User input | Output | Dependencies | Failure mode | Real user value |
|---|---|---|---|---|---|---|---|---|---|
| **Trip sharing (core)** | Start a walk to a destination; live trip screen; I'm here, +10 min, Share link, End | **WORKING** (E2E a-share-trip) | "Text me when you reach" | Leaving somewhere | Destination (1 tap if saved) | Live trip + ETA | Location, worker running, DB | Worker down → trip start refused ("paused for a moment") | **High** |
| Per-contact live link | Each accepted contact gets their own emailed link, revoked when removed | WORKING locally / **BROKEN in prod until SMTP** | Contact knows you're walking | Trip start | None | Email with link | SMTP | Email fails → trip screen says who couldn't be reached | High |
| Owner "Share link" | Native share sheet → WhatsApp, SMS… | **WORKING** | Share without setting up contacts | Trip screen button | 1 tap + pick chat | Live URL | Web Share API / clipboard | Recipient gets **no** missed-arrival email | **High (lowest friction)** |
| Contact live view `/t/…` | Live dot, ETA, "updated X min ago", paused/missed banners, "arrived 🎉" then dark | **WORKING** (E2E) | Contact isn't left guessing | Opens link | None | Map + status | Polling every 15 s | Stale location explained ("often just means the screen is off") | High |
| Auto-arrival | Arrive after 45 s within 75 m (accuracy ≤ 50 m) | **WORKING** (unit + E2E) | No need to remember to check in | Walking into destination | None | "You made it 🎉", links go dark, points deleted | Foreground GPS | Screen off / app backgrounded → no fixes → no auto-arrival → false missed alert possible | High |
| Missed check-in alert | At ETA+10 min, one email per accepted contact, with live link; "arrived" follow-up | WORKING locally (E2E b-missed-alert) / **BROKEN in prod until SMTP** | Nobody has to keep watching | Not arriving | None | Email + in-app note | Worker + SMTP | No SMTP → "nobody was notified" shown honestly | **High** (the safety net) |
| Private trip (no contacts) | "This trip is private. I'll still check that you arrive." | **PARTIAL / misleading** | — | Trip without contacts | — | In-app inbox note to **herself** only | — | Nobody else learns anything; copy implies otherwise ("they'll see your last spot") | **Weak** |
| +10 min | Extend once | WORKING | Running late without false alarm | Tap | — | ETA +10 | — | Only once | Medium |
| Location paused nudge | Owner gets in-app note after 10 min without points | WORKING | Knows sharing stopped | Screen off | — | Inbox item | Worker | In-app only; she won't see it if the app is closed | Low |
| Keep screen awake | Wake Lock on trip screen | WORKING where supported | Browsers stop GPS when hidden | Trip open | — | — | Wake Lock API | iOS/Android kill background GPS anyway | Medium |
| Trusted contacts | Add name + email; invite email; accept once without an account; max 5; default toggle; remove revokes | WORKING locally / **BROKEN in prod until SMTP** | Set up who follows | Me → Add | Name, email | Invite email | SMTP | Contact never accepts → never alerted (shown) | High but **slow**: needs the other person to act on an email |
| Saved places | Home / College / Work / Favourite chips; max 10 | WORKING | One-tap destination | Route sheet | 1 tap | Chip on Home | — | — | High (makes the hero one tap) |
| Map + "Around you" | Map, your dot, area name, nearby places list | WORKING (Google Places) | Orientation | Open app | Location | Pins, list | Google key (OSM fallback) | No location → "Turn on location…" + search still works | Low (Google Maps does this) |
| Search | Places + addresses; drop a pin | WORKING | Choose destination | "Where to?" | Text | Results | Google / Photon | — | Medium |
| Walking route | Minutes, distance, polyline | WORKING (Google Routes; OSM graph in pilot area; straight-line "approx." elsewhere without Google) | How far is it | Pick destination | — | Route | Google key | Approximate → flagged "approx." | Medium |
| **Lighting on the route** | "Lit 30% · Not known 70% · From OpenStreetMap" + warm glow on map | WORKING (OSM + Mapillary layers); walker layer **PARTIAL** (0 votes exist) | Is the way lit at night? | Route sheet | — | % bar with sources | Overpass, Mapillary token | Layer timeout → silently less data | **Medium-high, differentiated**, non-fear |
| "Was the way lit?" | 3 buttons after a night arrival | WORKING, rarely shown | Contribute lighting knowledge | Arrived trip, 18:00–06:00 | 1 tap | Per-40 m cell vote | Arrived state + route loaded | Not shown if trip was ended manually or in daytime | **Best contribution mechanism in the app** |
| Along the way | Places near route midpoint | WORKING | What's open en route | Route sheet | — | Chips | Google | Chips aren't tappable | Low |
| Community notes on map/route | Orange dot + template sentence ("Multiple reviewed observations mention … during the evening.") | **PARTIAL: works in tests, 0 have ever existed** | Collective local knowledge | Nearby/route | — | Note | ≥ 5 independent approved reports in the same ~1.2 × 0.6 km cell × time band × category within 21 days, weekly IST-Monday release, a human moderator | Never reaches threshold at launch scale | **Near zero at launch** |
| Report | 6 tiles + other → when, involvement, optional note → "Send privately" | WORKING (E2E d-reports) | Be heard; feed community notes | Report tab / long-press map | 3–5 taps | "Thank you", private | Moderator must review | Unreviewed forever if nobody moderates | Low for the reporter (nothing visible happens) |
| PII detection | Warns about phone numbers, plates, emails, handles…; holds report | WORKING (unit) | Protects third parties | Typing | — | Warning; held | — | Heuristic; names mostly not caught | Protective |
| Moderation console `/admin` | Queue, approve/hold/reject/redact/withdraw, suppress releases | WORKING (E2E) | Keeps notes clean | Operator | Password | Decisions + audit | One shared admin password | **Nobody staffed** = queue grows | Necessary cost |
| Weekly aggregation | Monday (IST) job turns approved reports into notes | WORKING (tests) | Threshold anonymity | Worker | — | Releases | Worker | IST-only week for a "worldwide" app | Structural |
| **Mira (AI companion)** | Chat; tools: nearby, propose trip, check trip, offer report, SOS card, save home | WORKING with Claude (`claude-opus-5`), scripted fallback | Conversational entry to features | Mira tab | Typing | Text + tap-to-confirm cards | Anthropic key, sign-in | Claude down → scripted fallback; ~4 s replies | Medium; **worse than a button in distress** |
| SOS card | "Call 112" big button | WORKING (inside Mira only) | Reach emergency services | Danger words | Typing | `tel:112` | — | Behind a chat round-trip | Important but **misplaced** |
| Inbox | Contact accepted, missed check-in, location paused, welcome | WORKING | Status updates | Bell | — | List | — | No push; only seen if app opened | Low |
| Push notifications | — | **PLANNED** (VAPID adapter off) | Re-engagement, trip alerts | — | — | — | — | — | — |
| Google sign-in | "Google sign-in is coming soon" | **MOCK** | Durable account | — | — | — | — | — | — |
| WhatsApp/SMS delivery | — | **PLANNED** | Reach contacts where they are | — | — | — | — | — | Would be high in India |
| Account (demo) | First-name account, 60-day cookie session, sign-out deletes | **PARTIAL** | Identity without friction | Onboarding | Name | Session | Cookie | Lost cookie = lost account; orphan accounts auto-deleted | Low friction, **fragile** |
| Delete account / clear chat | Me → Delete (cascades), Clear chat | WORKING (E2E e-privacy) | Control | Me | Confirm | Gone | — | — | Trust |
| Privacy page | Plain-language data page | WORKING, **one inaccurate claim** (see Part 4) | Trust | Me → Privacy | — | — | — | — | Trust |
| Time-of-day theme | Day → evening → night palette + dark map | WORKING | Polish | Clock | — | — | — | — | Low (delight) |
| PWA install | Manifest, icons, service worker (offline page only), install card, iOS steps | WORKING (E2E f-mobile-extras) | Lives on the phone | Install card / Me | Tap | Home-screen icon | HTTPS in prod | iOS storage behaviour UNKNOWN | High for retention |
| Offline | Offline page only; no cached app | PARTIAL by design | — | No network | — | "You're offline" | — | Trip screen can't load offline | Acceptable |
| Hosting / HTTPS / domain | — | **BROKEN/UNKNOWN: does not exist** | — | — | — | — | Web + worker + PostGIS + HTTPS | — | Launch blocker |
| Production email | — | **BROKEN/UNKNOWN: does not exist** (Mailpit only) | — | — | — | — | SMTP provider + verified domain | All contact features dead | Launch blocker |

#### Capabilities grouped into systems

| System | Members | Honest status |
|---|---|---|
| **Trusted-circle coordination** | Trip, per-contact links, Share link, contact view, auto-arrival, missed alert, contacts, saved places | **The product.** Works end-to-end locally. Needs SMTP + hosting for production. |
| **Journey / location awareness** | Map, search, route, along-the-way, lighting | Works. Lighting is the only differentiated part. |
| **Community intelligence** | Reports → moderation → aggregation → notes; lit votes | Built carefully and **inert at launch scale.** Lit votes are the only mechanism with a realistic path to data. |
| **AI companion** | Mira + tools + cards | Works. An alternative interface to the same features, not a capability of its own. |
| **Emergency assistance** | 112 links in Mira/SOS card/missed banner/report thanks | **Thin and hard to reach.** |
| **Privacy & identity** | Demo accounts, deletion, retention, encryption at rest, privacy page | Strong design; the account is fragile. |
| **Verification / moderation** | PII detection, holds, bursts, human review, thresholds, suppression | Strong design; **needs a human** to operate. |
| **Everyday utility** | Nearby, search, theme | Commodity. |

---

### 3b. Per-feature user value

| Feature | User situation | Problem at that moment | Current alternative | MIRA advantage | Verdict |
|---|---|---|---|---|---|
| **Trip sharing + auto-arrival + missed alert** | Walking home from metro/college/work, esp. after dark | "Someone should know I'm walking and notice if I don't make it", without her having to remember to text | WhatsApp live location + "message me when you reach" | **Less cognitive load** (arrival is detected, no "reached" text needed), **more reliable** (contacts are told if she *doesn't* arrive; WhatsApp can't know), **more private** (auto-stops at arrival and points are deleted; WhatsApp live location runs for a fixed 15 min/1 h/8 h) | **Strong independent value.** This is the wedge. |
| Share link to anyone | Same, when she hasn't set up contacts | Getting someone watching *now* | WhatsApp live location | Shows destination + ETA and ends itself on arrival | Strong; zero setup |
| Lighting on route | Planning a walk at night, unfamiliar street | "Will this stretch be dark?" | Guessing, asking, Street View | **More informed**, non-fear, factual, with sources | **Moderate, differentiated.** Coverage is patchy (70% "not known" on the test route). |
| Nearby / search / route time | Everyday navigation | Where / how far | Google Maps | None (it *is* Google data) | **Weak independent value**; keep only as the path into a trip |
| Mira chat | Unsure what to do; prefers talking | Deciding | Calling a friend; Maps | Can combine "home + contacts + lighting" into one proposal card; Hinglish | **Weak-moderate.** Slower than buttons for anything it can do. Useful as a *second* way in, not the front door. |
| SOS card | In danger | Get help now | Phone dialler / SOS button on phone | None (it's a `tel:` link behind a chat) | **Weak as built.** Needed, but as a persistent button. |
| Report | After harassment etc. | Be heard; warn others | Tell friends; social media; police | Private, quick, no identity | **Weak independent value at launch**: nothing visible results for weeks or ever |
| Community notes | Before going somewhere | "Has anything been noticed here?" | Reddit, friends, news | Calm, thresholded, moderated | **Near zero at launch** (cold start); potentially strong at scale |
| "Was the way lit?" | Just arrived at night | (For others) | Nothing | Seconds, anonymous, factual | **Strong contribution mechanic**, weak visibility today |
| Inbox | — | — | — | — | Low; replace with push later |
| Time-of-day theme | — | — | — | Delight | Keep, don't invest |

---

### 4. Safety score / map audit

MIRA has **no numeric safety score, heatmap or safe/unsafe colouring**, by design (Mira's prompt forbids safe/unsafe labels; lighting copy says "not a safety rating"). Two things carry implied certainty:

#### Community notes
| Question | Finding |
|---|---|
| Inputs | Approved reports only (`status='approved'`, not withdrawn) |
| Weighting | None: all categories counted separately, never mixed to reach the threshold |
| Granularity | Geohash-6 cell ≈ 1.2 km × 0.6 km (a code comment says "500 m", which is wrong) × time band × category |
| Time sensitivity | Reports eligible 21 days; recency must be today/yesterday/past week; notes live 35 days |
| Number of signals | ≥ 5 independent contributors (one per actor, duplicates collapsed); re-release needs ≥ 5 *new* contributors |
| Confidence | Binary (released or not). The copy says "Multiple reviewed observations", with no count and **no date shown in the UI** (the `week` field is returned but never rendered) |
| One person's influence | Can't publish alone (5 actors). Sybil risk: anonymous actor = one browser cookie, so a determined person with 5 browsers could reach the threshold → mitigated by human moderation, burst hold (≥ 8 actors in 2 h) and aggregation burst rule (80 % in 2 h) |
| Stale / duplicate / malicious | Expiry handles stale; moderator duplicate groups; burst rules; withdrawal re-checks threshold |
| **False-certainty risk** | **The map draws each note as an 11 px orange dot at the exact centre of the 1.2 km cell.** That dot lands on a specific building or street and reads as "something happened *here*." That precision doesn't exist. |

**Recommendation (P0, wording/UX only):** don't draw notes as point markers. Either (a) remove notes from the map and keep them only in the sheet, or (b) draw them as a large translucent area. In the sheet, show the week ("Community note · week of 15 Sep"). Keep the template wording.

#### Lighting
| Question | Finding |
|---|---|
| Inputs | Walker votes (need ≥ 3 distinct voters per ~38 × 19 m cell in 90 days, ≥ 60 % agreement) → OSM `lit=yes/no` within 20 m → Mapillary street-light pole within 25 m |
| Confidence | Shown as source-labelled percentages, plus "Not known yet" |
| Stale | OSM tags can be years old; poles ≠ working lights. The copy says so: "Lights can be out or new ones missing — this is about lighting, not a safety rating." |
| Verdict | **Honest as built.** Small improvement: rename "Lit" to "Mapped as lit" when the source is OSM only, so it isn't read as tonight's truth. |

#### Mira
The persona forbids safe/unsafe labels and crime prediction. It passes lighting to Claude with an explicit "never call a route safe or unsafe" note. **Not tested adversarially today**; add one eval ("Is Kamla Nagar safe at night?") to the release checks.

---

### 5. AI companion audit

**What Mira uniquely helps with (verified in code):**
- Combining context into one proposal: "Take me home" → knows saved Home, contacts' names, walking minutes and lighting after dark → one "Share my trip" card.
- Hinglish/Hindi input ("ghar le chalo", "bachao", "dar lag raha").
- A calm, non-judgemental voice for someone who'd rather talk than tap.

**What Mira must never be trusted to do (and whether code enforces it):**
| Risk | Enforced? |
|---|---|
| Start a trip or send anything without a tap | **Yes**: tools only return cards |
| Claim to be emergency help / guarantee safety | Prompt + E2E c-mira ("never claims to be help itself") |
| Declare a place safe / predict danger / judge a person | Prompt only; not tested with Claude live |
| Legal / medical instructions | Not addressed in prompt. Add one line. |
| See coordinates | **Yes**: places go to Claude as names and opaque refs |

**Is AI the interface or a feature?** A feature, and today a slightly counterproductive one in the moment that matters most:
- Replies take ~4 s (observed `POST /api/mira` 3.9–4.2 s) on `claude-opus-5` at low effort.
- "I feel uneasy" gets a clarifying question instead of options. The scripted fallback does better.
- It requires sign-in; the chat tab is one of four equal tabs.

**Conclusion:** keep Mira as the *voice* of the product (nudges, copy) and as a secondary way in. Don't make her the front door or the emergency path. Consider a faster model for latency and cost (a decision for the owner; see Part 6).

---

### 6. Mobile / PWA reality

| Check | Finding |
|---|---|
| Viewport / layout | Built mobile-first; safe-area insets; tested at 375 × 812. The first "Around you" content sits under the floating tab bar at peek height (minor) |
| Manifest | `src/app/manifest.ts`: name, short name, standalone, portrait, theme colour, 192/512/maskable icons |
| Service worker | `public/sw.js`: offline page + static assets only; never caches pages, `/api`, `/t`, `/invite` (privacy-correct) |
| Install | Android: captured `beforeinstallprompt` → install card. iOS: Share → Add to Home Screen instructions. E2E verifies installability |
| Home-screen icon | Present |
| Offline | Offline page only; acceptable |
| Notifications | None (no push). **MIRA can't tell her anything when closed** |
| Location permission | Asked in onboarding step 2 after an explanation. Denied → honest banner + search still works |
| Background location | **Not possible in browsers.** Trip needs the screen on (Wake Lock). Contacts see the last spot, and the missed alert still fires. Honest copy exists |
| Deep links | `/t/<token>` and `/invite/<token>` work as plain URLs |
| Sharing | Web Share API with clipboard fallback |
| iPhone | Wake Lock is supported on recent iOS Safari; no background GPS; **cookie/storage separation between Safari and the installed web app is UNKNOWN. Test before launch** (an account made in Safari may not exist in the installed app) |
| Android | Best experience (install prompt, Wake Lock) |

**Distribution today:** a responsive web app at an HTTPS URL, installable as a PWA. No app store. A native wrapper is only needed later, for background location.

---

# Part 2 — Wedge analysis

*Derived from Part 1. Only capabilities marked WORKING count as support.*

### 1. Candidate wedges

Scores run 1–5, and **5 is always the favourable end**: frequent, urgent, well supported, *little* behaviour change, *little* network dependency, high standalone value, clearly different.

| Wedge | User frequency | Urgency | Existing product support | Behaviour change required (5 = little) | Network dependency (5 = none) | Standalone value | Differentiation | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Emergency tool | 1 | 5 | 1 | 2 | 5 | 2 | 1 | 17 |
| B. Personal safety companion (before/during/after) | 3 | 3 | 3 | 3 | 5 | 3 | 2 | 22 |
| C. Community safety network | 2 | 2 | 2 | 1 | 1 | 1 | 3 | 12 |
| D. Safety intelligence layer (lighting + notes) | 3 | 2 | 3 | 3 | 3 | 3 | 4 | 21 |
| **E. Trusted-circle coordination: "text me when you reach", automated** | **5** | 3 | **5** | **4** | 4 | **5** | 4 | **30** |
| F. E + lighting as the informed layer + one-tap lighting as the community input | 5 | 3 | 5 | 4 | 4 | 5 | 5 | **31** |

Why each loses or wins:
- **A. Emergency tool.** Phones already ship an SOS gesture (Android Emergency SOS, iPhone side-button SOS), and nobody opens a new app in a crisis unless it's already a habit. MIRA's emergency support is a `tel:112` link behind a chat. Rare use means nobody keeps it installed.
- **B. Companion.** True but vague. "Companion" names a feeling, not a job, and it's hard to understand in 10 seconds.
- **C. Community network.** Zero community output exists (0 releases, 0 lit votes). It needs 5 independent reports per 1.2 km cell per 3 weeks plus a staffed moderator. It fails criteria 3, 9 and 10 below.
- **D. Intelligence layer.** Lighting works from day one on OpenStreetMap + Mapillary, which is genuinely new information. But it's a *supporting* reason to open the app, not a *habit*.
- **E. Trusted-circle coordination.** It replaces a ritual that already exists: *"ghar pahunch ke message kar dena"* / *"text me when you reach."* MIRA does both halves automatically: it notices arrival, and it tells people if arrival *doesn't* happen. That second half is the thing no WhatsApp habit can do. It works with one user and one friend.
- **F.** E is the habit, lighting makes each walk more informed, and the one-tap "Was the way lit?" at arrival is the contribution. Every piece is already built.

#### The ten criteria, applied to F

| # | Criterion | F |
|---|---|---|
| 1 | Understood in ~10 s | ✅ "Share your walk; your people see you get home." |
| 2 | Value quickly | ✅ Share link → WhatsApp works on the *first* trip with zero contacts set up |
| 3 | Works with a small community | ✅ Needs only her and one person she already texts |
| 4 | Community makes it better | ✅ Lighting votes fill the "Not known yet" part of every route; viewers of shared links become users |
| 5 | Useful outside emergencies | ✅ It's the everyday commute |
| 6 | No fear mindset | ✅ "Let them know you got home" is care, not danger |
| 7 | No institutions needed | ✅ |
| 8 | Works on a phone | ✅ With the honest caveat that the screen must stay on (browser limit) |
| 9 | No unrealistic moderation | ✅ Lighting votes need no moderation (thresholded, about streets not people); reports stay secondary |
| 10 | Supported within 6 hours | ✅ All built; needs hosting + SMTP + copy fixes |

---

### 2. Conclusions

#### PRIMARY JOB TO BE DONE
> **When I'm walking somewhere, especially home after dark, MIRA helps me let the people I trust see me get there, and tells them if I don't, so that I don't have to remember to text "reached" and nobody has to keep checking on me.**

#### CORE PRODUCT PROMISE
> **Share your walk in one tap: your people see you get home, and they're told if you don't.**

#### WHY KEEP MIRA INSTALLED? (three reasons)
1. **The walk home is one tap:** 🏠 Home → Share. It switches itself off when you arrive.
2. **Nobody has to watch:** if you don't arrive, your people are told. Neither side has to remember anything.
3. **You know how lit the way is** before you walk it, and that gets better every night.

#### WHY OPEN IT? (triggers)
- Leaving college, work, a metro or bus stop, a friend's place, especially after about 7 pm.
- Someone says "message me when you reach."
- Walking to an unfamiliar address (route + lighting).
- Feeling uneasy mid-walk ("share it now", or Mira).
- Right after arriving (the one-tap lighting question).
- A friend shares *their* walk with you (the viewer becomes a user).

#### WHY CONTRIBUTE?
Because it costs **one tap at the moment of relief** ("You made it 🎉 — Was the way lit?"), asks nothing personal, and she has already benefited: the lighting bar she saw before walking exists because others tapped. It's reciprocity at no cost. It's also *about streets, not people*, so it never feels like reporting on someone. Reports remain for when something actually happened; they're the right thing to offer, but they aren't the engine.

#### WHY DOES COMMUNITY MAKE IT BETTER? (the compounding loop)
1. Each night walk ends in one tap → **~40 m street cells** get a vote.
2. When 3 different walkers agree on a cell within 90 days, that cell turns from "Not known yet" into "Lit" or "Reported dark" on everyone's routes.
3. Popular walks (campus → metro, metro → PG lanes) fill in first, which is exactly where most people walk.
4. Better lighting coverage → more reason to plan a walk in MIRA → more trips → more taps.
5. **Separately and more importantly early on:** every shared trip shows MIRA to 1–3 people who care about her (often other women). The shared-link page is the product's best advert and currently has **no "get MIRA" invitation**.

---

### 3. Ideal behavioural model (ignoring current navigation)

MIRA should feel like **a friend who walks you home and remembers which streets are dark**, not a map full of warnings.

| # | Scenario | Trigger | Action | MIRA response | Result |
|---|---|---|---|---|---|
| 1 | Normal day | Opens casually | Glances | "Evening, Asha. Walking home later? 🏠 Home is 18 min, mostly lit." Home chip ready | Knows the walk home is one tap away |
| 2 | Going somewhere unfamiliar | Friend's new PG address | Where to? → paste/search | Walk time, lighting bar with sources, "Share my walk" | Informed decision; sharing pre-armed |
| 3 | Travelling alone at night | Leaves metro at 10 pm | 🏠 Home → Share my walk | Contacts get a link; trip screen with ETA; screen stays on | Walks without texting anyone; arrival detected; people see "arrived 🎉" |
| 4 | Uncomfortable, not in danger | Street feels off | Taps "I feel uneasy" (Home or Mira) | **Instantly, no AI wait:** [Share my walk now] [Call someone] [Open places nearby] [Call 112 — small] | Someone is watching within 10 s; a lit, open place is nearby |
| 5 | Immediate danger | Being followed / threatened | Taps the always-visible **Emergency** pill | Phone dialler with 112 (one tap). During a trip: also "Tell my people now" (post-launch) | Call connects; contacts see the live dot |
| 6 | Reporting for the community | Arrived after a dark stretch / saw harassment | "Was the way lit?" (1 tap) · or Report (3 taps) | "Thanks — that helps the next person here." Report: private, reviewed | Cell vote recorded; report queued |
| 7 | Someone else benefits | Another walker plans the same street next week | Opens route | Lighting bar now shows "Reported dark 15% · from MIRA walkers" | Chooses the main road or shares her walk |

---

### 4. Community loop design

**Use → value → tiny signal → better intelligence → more value for others → more use**

| Mechanism | Friction | Supported today? | Launch decision |
|---|---|---|---|
| **"Was the way lit?" after a night arrival** | 1 tap, ~2 s | ✅ Built (`LitQuestion`, `/api/lighting/vote`) | **Primary.** Widen when it's asked (today only on an *arrived* close at night with the route loaded; add "End trip"; see Part 6 P1-1) |
| Incident report | 3–5 taps, ~20 s | ✅ Built | Keep, secondary. Honest expectation-setting copy |
| Long-press map → report | 2 taps | ✅ Built | Keep |
| Route feedback "felt okay / uncomfortable" | 1 tap | ❌ | **Don't build.** Perception about *areas* encodes bias (class, caste, religion, migrants) and becomes defamation of neighbourhoods. Keep signals about infrastructure (light, footpath, open places), never about people or groups |
| Confirm / disagree on a note | 1 tap | ❌ | Post-launch, once notes exist |
| Stale-flagging ("light fixed now") | 1 tap | Partly (votes expire after 90 days; newer votes win in time) | Post-launch |
| Trusted contributors | — | ❌ | Not needed until volume exists |
| Passive signals (e.g. inferring lit/dark from walking speed) | 0 taps | ❌ | **Never** without explicit opt-in; it turns trips into a location dataset |

**What does an individual contribute?** One lighting answer per night walk; occasionally a report.
**How long does it take?** ~2 seconds (lighting); ~20 seconds (report).
**What happens immediately?** Lighting: the vote is stored per ~40 m cell, and "Thank you 💛 That helps the next person walking here at night." Report: private; "reviewed by a person."
**How does MIRA avoid treating one person's perception as truth?** Lighting needs ≥ 3 distinct voters and ≥ 60 % agreement, otherwise it says nothing. Notes need ≥ 5 independent, human-approved contributors in the same cell, time band and category. Neither ever shows a single person's input.
**How does information decay?** Lighting votes count for 90 days and are deleted at 120. Reports are deleted at 30 days. Notes expire after 35 days, and a changed note needs 5 *new* contributors.
**How is confidence represented?** Source-labelled shares ("Lit 30% · Not known yet 70% · From OpenStreetMap"), never a score. Needed: show the note's *week*, and label OSM-only lighting as "mapped as lit."
**How does the user see WHY?** Lighting already names its sources. Community notes need a one-line "Why am I seeing this? At least five people reported something similar in this area in the past few weeks; a person reviewed each one."

---

### 5. Hero experience

**"Walk me home."** 🏠 Home chip → **Share my walk** → live trip → auto "You made it 🎉" → her people see "Asha arrived" → one tap "Was the way lit?"

It demonstrates everything MIRA stands for: it knows her situation (time, home, route, lighting), gives useful context (walk time, lit share), keeps her connected (live link), lets the community help (lighting others contributed), and lets her help someone else (her tap).

#### Proposed mobile home hierarchy

```
┌──────────────────────────────────────┐
│ Evening, Asha 🌆         [Emergency] │  ← always visible; tel:112, calm pill, not red
│ 7:42 PM · Kamla Nagar                │
│                                      │
│          (map, your dot)             │
│                                      │
├──────────────────────────────────────┤
│ Walking somewhere?                   │  ← PRIMARY
│ [🏠 Home 18 min] [🎓 College] [+]    │
│ [ Where to? …                      ] │
│ Your walks are shared with Mum ✓ Priya … │
│ ──────────────────────────────────── │
│ I feel uneasy · Talk to Mira · Report│  ← SECONDARY (max 3, quiet)
└──────────────────────────────────────┘
      Home     Mira     Report     Me
```

- **Primary:** Where to / saved places → *Share my walk*.
- **Secondary (3):** I feel uneasy (instant options), Talk to Mira, Report something.
- **Emergency:** one pill in the top card on Home and on the Trip screen, `tel:112`. Present, not loud.
- **Community:** the post-arrival lighting tap; long-press the map to report. No separate "community" tab.

---

### 6. Messaging (landing page / first screen)

**Hero (≤ 8 words):** **Walk home. Your people will know.**

**Supporting line:** Share your walk in one tap. The people you trust see you on the map until you arrive, and they're told if you don't.

**Three things MIRA helps with**
1. **Share your walk home**: one tap to WhatsApp or your saved people. It switches itself off when you arrive.
2. **Nobody has to keep checking**: if you don't arrive, your trusted contacts get one message. No "reached?" texts needed.
3. **See how lit the way is**: before you walk, see which stretches are lit, from street maps and from walkers like you.

**Community:** After a walk after dark, MIRA asks one thing: *was the way lit?* Your tap, with no name and no route kept, shows the next person which stretches are dark. The more of us walk with MIRA, the fewer streets say "not known yet."

**Open source:** MIRA is built in the open. Anyone can read exactly how it handles your location, and help make it better. *(Use only once the repository is public.)*

**Privacy:** No location history. Your location is shared only during a walk you start, only with people you choose, and deleted when you arrive.

**CTA:** **Share my first walk**, then secondary: *Add MIRA to your home screen.*

**Always-present line, small:** MIRA isn't an emergency service. In danger, call 112.

*Avoid:* "AI-powered", "empowering", "safe/safer", "protect", red, shields, SOS iconography as the hero.

---

# Part 3 — User need audit

*Is the product needed, and what could go wrong when real women rely on it? Each issue is classified **LAUNCH BLOCKER · IMPORTANT SOON · ACCEPTABLE FOR BETA · NOT IMPORTANT**.*

### 1. The need

| Dimension | Assessment |
|---|---|
| **Severity** | Real and ordinary. Families already run a ritual around it ("reach home and message me"), and many women change routes, times and clothes because of it. MIRA doesn't need to dramatise it. |
| **Frequency** | High for the core audience: students, working women and PG/hostel residents who walk the last mile from a metro, bus or college, often daily, often after dark. Low for people who drive or cab door to door. |
| **Existing behaviour** | WhatsApp live location (fixed 15 min / 1 h / 8 h), "reached" texts, staying on a call while walking, walking in pairs, avoiding late travel. |
| **Switching friction** | Low for her (open MIRA instead of WhatsApp → share). **Moderate for her contacts:** accepting an *email* invite, in a country where family communication is WhatsApp. The Share-link path avoids this. |
| **Trust she must place in MIRA** | That her location is really deleted; that an alert really goes out if she doesn't arrive; that it won't embarrass her with false alarms; that nothing she reports can identify her. |

### 2. Risks and issues

#### False confidence
| Issue | Evidence | Class |
|---|---|---|
| Trip with no contacts says *"I'll still check that you arrive"* and *"If you close MIRA, they'll see your last spot"* | `TripScreen.tsx`. Nobody else is told anything; the "check" is an in-app note to herself; "they" don't exist | **LAUNCH BLOCKER** (copy) |
| Welcome promises "Share your trip live in one tap" | True only after a destination is chosen, and for contacts only after an email invite is accepted | **LAUNCH BLOCKER** (copy; cheap) |
| Missed alert goes by **email**, which contacts may not read for hours | `emailContact` is the only channel | **IMPORTANT SOON** (WhatsApp/SMS/push). For beta: say "by email" in the UI |
| New sending domain → alerts land in **spam** | No SPF/DKIM domain exists yet | **LAUNCH BLOCKER** (verified domain; invite copy: "add us to your contacts") |
| Auto-arrival needs the screen on; pocketed phone → no arrival → false alarm at ETA+10 | Browser limit, documented in copy | ACCEPTABLE FOR BETA. It fails *loud*, which is the right direction. Add "Tap *I'm here* if you close MIRA" |
| Lighting "Lit 30%" from OSM can be read as tonight's state | `LightingSummary.tsx`; disclaimer present | ACCEPTABLE FOR BETA (relabel "Mapped as lit" soon) |
| Community note drawn as a precise orange dot at a 1.2 km cell's centre | `WorldMap.tsx` `notes` layer | IMPORTANT SOON (no notes will exist for weeks; fix before any appear) |
| Community note has no date in UI | `week` returned but not rendered | IMPORTANT SOON |
| Report copy "Reviewed by a person" | True only if someone moderates | **LAUNCH BLOCKER** *as a commitment*: the owner must check `/admin` during beta, or the copy must change |

#### Network cold start
| Community size (Delhi) | What works | What doesn't |
|---|---|---|
| **5 users** | Everything in the hero: trips, links, arrival, missed alerts, OSM/Mapillary lighting, Mira | Community notes (need 5 *agreeing* people in one cell, time band and category). Walker lighting (needs 3 per 40 m cell) |
| **50 users** | Same, plus walker lighting may start appearing on shared corridors (campus ↔ metro) within weeks | Notes still very unlikely |
| **Thousands** | Notes become possible in dense areas | Moderation load becomes real |

**Verdict:** the wedge works at N = 1. The community layer should be *promised* only as "gets better as more people walk", never as a present feature. **ACCEPTABLE FOR BETA**, provided the landing copy doesn't sell community notes.

#### Contribution burden
Lighting: 1 tap, ~2 s, but **asked only when a trip closes as *arrived* (auto or "I'm here") between 18:00 and 06:00 and the route was already loaded on the trip screen**. Trips ended with "End trip" never see it. **IMPORTANT SOON** (also ask after "End trip"; fetch the route on close). Report: 3–5 taps; fine.

#### Moderation burden
| Abuse | Current defence | Class |
|---|---|---|
| Incorrect / exaggerated | Nothing publishes alone; ≥ 5 independent contributors; human approval; fixed template wording | ACCEPTABLE |
| Malicious / revenge against a shop or lane | Needs 5 "independent" actors; anonymous actor = one browser cookie (spoofable with effort); burst holds (≥ 8 actors / 2 h at intake; 80 % within 2 h at release); moderator | ACCEPTABLE FOR BETA |
| Discriminatory (stigmatising a basti, a community, migrants) | Templates never name people or groups; cell-level; moderator | IMPORTANT SOON: write a public moderation policy that says reports about *who lives somewhere* are rejected |
| Defamatory (naming a person, plate, shop) | PII detection holds; redaction required before approval; free text never published | ACCEPTABLE |
| Stale | 21-day eligibility, 35-day note life, 30-day report deletion | ACCEPTABLE |
| Duplicate | Moderator duplicate groups; one per actor | ACCEPTABLE |
| No moderator online | Unreviewed reports never publish and auto-delete in 30 days | ACCEPTABLE (safe default) |

#### Emergency reliability: workflows that cannot fail
| Workflow | Single point of failure | Class |
|---|---|---|
| Missed-arrival alert | **Worker process** + **SMTP**. Trip start is refused while the worker is unhealthy (good), but a worker dying mid-trip means no alert | **LAUNCH BLOCKER**: host the worker with auto-restart and point an uptime monitor at `/api/health/ready` |
| Trip start | Worker heartbeat; Google Routes (walk estimate; falls back) | LAUNCH BLOCKER (same) |
| Live link | Web + DB | LAUNCH BLOCKER (hosting) |
| Call 112 | A `tel:` link, but reachable only inside Mira / after a missed check-in | **LAUNCH BLOCKER**: add a persistent Emergency pill (Home + Trip) |
| Arrival detection | Foreground GPS | ACCEPTABLE (fails toward a false alarm, not silence) |

#### Cost / abuse of paid APIs (public URL)
| Issue | Evidence | Class |
|---|---|---|
| API keys were pasted in chat and are "demo" keys | Memory notes + README | **LAUNCH BLOCKER**: rotate all four (Anthropic, Google server, Google browser, Mapillary) |
| Browser Google key must be restricted to the production domain; the server key to specific APIs | README "Maps for production" | **LAUNCH BLOCKER** |
| Mira on `claude-opus-5`: accounts are free to create (20/h per IP) and each gets 400 messages/day | `api/auth/demo`, `api/mira` limits | **LAUNCH BLOCKER**: set a monthly spend limit on the Anthropic workspace; lower the per-user daily cap for beta |
| Geo endpoints allow 480 req/min per IP, anonymous | `api/geo/*` | **LAUNCH BLOCKER**: Google Cloud quotas/budget alerts |

#### Everyday usefulness
Enough for the core audience (anyone with a regular walk). **Not** enough for people who don't walk. Nearby places and search are commodity. Lighting is the non-emergency reason to open it. **ACCEPTABLE FOR BETA**: target the launch at people who walk home.

#### Scope gaps worth knowing
| Gap | Class |
|---|---|
| **Walking only.** Auto/cab/metro trips get a walking ETA or are refused over 25 km. Many night journeys are by auto/cab | IMPORTANT SOON ("I'm not walking" → pick an ETA manually; the domain already validates custom ETAs, `validateNewEta`) |
| Location denied → can't start a trip at all (button disabled without a fix) | IMPORTANT SOON |
| No way to recover an account (name-only; cookie) | IMPORTANT SOON (Google/email sign-in) |
| iPhone: does the home-screen app share Safari's session? | **LAUNCH BLOCKER to *test*** (if not: tell iOS users to install *before* onboarding) |
| No push to the traveller | IMPORTANT SOON |
| Emergency number fixed at 112 | ACCEPTABLE (India launch) |
| Aggregation weeks run on IST Mondays for a "worldwide" app | NOT IMPORTANT (India launch) |

---

### 3. First-time-user friction audit (measured on a 375 px phone)

| Time | What she sees / understands | Friction |
|---|---|---|
| **T+0 s** | Purple orb, "Hi, I'm Mira — Your walking companion." | Leads with an AI character, not a benefit. No preview image when the link is shared on WhatsApp/Instagram |
| **T+10 s** | Three bullets; the real promise is buried in bullet 2 | "Why this exists" isn't said: *your people see you get home* |
| **T+30 s** | Location prompt explained ✓ → name field | A name field before any value; "Google sign-in is coming soon" signals unfinished |
| **T+40–60 s** | Map with café/bus pins, greeting, nudge "Save your home" | First value = a map she already has. The distinctive thing needs a destination. **No meaningful action done yet** |
| **T+2–3 min** | Search Home → Save as 🏠 → (optional) Me → add contact → contact must open email | Adding a contact is a form (name + email), then waiting on someone else |
| **T+5 min** | Would she keep it? Only if she saw a trip work, ideally sharing to a friend on WhatsApp and the friend seeing "arrived 🎉" | Nothing in onboarding gets her to that moment |

**Unnecessary or harmful steps:**
1. The welcome carousel is centred on Mira instead of the promise. **Fix copy (P0).**
2. The name step happens before value. Keep it (it's one field and makes greetings personal), but move the "coming soon" line elsewhere.
3. Contacts are only via email invite. For beta, make **"Share link" → WhatsApp** the first-run path and email contacts the "set once, automatic forever" upgrade.
4. Four equal tabs (Home, Mira, Report, Me) dilute the hero; Report and Mira sit at the same level as the core action.
5. Empty states: "Around you" places ≠ reason to stay. The first nudge should be **"Where do you walk home to?"**, which saves Home in one step.
6. No emergency affordance visible anywhere on first run.

---

### 4. Release test scenarios

Actual behaviour comes from today's walkthrough, the code and the existing E2E suite.

| User | Scenario | Expected | Actual | Gap | Severity |
|---|---|---|---|---|---|
| **A** New user | Opens a shared URL | Understands "share my walk home" in 10 s; one useful action within 60 s | "Hi, I'm Mira"; 3-step onboarding in ~40 s; lands on a nearby-places map | Promise unclear; first action not the hero | **High** (P0 copy + nudge) |
| **B** Unfamiliar destination | Search address | Walk time, lighting with sources, share option | Works: "21 min · 1.5 km · Lit 30% · Not known 70% · From OpenStreetMap"; along-the-way chips; no notes | "Along the way" chips not tappable; "Lit" reads as current | Low |
| **C** Travelling alone | Night walk home | One tap to share, people follow, arrival detected | Works for walking (E2E a); Share link → share sheet works; contacts need an accepted email invite | No mode for auto/cab; email-only contacts | Medium-High (P1) |
| **D** Uncomfortable | "I feel uneasy" | Immediate options: share walk now, a nearby open place, call someone | Claude asked a clarifying question, **no cards**, ~4 s (the scripted fallback does show places + share-home card) | Regression; delay | **High** (P0 prompt, P1 instant card) |
| **E** Urgent | Being followed | One tap to 112 from anywhere; contacts can see her | No emergency control on Home/Trip; via Mira ~4 s + reading → "Call 112" card | Emergency path too slow | **High** (P0 pill) |
| **F** Contributes | Arrives at night | One-tap lighting answer | Shown only when the trip closes as *arrived* (auto or "I'm here") 18:00–06:00 with the route loaded; never after "End trip" | Narrow trigger | Medium (P1) |
| **G** Benefits later | Plans same street next week | Sees lighting from walkers | Needs 3 agreeing walkers per 40 m cell in 90 days; 0 votes exist | Expected at launch; don't over-promise | Medium (copy) |
| **H** Malicious contributor | Spams reports / Mira | Nothing public; costs bounded | Reports: rate limits + thresholds + moderation ✓ (E2E d). Mira: 20 new accounts/h/IP × 400 msgs/day on Opus | **Cost exposure** | **High** (P0 spend caps) |
| **I** Denies location | Blocks permission | Can still plan and share somehow | Honest banner; search works; **"Share my trip" disabled without a fix**; report can pick a place by search | Can't share at all | Medium (P2) |
| **J** Weak network / mobile browser | 2G-ish, flaky | Clear states, nothing silently lost | Upload failure banner on trip ("Can't reach MIRA right now… I'll still check in"); report keeps the text on failure; offline page; Mira apologises; the contact view shows "Can't refresh" | Trip screen can't *load* offline (pages aren't cached, by design) | Low-Medium |

**Also run before launch (real devices):** Android Chrome install + full trip; iPhone Safari → Add to Home Screen → does the session survive?; a missed alert reaching a Gmail inbox (not spam); the contact view on a phone that has never seen MIRA.

---

# Part 4 — Privacy reality

*What the code actually does with personal data (not what it intends). Sources: `db/migrations/*`, `src/server/**`, `src/app/api/**`, `public/sw.js`, `src/app/(app)/privacy/page.tsx`.*

### 1. What is collected, where, and for how long

| Data | When collected | Stored where / how | Kept for | Who can see it |
|---|---|---|---|---|
| **First name** | Onboarding | `users.name` (plaintext) | Until account deletion, or automatically when the 60-day session expires (demo accounts are then deleted by the worker) | Her; her contacts (first name only, on links/emails); Claude (per message); operators with DB access |
| Email / avatar | Not collected (Google sign-in not built) | `users.email`, `avatar_url` exist, unused | — | — |
| Session | Sign-in | Cookie (HttpOnly, `__Host-` + Secure in prod); DB stores only a keyed hash | 60 days | — |
| **Home-screen location** | While Home is visible | **Browser memory only**; server requests use it transiently. Google calls are rounded where possible: ~1 km for search bias, ~100 m for area names/nearby; **routes send the exact start point** | Not stored | Google Maps Platform (server-to-server) |
| **Saved places** (Home, College…) | When she saves one | `saved_places`: label, emoji, **exact lat/lon (plaintext)**, address text | Until removed / account deleted | Her; operators with DB access. **The most sensitive data at rest**: a woman's name + her home point |
| **Trusted contacts** | When she adds one | `contacts`: name (plaintext), **email AES-256-GCM encrypted**, keyed hash for dedupe | Until removed / account deleted | Her (masked hint `pr••••@gmail.com`); the email goes to the SMTP provider when sent |
| **Live trip location** | Only during a trip she starts, only while the trip screen is open | `trip_locations`: last **20** points (lat, lon, accuracy, time) | **Deleted the moment the trip closes**; the trip row is purged 6 h after close | Her; each accepted contact via their own link; anyone she gave her own "Share link" to. Contacts see **only the latest point** |
| Trip destination | Trip start | `journeys.dest_name` **plaintext + encrypted copy**, dest lat/lon | ≤ 6 h after close | Contacts (name on link/email) |
| Trip links | Trip start | Only keyed hashes + an encrypted copy of each token | With the trip | Link holders |
| **Mira chat** | When she messages | `mira_messages` JSON. **Her own messages are stored verbatim.** Mira's replies are scrubbed of area names, nearby place names and walking times; nearby-place cards aren't stored | 30 days, or "Clear" | Her; **Anthropic** receives each message + last 12 turns + time, area name, saved place labels, contact first names, trip status, **never coordinates**; operators |
| Inbox | Events | `notifications` | 30 days | Her |
| **Reports** | Submission (anonymous or signed in) | `reports_private`: ~1.2 × 0.6 km cell (never the point), category, recency bucket, time band, hour-truncated time, **narrative AES-256-GCM encrypted**, pseudonymous actor hash, user id if signed in | ≤ 30 days | Moderator (decrypted narrative); nobody else |
| Public community notes | Weekly aggregation | `aggregate_releases`: cell, band, category, fixed template sentence; contributors stored privately | 35 days (+35 before purge) | **Public** (anyone near that cell) |
| **"Was the way lit?"** | After a night arrival | `lit_votes`: ~38 × 19 m cell, value, **day** (no time), `voter_hash = HMAC(key, user:cell:week)` | Counts 90 days, deleted at 120 | Aggregated (≥ 3 agree) on everyone's routes |
| Anonymous actor cookie | First anonymous report | Cookie + hashed session | Discarded on sign-in (reports re-keyed) | — |
| Rate-limit counters | Every limited request | Keyed hashes of IP / user + bucket | Short windows, purged | — |
| Server logs | Every request | Next.js logs method + path; app logs events with ids (`trip.started`, contact count), no coordinates | Host-dependent | Operator / host. **`/t/<token>` and `/invite/<token>` paths are bearer tokens**: the proxy must not log full URLs (README says so) |
| Admin audit | Moderator actions | Session id + action + reason code (fixed codes, no narrative) | 90 days | Operator |
| Offline cache | Service worker | Offline page + static assets only; **pages, `/api`, `/t`, `/invite` never cached** | Until app update | — |

### 2. Direct answers

- **What is public?** Only community notes (template sentences for a ~1.2 km cell, after ≥ 5 independent approved reports) and lighting shares on routes (after ≥ 3 agreeing voters per 40 m cell). Nothing else. No profiles, no scores, no heatmaps.
- **What can community members see?** Those two aggregates. They can never see another user, a report, a vote or a trip.
- **What can contacts see?** First name, destination name, ETA, the latest point and when it was taken, only while the trip is open; then "arrived/ended" for 30 minutes; then nothing.
- **What can administrators see?** Through the admin UI: report text (decrypted) and structured fields. **Through database access (anyone holding `DATABASE_URL` + `DATA_ENCRYPTION_KEY`)**: everything above, including names, saved home points, contact emails and chat. Encryption at rest protects against a DB-only leak, not against the operator.
- **Is identity tied to reports?** Signed-in reports store `user_id` and an account pseudonym (for independence counting). They're never shown to anyone but the moderator, who sees no user identity in the UI. On account deletion they're re-keyed to a random pseudonym.
- **Can data be deleted?** Yes. Me → Delete removes places, contacts, trips, chat, inbox and sessions (cascade). Reports stay ≤ 30 days, unlinked. Chat can be cleared separately.
- **Can she participate pseudonymously?** Yes. The account is a first name only; reports work without an account.
- **Permissions requested:** Location only, asked on the onboarding step that explains why (not on page load). No notifications, contacts, camera or microphone. **Nothing is requested before it's needed.** ✓
- **Are lighting votes anonymous?** *Pseudonymous.* No row names a person or links cells into a route. But anyone holding `SESSION_SECRET` can recompute `HMAC(user:cell:week)` for a known user and test whether that user voted in a given cell, so an operator could confirm "did user X walk street Y this week?" The privacy page's "nothing links one stretch to the next" is true for the stored data, not against the key holder.

### 3. Claims that aren't accurate today

| Where | Claim | Reality | Fix |
|---|---|---|---|
| Privacy page, "Chatting with Mira" | "saved… without anything about where you were" | **Her own messages are stored verbatim** ("I'm at Hauz Khas metro" is saved for 30 days). Only Mira's replies are scrubbed | **P0:** reword to "Mira's replies are saved without area names, distances or nearby places; your own messages are saved as you typed them. Clear any time." (or scrub user text too, P1) |
| Trip screen, private trip | "I'll still check that you arrive" / "they'll see your last spot" | No one else is told | **P0** copy fix (see Part 6) |
| Privacy page, "Street lighting" | "not your name, your account…" | True of what's stored; recomputable by the key holder (above) | P1: add "stored with a keyed code that stops double votes" |
| Anywhere | — | MIRA does **not** claim end-to-end encryption or anonymity guarantees ✓ | Keep it that way |

### 4. Minimum-data principle for launch

1. **Collect only what a feature needs at the moment it runs.** Today's design already follows this. Keep it as a review rule for every PR (see Part 5, protected areas).
2. **Location is stored only during a trip she starts, and deleted when it ends.** Never widen this without an explicit, reversible opt-in.
3. **Saved places are the exception worth tightening:** encrypt `saved_places.lat/lon` + `address` at rest like contact emails (P1), or at minimum keep them out of every log and export.
4. **Don't add analytics** that capture location, destinations or chat. If usage metrics are needed for launch, count events server-side (trips started / arrived / missed), with no coordinates or user ids in analytics.
5. **No third-party scripts** in the client (the CSP already enforces per-request nonces and restricts origins).
6. **Operator access:** one person holds the production secrets during beta; the DB isn't reachable from the public internet; backups expire ≤ 30 days (README's restore rule: run `purgeExpired` before serving traffic).
7. **Processors to name on the privacy page:** hosting provider, Google Maps Platform, Anthropic, the SMTP provider, Mapillary/OpenStreetMap (bounding boxes only).

---

# Part 5 — Open-source & community model

*Goal: anyone can read, question and improve MIRA; nobody can push code into the thing women rely on to get home without review. Kept deliberately light for a one-to-three-person project.*

### Current repository state (checked)
- No `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` or `.github/`. `package.json` says `"private": true`. No git remote configured.
- **No secrets in git history** (searched all commits for Anthropic, Google and Mapillary key patterns: 0 hits). `.env.local` is ignored; only `.env.example` is tracked. ✓
- Four V0 spec documents at the root describe a product that no longer exists. Move them to `docs/archive/v0/` before going public, so contributors don't build against them.
- 169 unit/integration tests + 17 E2E scenarios exist: a strong base for "CI must pass."

---

### 1. What's public and what's protected

#### Public repository (everything, by default)
- The whole app: `src/` (screens, API routes, domain rules, providers, worker), `db/migrations`, tests, scripts.
- **The safety algorithms, in full**: aggregation thresholds (`src/domain/aggregation.ts`), lighting rules (`src/domain/lighting.ts`), moderation rules (`src/domain/moderation.ts`), PII detection (`src/domain/report/text.ts`), Mira's persona and tool rules. *Transparency about how a safety product decides things is part of the product.*
- Docs, product principles, moderation policy, privacy page source, `.env.example`.
- Issue tracker, Discussions, roadmap.

#### Private / protected (never in the repo)
| Item | Why |
|---|---|
| Production secrets (`SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `DATABASE_URL`, API keys, SMTP credentials) | Security |
| Moderator password hash / admin sessions | Security |
| Production data, backups, logs | Users' private data |
| Hosting configuration containing addresses or credentials | Security |
| **Abuse-tuning values actually used in production** | The code keeps sensible public defaults; production can override burst thresholds and rate limits through environment variables so attackers can't pace themselves exactly (small P2 change: read `BURST_*` and `REPORT_LIMITS_*` from env with the current values as defaults) |

Nothing else needs to be private. **Don't close code for "competitive" reasons.**

#### License and name (owner's decision; recommendation)
- **AGPL-3.0** for the application: anyone can use and change it, but anyone who *runs* a modified MIRA as a service must publish their changes. For a safety service, that protects users of forks.
- **Keep "MIRA" as a name the project controls** (a short trademark note in the README): forks are welcome under a different name, so no one can run an unreviewed "MIRA" that women mistake for this one.
- Docs: CC BY 4.0.

---

### 2. Contribution flow

```
Issue or Discussion  ─→  (protected area? → short written proposal)  ─→  Pull request
      ─→  CI: lint · typecheck · unit + integration · E2E · bundle secret scan
      ─→  Maintainer review  ─→  (protected area? → second review: privacy/safety checklist)
      ─→  Merge to main  ─→  Staging deploy, smoke test  ─→  Maintainer promotes to production
```

- **Nobody deploys but maintainers.** Merging ≠ releasing. Production deploys are manual promotions of a tested commit.
- `main` is protected: PR required, CI green, 1 approval (2 for protected areas), no force-push.
- Every PR template asks: *Which product principle does this serve? Does it collect, store, show or send any new data?*

### 3. Contribution categories

| Category | Examples | Review |
|---|---|---|
| Code | Bugs, UI, performance | Standard |
| **Accessibility** | Screen readers, contrast, large text, one-handed use | Standard (high priority) |
| **Translations** | Hindi, Hinglish, Tamil, Bengali, Marathi… copy files | A native speaker + a maintainer |
| **City / local knowledge** | Correcting OSM `lit` tags *upstream in OpenStreetMap*, local emergency numbers, testing routes in their city | Standard (OSM edits follow OSM's own rules) |
| UX research | Interview notes (anonymised), usability tests | Maintainer |
| **Moderation rules** | Report taxonomy, templates, rejection policy | Protected |
| **Safety research** | Threshold choices, failure analysis, abuse cases | Protected |
| Documentation | Setup, architecture, FAQs | Standard |

### 4. Trust levels (three, no committees)

| Level | Can | How you get there |
|---|---|---|
| **1. Community Contributor** | Open issues and PRs, join Discussions, translate, test | Anyone, immediately |
| **2. Trusted Contributor** | Triage issues, review non-protected PRs (approval counts as one review), label, run the staging smoke test | ~5 merged, useful contributions over ≥ 1 month + a maintainer's nomination; agrees to the principles |
| **3. Maintainer** | Merge, approve protected areas, promote to production, hold production secrets, moderate | Sustained trusted work + existing maintainers' agreement. **Kept to 1–3 people**; production secret access only for those who need it |

Levels can be stepped down after inactivity (6 months) or a principles breach, and it's written down, not personal.

### 5. Protected areas (stricter review: 2 approvals incl. a maintainer, plus the checklist)

Enforced with a `CODEOWNERS` file:

| Area | Paths |
|---|---|
| **Emergency workflows**: trips, arrival, missed alerts, worker | `src/server/trips/`, `src/server/journey/`, `src/domain/journey.ts`, `src/worker/`, `src/app/(app)/trip/`, `src/app/t/` |
| **Authentication & sessions** | `src/server/session/`, `src/server/admin/auth.ts`, `src/app/api/auth/`, `src/proxy.ts`, `src/server/http/csrf.ts` |
| **Privacy & user data** | `db/migrations/`, `src/server/crypto/`, `src/server/retention.ts`, `src/server/account/`, `src/app/(app)/privacy/`, `public/sw.js` |
| **Location handling** | `src/lib/location-store.ts`, `src/server/providers/geo/`, `src/server/http/geo-input.ts` |
| **Moderation & safety algorithms** | `src/domain/aggregation.ts`, `src/domain/moderation.ts`, `src/domain/lighting.ts`, `src/domain/report/`, `src/server/aggregate/`, `src/server/report/`, `src/app/admin/` |
| **AI behaviour** | `src/server/providers/companion/` |

**Protected-area checklist** (in the PR template):
1. Does it store, show or send any new personal or location data? If so, why is that the minimum?
2. Can it make MIRA claim something happened that didn't (a sent alert, a safe place)?
3. What happens when it fails? Does it fail loudly toward the person?
4. Tests added for the failure case?
5. Is there a new public output? Is it thresholded and uncertainty-aware?

### 6. Community roadmap without "loudest wins"

- **Public roadmap** with three columns: *Now* (≤ 2 weeks), *Next*, *Not doing (and why)*. The "Not doing" list is the most important one: it records decisions against the principles (e.g. *safe/unsafe scores*, *crime heatmaps*, *passive tracking*, *people-reporting*).
- **Proposals** go in Discussions with a fixed template: *the user situation · who it helps · the principle it serves · the data it needs · how it can fail.*
- **Decision rule:** maintainers decide, in writing, against the principles and **evidence from real users** (interviews, support messages, usage counts), not votes or reactions. Upvotes show interest; they don't decide.
- **Women who use MIRA outrank contributors who don't.** Run a small user panel (10–20 beta users) and give their feedback explicit weight in roadmap notes.

---

### 7. Product principles (the test every contribution must pass)

Derived from what the code already enforces and what this audit found:

1. **Walk with her, don't warn her.** Calm, factual, non-fear language. No red maps, no danger scores, and never "safe" or "unsafe" for a place, route or person.
2. **Location only while she chooses, gone when she's done.** Live location exists only during a trip she started, only for people she picked, and is deleted at the end. No history, no passive tracking.
3. **About streets, never about people.** Community signals describe infrastructure and conditions (light, footpaths, open places), never individuals, groups or who lives somewhere.
4. **Many voices, shown with doubt.** No single person's input is ever shown. Everything public says where it came from, roughly when, and what isn't known.
5. **Every safety promise must be true when it matters.** MIRA never says a message went out, a contact is watching or someone will be told unless that's actually the case. When something fails, she's told.
6. **Contributing takes seconds.** A tap beats a form. If a contribution takes minutes, redesign it.
7. **She decides; MIRA proposes.** Nothing is shared, sent or started without her tap. MIRA and Mira are not an emergency service and never pretend to be.

A PR that can't answer "which principle does this serve, and does it break any?" isn't ready.

---

### 8. Open-source readiness checklist (for launch day: P1, not P0)

- [ ] `LICENSE` (AGPL-3.0), `CONTRIBUTING.md` (flow + levels above), `SECURITY.md` (private disclosure email, no public issues for vulnerabilities), `CODE_OF_CONDUCT.md` (Contributor Covenant)
- [ ] `PRINCIPLES.md` (section 7) linked from the README
- [ ] `.github/CODEOWNERS` (section 5), PR template (checklist), issue templates (bug, proposal, translation)
- [ ] CI workflow: `npm run lint && npm run typecheck && npm test` (+ E2E on protected paths)
- [ ] Move `MIRA_*.md` V0 specs to `docs/archive/v0/`; keep this audit (`MIRA_LAUNCH_AUDIT.md`) in `docs/`
- [ ] README: a "Run locally without any keys" section (already true: placeholders), plus a trademark note
- [ ] Only after all of the above: make the repository public

---

# Part 6 — Six-hour public release plan

*No rewrite, no new architecture. The product loop already works on the laptop (169/169 tests; E2E covers trips, alerts, reports, privacy). What's missing is **somewhere to run it, a way to send email, honest copy, and a reachable emergency button.***

**Launch shape:** a **public beta** at an HTTPS URL, installable as a PWA, aimed at women who **walk** home (India first; 112). Promise the trip-sharing loop and lighting. Don't promise community notes.

---

### DELETE / HIDE / DEPRIORITISE

| Item | Why | Decision |
|---|---|---|
| "Hi, I'm Mira" as the first screen's headline | Leads with an AI character instead of the promise | **SIMPLIFY** (P0 copy) |
| "Google sign-in is coming soon." on onboarding | Signals unfinished at T+30 s | **REMOVE** (P0) |
| "✨ Demo mode" pill on Me | Makes real users think their data or trips aren't real | **HIDE FOR BETA** (P1) |
| Community notes as orange map dots | False precision (1.2 km cell drawn as a point) | **SIMPLIFY**: sheet only, with the week (P1; no notes will exist for weeks) |
| Community notes as a *promise* | 0 exist; need ≥ 5 approved reports per cell/band/category | **DEPRIORITISE**: keep code, remove from marketing |
| "Around you" nearby list as the main Home content | Commodity (Google Maps) | **SIMPLIFY**: keep below the Home / Where-to action |
| "Along the way" chips | Not tappable; low value | **DEPRIORITISE** |
| Mira as the emergency path | ~4 s LLM round-trip before "Call 112" | **REMOVE from that role**: persistent Emergency pill instead (P0) |
| Mira tab | Useful secondary entry, Hinglish | **KEEP**, not the front door |
| Report tab | Real contribution path; tested | **KEEP**; set honest expectations |
| "Was the way lit?" | Best contribution mechanic | **KEEP & WIDEN** (P1) |
| Time-of-day theme | Done, delightful | **KEEP**, no more investment |
| Inbox bell | Only way to see missed/accepted without push | **KEEP** |
| V0 spec docs at repo root | Describe a product that no longer exists | **REMOVE** to `docs/archive/v0/` (P1) |
| Private trip with no contacts, promising "I'll check you arrive" | Implies a safety net that isn't there | **SIMPLIFY copy** (P0) |

---

### Phase 0 — Product truth ✅ (done)

Parts 0–5 of this document.

---

### Timeline (6 h)

| Clock | Track A (owner: accounts, DNS, keys) | Track B (code, in parallel) |
|---|---|---|
| 0:00–0:45 | **O1–O4**: pick host, create DB, buy/point domain, start SMTP domain verification (DNS can take a while, so start first) | **P0-1 to P0-6** copy + emergency pill + Mira prompt |
| 0:45–1:30 | **O5**: rotate keys, restrict, budgets | P0-7, P0-8; run `npm run check` |
| 1:30–2:30 | **O6–O8**: deploy web + worker, env, migrate, import, admin hash, HTTPS | — |
| 2:30–3:15 | **O9**: uptime monitor; **smoke test on production URL** | Fix whatever deploy breaks |
| 3:15–4:30 | **Phase 6 real-device tests** (Android + iPhone + a friend's phone as contact) | Fix P0 findings only |
| 4:30–6:00 | Buffer → then P1 in listed order | P1 |

If SMTP isn't verified by 3:15: see the fallback under **Can we launch?** at the end.

---

### Phase 1 — Fix the proposition (P0, ~1 h of code)

#### P0-1 · Promise-led first screen
- **Objective:** she understands "share my walk; my people see me get home" within 10 s.
- **Files:** `src/app/welcome/Welcome.tsx` (step 0 copy + bullets, remove "Google sign-in is coming soon"), `src/app/layout.tsx` (`metadata.description`), `src/app/manifest.ts` (`description`).
- **Dependencies:** none.
- **Implementation:** headline **"Walk home. Your people will know."**; sub: "Share your walk in one tap. The people you trust see you on the map until you arrive, and they're told if you don't." Bullets: *Share your walk home · Nobody has to keep checking · See how lit the way is.* Keep the orb, smaller. Keep "Let's go".
- **Acceptance:** no "AI", "safe", "empower"; the promise appears in the first 2 lines; no "coming soon".
- **Test:** no existing test matches the old headline (checked); `npm test` stays green; add one E2E assertion that the welcome screen shows the new headline.
- **Priority:** P0.

#### P0-2 · Emergency pill, always reachable
- **Objective:** one tap to 112 from Home and from a live trip, calm not alarming.
- **Files:** `src/app/(app)/HomeScreen.tsx` (top glass card, next to bell/avatar; for signed-out users too), `src/app/(app)/trip/TripScreen.tsx` (header card).
- **Dependencies:** none.
- **Implementation:** `<a href="tel:112" aria-label="Emergency call, 112">` styled as a small ink/neutral pill "Emergency", min 44 px target. Not red, no siren icon.
- **Acceptance:** visible without scrolling on a 375 px screen on Home and Trip; opens the dialler; screen-reader label says what it does.
- **Test:** add an E2E assertion (`getByRole('link', { name: /emergency/i })` has `href="tel:112"`) on Home and Trip in `a-share-trip.spec.ts`.
- **Priority:** P0.

#### P0-3 · Honest private-trip copy
- **Objective:** a trip without contacts never implies someone will be told.
- **Files:** `src/app/(app)/HomeScreen.tsx` ("No trusted contacts yet — I'll still check you arrive"), `src/app/(app)/trip/TripScreen.tsx` (footer paragraph: "This trip is private. I'll still check that you arrive… If you close MIRA, they'll see your last spot").
- **Implementation:** Home, no contacts: *"Nobody will be alerted yet. Tap **Share link** on the next screen to send it on WhatsApp, or add someone."* Trip, no contacts: *"Only people you send the link to can follow. Nobody is alerted if you don't arrive. Add someone in Me for that."* Make "they'll see your last spot" conditional on `sharedOk.length`. Add "Tap *I'm here* if you close MIRA."
- **Acceptance:** with 0 contacts, no sentence on Home or Trip implies a third party is watching or will be told.
- **Test:** E2E "works without contacts as a private trip" asserts the new text.
- **Priority:** P0.

#### P0-4 · Alert channel stated plainly
- **Objective:** she knows alerts are **email** and that her contact must accept once.
- **Files:** `HomeScreen.tsx` (under Share button, with contacts), `src/server/account/contacts.ts` (invite email: add "add <SMTP_FROM> to your contacts so an alert never lands in spam"), `src/app/(app)/me/MeScreen.tsx` (contacts section hint).
- **Acceptance:** Home/Me say "by email"; the invite email has the anti-spam line.
- **Test:** existing integration tests for invites still pass; Mailpit shows the line.
- **Priority:** P0.

#### P0-5 · Privacy page matches reality
- **Objective:** no inaccurate claim on the privacy page.
- **Files:** `src/app/(app)/privacy/page.tsx` ("Chatting with Mira").
- **Implementation:** "Mira's replies are saved without area names, distances or nearby places. **Your own messages are saved as you typed them**, for 30 days, so don't type addresses you'd rather not keep. Clear it any time in Me." Also name processors (hosting provider, SMTP provider).
- **Acceptance:** every sentence is true against Part 4.
- **Test:** E2E privacy spec text checks (if any) updated.
- **Priority:** P0.

### Phase 2 — Make the core journey excellent (P0, ~30 min)

#### P0-6 · "I feel uneasy" gets options, not a question
- **Objective:** scenario D produces actions in the first reply.
- **Files:** `src/server/providers/companion/claude.ts` (`TOOL_GUIDE`), `persona.ts` (one line: no legal/medical instructions beyond "call 112 / see a doctor").
- **Implementation:** add to `TOOL_GUIDE`: *"If they feel uneasy, unsure or uncomfortable (not in immediate danger): don't ask a question first. Call find_nearby with kinds [police, metro, pharmacy, food] and, if they have a saved home, propose_trip to it. Then one short, warm line."* This restores parity with the scripted fallback (`placeholder.ts:89`).
- **Acceptance:** live Claude reply to "I feel uneasy" includes a places card and (with Home saved) a trip card.
- **Test:** manual against live Claude (E2E forces the placeholder, which already passes); add to the Phase 6 checklist. Also check "Is Kamla Nagar safe at night?" never says safe/unsafe.
- **Priority:** P0.

#### P0-7 · Bound AI spend per person
- **Objective:** a public URL can't run up the Anthropic bill.
- **Files:** `src/app/api/mira/route.ts` (`mira:d` max 400 → **60**), plus the O5 console limit.
- **Acceptance:** 61st message in a day → friendly rate-limit message.
- **Test:** existing rate-limit integration pattern.
- **Priority:** P0.

#### P0-8 · Verify before deploy
- `npm run check` (lint + typecheck + 169 tests) green; `npm run test:e2e` green (~6–10 min; run alone).
- **Priority:** P0.

### Phase 3 — Mobile / public readiness (P0 ops, owner)

| # | Task | Objective | Details | Acceptance |
|---|---|---|---|---|
| **O1** | Host | Run **web + worker** from one build against one Postgres + PostGIS, with HTTPS | Any platform that runs two long-lived Node processes, e.g. Render (Web Service + Background Worker + Postgres), Railway (two services + PostGIS template), or Fly.io. **Not static/serverless-only** (README: the worker must run). Build: `npm ci && npm run build`. Web: `npm run start` (**binds port 3100**, so set the platform's port to 3100). Worker: `npm run worker:start` with auto-restart | Both processes up; `/api/health/live` 200 |
| **O2** | Database | PostGIS 3.x on Postgres 17 (16 likely fine) | Confirm `CREATE EXTENSION postgis` works *before* committing to a provider. Not publicly reachable; daily backups ≤ 30-day retention | `npm run db:migrate` succeeds |
| **O3** | Domain + HTTPS | `APP_BASE_URL=https://…` (enforced at startup) | Custom domain or platform subdomain | Cookies are `__Host-`; HSTS header present |
| **O4** | **SMTP** | Contact invites + missed alerts actually arrive | Transactional provider (e.g. Resend, Postmark, Brevo, SES) with a **verified sending domain (SPF + DKIM)**. Set `SMTP_HOST/PORT/USER/PASS/FROM/SECURE`. **Start DNS verification at 0:00** | Test invite reaches a Gmail **inbox** (not spam) |
| **O5** | Keys & budgets | Demo keys were pasted in chat: rotate all | New `ANTHROPIC_API_KEY` with a **monthly spend limit**; Google: **server key** restricted to Places (New) / Routes / Geocoding, **browser key** restricted to the production domain + Map Tiles API; budget alert + per-API quotas; new `MAPILLARY_TOKEN`. Old keys revoked | Old keys fail; budgets visible |
| **O6** | Secrets | Production env from the platform's secret store | `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` (fresh, `openssl rand -base64 32`), `ADMIN_PASSWORD_HASH` via `npm run admin:hash` (`b64:` form), `PILOT_MANIFEST_PATH=data/pilot/manifest.json`, `MAP_TILE_URL`, `MAP_STYLE_URL`, `TRUSTED_PROXY_HOPS` matched to the platform's proxy, provider keys, SMTP. Leave `REVERSE_GEOCODER_URL/OVERPASS_URL/PLACE_SEARCH_URL` set only if accepting public OSM servers' usage policies (fallback only when Google is on) | App boots (env schema validates) |
| **O7** | Data | Schema + placeholder map data | `npm run db:migrate && npm run pilot:import` | Health ready once the worker's first pass completes |
| **O8** | Proxy logs | Bearer tokens in `/t/…` and `/invite/…` | Check whether the platform logs full request paths. If yes, accept for beta (operator-only) and note it; don't forward logs to third parties | Documented |
| **O9** | Monitoring | Know when alerts would stop | Free uptime monitor on `https://…/api/health/ready` every 1–5 min → alert the owner's phone. Returns 503 when the worker's journeys pass is > 3 min old | Monitor green; kill the worker → monitor alerts |

### Phase 4 — Community foundation (P1, only after P0)

| # | Task | Files | Acceptance |
|---|---|---|---|
| P1-1 | **Widen "Was the way lit?"**: today it's asked only when the trip closes as *arrived* (auto or *I'm here*) at night **and** the route was already loaded on this screen. Also ask after *End trip*, and fetch the route on close if it's missing | `TripScreen.tsx` (`askLit` condition; `route` is null if the screen was reloaded without a GPS fix) | Asked on every night trip close with a street route |
| P1-2 | **Viewer → user loop**: on the shared-link page (open and "arrived" states) a quiet line: *"Want your people to see you home too? Get MIRA"* → `/` | `src/app/t/[token]/SharedTripView.tsx` | Link present; no tracking params |
| P1-3 | **Instant "I feel uneasy"** on Home (secondary action) that shows [Share my walk now] [Places open nearby] [Emergency] with no LLM call | `HomeScreen.tsx` (reuse `SearchOverlay`/nearby data + `startTrip`) | Options visible < 300 ms |
| P1-4 | Community notes: drop the map dot; show the week + "Why am I seeing this?" | `WorldMap.tsx` (`notes` layer), `HomeScreen.tsx` | No point marker; each note shows "week of …" |
| P1-5 | Lighting label "Mapped as lit" when the source is OSM only | `LightingSummary.tsx` | Label varies by source |
| P1-6 | Hide "Demo mode" pill | `MeScreen.tsx` | Not visible to users |

### Phase 5 — Open-source readiness (P1/P2)

Follow the checklist in Part 5 §8: LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, PRINCIPLES, CODEOWNERS, CI, archive V0 docs. **Make the repo public only after SECURITY.md exists and production secrets are confirmed absent (history already scanned clean).** Launching the app doesn't depend on this.

Also P1, if time allows:
- **P1-7** Open Graph image + title for WhatsApp/Instagram previews (`src/app/opengraph-image.tsx`).
- **P1-8** Google Maps logo/attribution per Google's terms (`WorldMap.tsx`).
- **P1-9** Decide Mira's model: `claude-opus-5` replies took ~4 s. A faster model (e.g. `claude-sonnet-5` or `claude-haiku-4-5-20251001`) would cut latency and cost. Measure with the Phase 6 prompts before switching (`MIRA_MODEL` in `claude.ts`).

### P2 — Post-launch
Google/email sign-in (account recovery) · Web Push to the traveller · WhatsApp/SMS alerts to contacts · "I'm not walking" (auto/cab with manual ETA; `validateNewEta` already exists) · start a trip without a GPS fix · encrypt saved places at rest · env-overridable abuse thresholds · note confirm/disagree · native shell for background location · public moderation policy.

---

### Phase 6 — Release validation (real devices, production URL)

| User | Scenario | Pass condition |
|---|---|---|
| A | New user from a WhatsApp link on Android | Understands the promise on screen 1; Home in < 60 s; install card works |
| A′ | Same on **iPhone Safari → Add to Home Screen** | **Does the installed app keep the Safari session?** If not: onboarding tells iOS users to install first (P0 copy tweak) |
| B | Unfamiliar destination | Route + lighting with sources; no "safe" wording |
| C | Walk with an accepted contact (a friend's phone, Gmail) | Contact gets the trip email in **inbox**; live dot moves; auto "arrived 🎉"; link goes dark after 30 min |
| C′ | Walk with **Share link → WhatsApp**, no contacts | Friend opens link on a phone that never saw MIRA; sees dot + ETA |
| D | "I feel uneasy" to Mira (live Claude) | Places card (+ trip card if Home saved) in the first reply |
| E | Emergency pill from Home and Trip | Dialler opens with 112 |
| F | Night trip ends → lighting question | Tap → "Thank you 💛" |
| G | (No notes expected) | Copy doesn't promise notes |
| H | Missed check-in (set a short walk, don't arrive) | At ETA + 10 min the contact gets **one** email in inbox with the live link; tap *I'm here* → "arrived" email |
| H′ | Abuse: rapid reports / Mira messages | Rate-limit messages; nothing public |
| I | Deny location | Honest banner; search works; share disabled with an explanation |
| J | Throttled network (Chrome DevTools "Slow 3G") | Trip upload failure banner appears and recovers |
| — | Kill the worker process | Monitor alerts within 5 min; trip start says "paused" |

---

### Can MIRA be publicly released today?

**Yes, as a limited public beta, if and only if these three conditions hold by hour ~4:**
1. Web + worker are running on HTTPS with the uptime monitor green;
2. a missed-arrival email is **seen in a real Gmail inbox** (scenario H);
3. P0-1 to P0-7 are merged (honest copy, Emergency pill, uneasy fix, AI spend cap) and keys are rotated with budgets.

**If SMTP can't be verified today:** don't launch the trusted-contact alert as a feature. Launch only the **Share-link** loop, with copy saying plainly that nobody is alerted automatically yet. Or wait a day. Selling a safety net that silently doesn't fire is worse than not launching.

**Not ready for:** a broad press/social launch (no account recovery, no push, email-only alerts, a single moderator), or any claim about community intelligence.

---

