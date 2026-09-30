# 02 — Mira Product Experience Constitution

**Authority.** This is the highest-authority *product-experience* document for the launch UX work. When another launch-ux document, a design idea, a library default or a clever interaction conflicts with it, this document wins.

Two things rank above it:
1. **`PRINCIPLES.md`** (repo root, a protected file). It governs data, truth and privacy. This constitution is written to be fully compatible with it. Where they touch, the principle number is cited as **[P#]**.
2. **Explicit owner decisions** recorded in the repo (`MIRA_EXECUTION_STATUS.md`, `docs/PUBLIC_BETA_FREEZE.md`, memory of owner calls such as WhatsApp-first Circle).

**Keywords.** Rules use **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** in the RFC 2119 sense. A MUST or MUST NOT is a release blocker.

**Rule IDs.** Each rule has an ID (`C-x.y`). Implementation PRs and review comments cite these IDs.

---

## 1. Product promise

> **Mira is a personal safety and real-world intelligence companion. It helps people move through the physical world with more awareness and confidence. You say what you intend; Mira does the work.**

- **C-1.1 MUST.** Every primary screen answers *"what can Mira do for me right now?"* It does not answer *"what features does Mira have?"*.
- **C-1.2 MUST.** Mira's tools stay behind Mira: routes, lighting evidence, Help Points, advisories, community signals, AI and the Circle. The user expresses intent (a destination, "I feel unsafe", "something's wrong here"). Mira assembles the tools and returns **a conclusion and one next action**, with the evidence one tap away.
- **C-1.3 MUST.** A conclusion is a *decision-shaped sentence built from evidence*, never a score and never a verdict. Allowed: "16 min walk. Most of it isn't mapped for lighting. 3 places with staff on the way." Not allowed: "Safety score 72", "Safe route", "Risky area". [P1, P8]
- **C-1.4 MUST.** Mira keeps its standalone value. One person with no community and no Circle still gets the way, time, lighting evidence, Help Points, emergency access and the companion. [P9]

## 2. Emotional promise

> **"I'm going somewhere. Mira has me."**

- **C-2.1 MUST.** The default emotional state is *calm confidence*. Fear is never the product. [P1]
- **C-2.2 MUST NOT.** Mira must not remind users that something bad could happen unless the reminder is actionable now and tied to their current context (route, destination, active journey).
- **C-2.3 MUST.** Safety affordances (Emergency, I feel unsafe) are always present and never loud. They are **quiet anchors**: neutral colour, fixed place, one tap.
- **C-2.4 MUST.** Heightened states (I feel unsafe, a missed check-in) get *calmer*, not louder. Motion reduces, content simplifies, and the next action is the largest thing on screen.
- **C-2.5 SHOULD.** Success moments (arrived, contribution confirmed, becoming a Mira Scout) are warm and brief. No confetti, no party emoji, no mascots.
- **C-2.6 MUST.** Mira should feel calm, aware, intelligent, reassuring, responsive, personal, premium, modern, global and human.
  **MUST NOT** feel childish, pink, alarmist, police-like, cyberpunk, militaristic, surveillance-heavy, gamified or like corporate SaaS.

## 3. The user's relationship with Mira

- **C-3.1** Mira is a **companion with a job**, not a friend and not a guardian. Mira helps and informs. It does not protect, guarantee or watch over anyone. [P5, P7]
- **C-3.2 MUST.** The user decides; Mira proposes. Nothing is shared, sent, started, called or published without the user's tap. [P7]
- **C-3.3 MUST.** Mira never claims an outcome that isn't true at that moment:
  - "Opened WhatsApp", never "sent";
  - "attempts to email", never "will tell";
  - "couldn't check", never "none". [P5]
- **C-3.4 MUST.** Four states stay distinct in every surface: **unknown ≠ empty ≠ failed ≠ unavailable** (owner rule). No redesign may collapse two of them into one visual or one sentence.
- **C-3.5** Mira is one presence across the app. "Mira" is the product and the companion. The chat is *one* way to talk to Mira, not *where* Mira lives. Mira's presence appears wherever Mira is working: the Mira line, the Mira Pulse, and journey status.

## 4. Mira for Me

- **C-4.1** "Mira for Me" covers journeys, routes, safety-aware navigation, local awareness, help, advisories, AI assistance, understanding unfamiliar areas and personal safety support.
- **C-4.2 MUST.** The fastest path is: open → intent (destination / saved chip / suggestion) → one summary line → **Go with Mira**. Three taps from a cold open to a shared journey, for a user with Home saved and a Circle.
- **C-4.3 SHOULD.** Mira gets more personal over time, using only data Mira already keeps and shows:
  - habits (journeys to saved places, by hour);
  - travel preference;
  - Help Point exclusions;
  - usage balance (07 §B).
- **C-4.4 MUST NOT.** Personalisation must never require a persona, a questionnaire or a complex settings screen.

## 5. Mira for Everyone

- **C-5.1** Contribution is a **first-class way to use Mira**, not a side effect of journeys. A person who never takes a journey (the shopkeeper who sees a streetlight go out) is a full Mira user.
- **C-5.2 MUST.** Contribution is a **stable anchor**. Adaptation may change its prominence or order, never its reachability. Reporting is reachable in **≤ 2 taps from any tab root**. From Contribute it is 1 tap to the category grid. It works anonymously.
- **C-5.3 MUST.** Contribution is about **streets, places and conditions, never people**. No field, category, free-text prompt or AI suggestion may describe or invite description of a person's appearance, identity or "suspiciousness". [P3]
- **C-5.4 MUST.** Contributions are private inputs to evidence systems. No individual report is ever displayed publicly. Public output is aggregate, thresholded, template-worded and dated. [P4, P12]
- **C-5.5 SHOULD.** Close the loop. After contributing, the person learns honestly what happens next, and later what came of it, only as far as the system truly knows ("waiting for someone else to confirm", "confirmed", "reports differed").
- **C-5.6 MUST.** Contributing takes seconds. A tap beats a form. If a contribution takes minutes, redesign it. [P6]

## 6. Adaptive Mira

- **C-6.1** Mira adapts to *how the person uses Mira*, not to *who they are*. There are no personas: no "Traveller", "Contributor", "Woman", "Shopkeeper" or "Commuter" modes, labels or onboarding choices.
- **C-6.2 MUST.** Adaptation is **progressive** (it needs evidence of use), **explainable** (the user can see why) and **reversible** (it can be reset in Me). 07 defines the algorithm.
- **C-6.3 MUST.** The interface has **stable anchors** that never move, and **adaptive surfaces** that may change. Stable anchors are:
  - tab bar order and labels: Today · Around · Mira · Contribute · You (owner-approved community-first revision, 2026-10-01);
  - the Emergency and I feel unsafe positions;
  - the search field;
  - Report reachability;
  - Me structure;
  - journey controls.

  Adaptive surfaces are:
  - the Mira line;
  - the single adaptive card slot;
  - the order of Home's secondary actions;
  - which Contribute section is expanded first;
  - suggestion chips in Mira.
- **C-6.4 MUST.** An adaptive surface's arrangement changes **at most once per local day** and only when the signal is clear (07 §B.4). The interface must never visibly rearrange while it is being used.
- **C-6.5 MUST NOT.** Mira must not silently change consequential settings:
  - emergency contacts;
  - external location sharing (defaults, who is included);
  - escalation behaviour;
  - emergency calling;
  - Help Point exclusions;
  - high-impact privacy choices.

  Mira MAY *suggest* such a change as a card the user taps.

## 7. Mira Scout

- **C-7.1** A **Mira Scout** is someone whose consistently reliable contributions help Mira understand an area better. It represents **trust, accuracy and usefulness, never volume**.
- **C-7.2 MUST.** Mira Scout is the user-facing name of the existing **Local Steward** status (`src/domain/reputation.ts: stewardStatus`). Its criteria are the existing ones, all required:
  - verified contributions only;
  - multiple active days;
  - multiple areas;
  - ≥ 80% agreement;
  - a durable account at least 30 days old;
  - no anomaly flags.

  No new tiers.
- **C-7.3 MUST NOT.** There are no leaderboards, points, streaks, counters that rise on submission, public badges, public profiles or rankings. [README privacy: "no public profile"]
- **C-7.4 MUST.** Mira Scout is **private by default**. Only the person sees it (Me, Contribute, a one-time quiet recognition). A Mira Scout gains **no power over truth**: their answers still need independent corroboration.
- **C-7.5 MUST.** Reports (incident observations) do **not** count toward Mira Scout. That is an existing decision ("Reports are never counted as contributions or rewarded"). Changing it is `REQUIRES_OWNER_APPROVAL` (07 §C.6).
- **C-7.6 SHOULD.** Recognition is phrased as a consequence, not a trophy. For example: "Mira Scout. Others keep confirming what you tell Mira, in different places and on different days."

## 8. Trust

- **C-8.1 MUST.** Evidence decides truth; AI decides relevance. The AI never decides whether a safety claim is true, and its output is never evidence. [P10]
- **C-8.2 MUST.** Every contextual claim carries, one tap away:
  - its **source**;
  - its **age**;
  - what **isn't known**. [P4, P8, P11]
- **C-8.3 MUST.** Community-derived statements require independent corroboration (existing rules: ≥2 voices for place status, ≥3 walkers and ≥60% for lighting, ≥5 contributors for public notes). The UI never implies more certainty than the rule produced.
- **C-8.4 MUST.** Absence is not safety. "No reports" is never presented as reassurance. Say "Few reports here" at most, or nothing.
- **C-8.5 MUST NOT.** Mira must not monetise fear or gate any safety feature.

## 9. Privacy

- **C-9.1 MUST.** Live location exists only during a journey the user started, only for the people they chose, and is deleted at close. No location history. [P2]
- **C-9.2 MUST.** Every live share shows, on the sharer's screen, **who can see them and until when**.
- **C-9.3 MUST.** Coordinates never appear in URLs, emails or notifications. Handing a report spot to the report screen happens in memory. [README]
- **C-9.4 MUST.** Any new *device-local* memory added for adaptation is listed in Me → "What Mira remembers" and in `/privacy`, and is cleared by the reset control. (07 §B.1 describes the usage signal.)
- **C-9.5 SHOULD.** Privacy is stated at the moment it matters, in one line, with detail on tap. It is not repeated as paragraphs on every screen.

## 10. Safety boundaries

- **C-10.1 MUST.** Emergency is **one tap to the phone's dialler** with the **cited** local number, or an options sheet when the number is service-specific or unknown. Mira never auto-dials, never dials from a gesture or sensor inference, and never guesses a number.
- **C-10.2 MUST.** Emergency and I feel unsafe are **never covered**: not by sheets at any snap, keyboards, toasts or overlays (except their own modal sheets).
- **C-10.3 MUST.** Emergency, I feel unsafe and Help Points never wait on AI or on a network request that hasn't already resolved. They render from what is already known and say what isn't.
- **C-10.4 MUST.** Mira (the companion) says it is not an emergency service, and points to the emergency action when danger is mentioned (existing persona rule).
- **C-10.5 MUST NOT.** Mira must not use police, siren, shield-and-badge or SOS aesthetics; red panic buttons; flashing; or alarm sounds.

## 11. Information hierarchy

- **C-11.1 MUST.** Each screen has **exactly one visually primary action** at a time (one filled accent button). A second filled button is a defect. (Emergency's ink fill is exempt, as a stable anchor.)
- **C-11.2 MUST.** Order of information on a decision screen:
  1. **conclusion** (the Mira line);
  2. **primary action**;
  3. **what it depends on** (the Circle / who can see, as one line);
  4. **evidence** (lighting, Help Points, notes, updates) on disclosure or below;
  5. **secondary actions**;
  6. **fine print**.
- **C-11.3 MUST.** Simplification comes from **hierarchy, not deletion**. Every feature classified in 01 §8 remains reachable. Removing a feature needs `REQUIRES_OWNER_APPROVAL`.
- **C-11.4 SHOULD.** No more than one adaptive card on Home at a time. No feeds, carousels or tile grids of features.

## 12. AI interaction philosophy

- **C-12.1** Mira's intelligence shows up **in context first, in chat second**. The chat stays: it is a secondary surface for open questions.
- **C-12.2 MUST.** The **Mira line** (a one-sentence contextual summary on Home, the route sheet and the journey) is **deterministic**: composed in code from evidence already fetched. It never calls the LLM on page load (cost, speed, truth). [P10]
- **C-12.3 MUST.** Any LLM text shown outside chat passes the existing output guard (`src/domain/companion-output.ts`). At launch, no LLM text appears outside chat.
- **C-12.4 MUST.** AI replies propose actions as **cards** that need a tap (existing). The AI never starts, shares, sends or calls.
- **C-12.5 SHOULD.** Mira's answers point back into place context or the explicit map when spatial detail helps. A card must lead to a real decision, not only the transcript.
- **C-12.6 MUST NOT.** Do not use a chatbot-first UI: no floating chat bubble over the map, no AI-generated safety facts, no "typing…" theatre longer than the real wait.

## 13. Map philosophy

- **C-13.1 (revised 2026-10-01)** The map is an explicit Around and journey surface, not Mira's first-open identity. Today and Around first explain places, people, source quality and gaps in text. On the map, Mira's route, lighting, Help Points and "you" marker provide spatial context. The Google basemap cannot be restyled.
- **C-13.2 MUST.** The map shows **conditions and places, never danger**. No red zones, no heatmaps, no incident pins, no crime overlays. [P1, "will not build" list]
- **C-13.3 MUST.** Everything on the map is also in the sheet as text (existing accessibility rule).
- **C-13.4 SHOULD.** Few pins. Before a destination: at most the places the sheet lists. With a destination: the Help Points on the chosen route. On a journey: the next ≤6 Help Points.
- **C-13.5 MUST.** Map attribution and the Google logo stay visible and legible (a licence requirement).

## 14. Community philosophy

- **C-14.1** The community is a **sensor network, not the source of truth** (blueprint §7). Confirm-and-correct beats report.
- **C-14.2 MUST.** Mira asks at most one contribution question per journey, only after arrival, only about something the person passed, and it is always skippable (existing rule).
- **C-14.3 MUST NOT.** No comments, replies, likes, follower counts, feeds of reports, or neighbourhood broadcast.
- **C-14.4 MUST.** Harassment and other incident reports stay private and moderated. They surface only through aggregate, template-worded community notes (≥5 contributors, fixed wording, no counts or exact places, 35-day life).

## 15. Personalisation philosophy

- **C-15.1** Mira remembers little, shows all of it, and forgets on request. What it remembers:
  - saved places;
  - Circle;
  - travel preference;
  - Help Point exclusions;
  - habits (arrived journeys to saved places, by hour);
  - Mira chat (30 days);
  - the device-local usage balance (07 §B).
- **C-15.2 MUST.** Every suggestion carries its reason on demand: "Because you've walked to Home around 10 pm 4 times."
- **C-15.3 MUST.** "What Mira remembers" (Me) is the single place to see, switch off and reset all personalisation.

## 16. Emergency interaction philosophy

- **C-16.1** "I feel unsafe" is a *state*, not a button. Opening it means Mira reorganises around the next best action: move toward help, tell someone, call, say where you are.
- **C-16.2 MUST.** The sheet's action order is frozen. It renders instantly from prefetched data and states what is unknown or failed.
- **C-16.3 MUST.** Leaving the state is calm ("I'm okay now"). No PIN, no confirmation wall, no guilt.
- **C-16.4 SHOULD.** Android haptics MAY confirm arming actions (a single 10 ms pulse), but never as the only signal. iOS has no Vibration API. Don't fake it.

## 17. Copy and tone

Mira sounds **concise, calm, capable, contextual and human**.

| Do | Don't |
|---|---|
| "Your usual walk home is 18 min. Most of it is mapped as lit." | "Safety intelligence analysis successfully completed." |
| "There are a few recent reports near this stretch. The busier way adds 6 minutes." | "Danger detected!" |
| "Opened WhatsApp for Priya." | "Priya has been notified!" |
| "Couldn't check lighting right now." | "No lighting data." (when a lookup failed) |
| "Nobody is alerted automatically if you don't arrive." | Implying someone is watching |
| "Mira Scout" | "Level 3 Guardian 🏆" |

- **C-17.1 MUST NOT.** Never use "safe", "unsafe", "dangerous", "stay safe", "get home safely" or "you'll be fine". [persona rules]
- **C-17.2 MUST.** Keep one idea per sentence. Lead with the fact, follow with the action. Numbers come with their unknowns.
- **C-17.3 MUST NOT.** No exclamation marks except "You made it." (optional, a single one). No motivational filler. No emoji in UI copy or as icons (Mira's replies MAY mirror a user's emoji).
- **C-17.4** Naming: the product and companion are **Mira** (sentence case). "Go with Mira" starts a journey. "Mira Check" is a post-journey question. "Mira Scout" is the trust status. "Help Point" and "Circle" stay capitalised as product nouns.
- **C-17.5 SHOULD.** Mira speaks in first person only inside chat and the Mira line's action voice ("I'll keep your link live until you arrive"). Elsewhere the UI speaks plainly, without "I".
- **C-17.6 MUST.** Copy is gender-neutral in the UI ("you", "they"). Mira is designed around realities women face moving through cities (a design grounding kept in `/privacy` and Welcome's footnote), and it is useful to anyone.

## 18. What Mira must never become

Mira MUST NOT become any of these:
- an emergency-only app;
- a police app;
- a fear-based women's safety app;
- a generic map;
- a safety dashboard;
- a social network;
- a crowdsourced complaint portal;
- a Life360 clone;
- a chatbot wrapped around a map;
- a SaaS dashboard.

Concretely, the following **must not ship**. Proposals for any of them are closed with a link here:
- safety scores, ratings, grades or red/green maps;
- crime feeds, incident push alerts, "near you" incident notifications;
- people-reporting, "suspicious person/activity" categories, appearance fields;
- points, levels, streaks, leaderboards, public badges, public profiles;
- always-on tracking, location history, family-tracking mode;
- chat bubbles over the map, AI-asserted safety facts;
- SOS-heavy home screens, sirens, police styling;
- paywalled safety;
- confetti, mascots, gamified streaks;
- fake iOS system chrome (fake Dynamic Island) in the PWA.

## 19. Change control for this document

- Changing C-rules requires the owner's written approval, recorded in the PR description.
- Execution agents cite rule IDs when a rule forced a design choice. When a rule appears to block necessary work, they stop and file `REQUIRES_OWNER_APPROVAL` with the rule ID. They must not reinterpret the rule.
