# Mira mobile information architecture

**Status:** Selected mobile architecture; the initial production shell was implemented on 2026-10-01. The product's truth/privacy rules remain the design floor. The launch constitution's C-13.1 and fixed tabs were amended for this owner-approved change; all other C-13 map evidence/accessibility rules and C-14 community safety rules remain.

## The user's mental model

**Mira helps me understand this place and my next move, using carefully checked local knowledge that people help improve.** Journey support, Circle sharing, Help Points and emergency access are powerful capabilities within that model. A map is requested when the person needs spatial orientation. Mira chat is a visible, persistent way to ask open questions and act on sourced answers.

Home is a **local briefing and launchpad**, not a map canvas or incident stream. Its primary content object is a *decision-shaped local note*: a short answer with provenance and a next action. It may be an evidence-backed condition, a useful unknown, a place question, or a current journey. It is never a public individual report. This uses `src/domain/context.ts`, `src/domain/evidence-state.ts`, the Mira line pattern, and existing private/aggregated contribution mechanisms as a base.

## Options considered

| Option | Mental model and structure | Where map / community / report / personal safety / local intelligence / emergency live | Strength | Failure mode |
|---|---|---|---|---|
| **A. Five persistent tabs:** Today · Around · Community · Contribute · You | A local network has its own destination. | Map in Around/place/journey; Community is a corroborated local ledger; Report in Contribute; Circle in You; intelligence on Today/Around/Community; emergency global. | Community is unmissable and easier to scale when there is enough verified material. | Today's release has `community: unavailable_in_beta` in `src/server/safety-intel/pipeline.ts`, public aggregate releases off by default, and sparse local evidence. A dedicated tab would become a permanent empty promise. Too many roots on a phone. |
| **B. Four persistent tabs:** Today · Around · Contribute · You | “Understand here; inspect a place; make it better; manage my life with Mira.” | Map is a deliberate view inside Around/place/journey. Community is the opening Today story, an Around evidence layer, and a private impact trail in Contribute. Report is one tap via Contribute and a contextual action on Today/place. Circle, privacy and settings live in You; active journey is a persistent capsule; emergency/uneasy is a stable utility outside tabs. | Community frames every relevant answer without inventing a social feed or maintaining an empty fifth tab. Keeps contribution a first-class stable anchor. | The first prototype hid Mira chat; users could reasonably conclude that Mira as a conversational companion had been removed. |
| **C. Three tabs plus floating action:** Today · Explore · You + global “Help/Share” | A companion with an action palette. | Map in Explore; community in Today; report behind the global action; journey and emergency in the palette. | Very compact chrome, fast for active journey. | Combines report and emergency into a visually loaded action; hides contribution from someone who wants to improve data without travelling. Weak fit with first-class Mira for Everyone. |
| **D. Five persistent tabs:** Today · Around · Mira · Contribute · You **(revised recommendation)** | “Understand here; inspect a place; ask Mira; make it better; manage my life.” | Map remains in Around/place/journey; community improves Today/Around and is traceable in Contribute; Mira chat is a first-class conversational route with source and action boundaries; Circle is in You; emergency remains global. | Preserves the built assistant as an unmistakable product capability while changing the map-first Home. Contribute and private impact stay first class. | Five labels need 320 px testing. Chat must not become an unsupported safety oracle or take over Today. |

**Decision after founder feedback:** D. The first four-tab concept buried the built Mira assistant enough that its existence was unclear. Keep a persistent **Mira** tab and an obvious entry on Today, while Today stays the evidence-led first screen. Option A becomes worth testing only if a sustained, moderated, privacy-safe flow of released local evidence exists in multiple geographies. Do not add a Community tab as a proxy for “community first.” Community needs to change the answer shown on Today and Around.

## Recommended navigation and placement

```
App frame
├── Today /                         local briefing + next move
├── Around /around                  search, place/area intelligence, Map view
├── Mira /mira                      sourced conversation + user-chosen action cards
├── Contribute /contribute          one useful ask, verified-impact chart, Scout, corrections, private report
└── You /me                         Circle, saved places, habits, privacy, settings, Scout

Across roots: current journey capsule (only when active), Help entry, notification inbox.
Context routes: /place/[id or search result], /area, /journey, /report, /circle.
Map view: opened from Around, place, route or active journey; never app launch default.
```

“Today” is the proposed label rather than “Home” because it implies *what is useful now*, not a generic app start. “Around” names local context, not a general navigator. “Mira” keeps the existing conversational companion explicit. “Contribute” remains explicit so anyone can help without a trip. “You” holds personal state, not a public profile. A first-run user sees a small “People help confirm…” origin line above the local note and a visible link to how community information is checked. The main content shifts from route search to *local context + intent*.

### Stable vs contextual controls

- **Stable:** bottom five tabs, separate, consistently placed “I feel unsafe” and Emergency controls on Today/Around/Mira/Contribute/You, an active-journey capsule when applicable, a search affordance on Today/Around, and a one-tap path to report through Contribute. Reachability of Report remains ≤2 taps from any tab root, as required by launch constitution C-5.2. Emergency opens the reviewed local number in the phone dialler in one tap, or an options sheet when the number is unknown or service-specific, exactly as C-10.1 requires.
- **Contextual:** “Check this place,” “See on map,” “Go with Mira,” “Answer one Mira Check,” “Correct this detail,” “Share this journey.” These appear when they correspond to known context, not as a feature grid.
- **Secondary:** completed journeys, notification inbox, saved places, Circle administration, preferences, Help Point exclusions, privacy/what Mira remembers, export/deletion. Mira chat remains a permanent tab, while contextual prompts can open it with the current place or journey attached.

### Content ownership and state transitions

| Surface | The question it answers | Primary action | Data it may use | Map rule |
|---|---|---|---|---|
| Today | “What is worth knowing here and what should I do next?” | Search/check a place or resume journey; one context-specific action. | Local evidence summary, trip status, place/saved intent, Check availability, source coverage. | No auto-open. Tiny noninteractive spatial cue only if useful, otherwise no map. |
| Around | “What does Mira know about this area or destination?” | Search or choose a place. | Place data, Help Points, lighting, condition summaries, source/age/unknowns. | Explicit “View map”; map can become full screen for walking, routes or Help Points. |
| Mira | “Can I ask this in my own words?” | Ask a question, then tap a sourced action card. | Guarded assistant tools and only permitted place/journey context; never a source of new safety truth. | May offer “View route on map” only when geography would clarify the answer. |
| Contribute | “What small fact can I help verify?” | Answer one eligible question or choose a private report. | Post-journey Mira Checks, place corrections, eligible lighting observations, private receipts. | Location shown at coarse scope, map opened only to choose a spot where necessary. |
| You | “What have I chosen, shared and helped confirm?” | Manage Circle or a relevant personal item. | Saved places, habits, contacts, permissions, impact, private Scout status. | No default map; saved place detail may open one. |
| Place detail | “What matters before I go there?” | Start a journey or inspect evidence. | Existing route/lighting/Help Points/hours/evidence plus properly released local conditions. | Open for route geometry, entrances, distance and Help Points. |
| Journey | “What is happening to my chosen share?” | Next journey action (share, extend, arrive). | Existing trip state, Circle delivery, ETA, prefetched help. | Full map is legitimate here because position and route matter. |
| Uneasy / emergency | “What can I do right now?” | A deliberate call, move-to-help or contact action. | Prefetched Help Points, verified country number, chosen Circle, current location if available. | Only if locating help materially helps, never prerequisite. |

## First-run route through the architecture

1. **Promise, before permission:** “People notice things maps miss. Mira turns confirmed local details into useful context for your next move.” A small example shows a condition with “confirmed this week / rough area / what remains unknown.” It must be labelled as an illustration until real data is loaded. Mention designed around women's mobility, useful to anyone, and no passive location history.
2. **Choice:** “Use my location” or “Search a place instead.” Explain the live-location boundary beside the permission action. Account is not required to look. Never turn a denied permission into an empty local view that looks like a verdict.
3. **Today:** The first content is a local answer. With coverage it can be a corroborated condition; without it, show the honest coverage state and standalone next action. Follow with search, a single contribution opportunity if eligible, and quiet, direct “I feel unsafe” and Emergency controls.
4. **A first proof of community:** open “How do people help?” to see a three-step chain: someone notices a condition → separate evidence checks it → Mira updates a local answer for others. No public posts or identities.
5. **Exit:** person can inspect a place, start a journey, contribute an observation, or leave with a clear understanding. No forced onboarding completion metric.

## Around and community surfaces

“Around” is not a pin field. Default to a list of **decision areas**: the current area, saved places, recently searched destination (device-local as allowed), and one focused local evidence summary. If a user pans or searches, the scope label changes and so does the provenance. Map opens as a mode within Around and retains access to textual equivalents. Spatial scope is coarse for community-derived information. Place cards carry a fact hierarchy: **what's known → as-of/source → what isn't known → route/Help Points → action**.

Community presence is tangible through:

1. A local note that explicitly says what independently corroborated answers changed.
2. A “What people helped clarify” ledger of released, current, non-identifying conditions, grouped by practical decision (“access,” “lighting,” “transport”), not by incident or reporter. With no released claims, show the honest coverage state, not a blank feed.
3. A private personal receipt: pending, confirmed, differed, expired; never a public identity metric.
4. One contextual question when the person is likely to know, especially after a journey, with skip always available.

Public incident observations remain behind existing aggregation thresholds and moderation. The current `PUBLIC_AGGREGATE_RELEASES` gate is off by default. Until operations enable it, the prototype's example pulse is a **concept scenario**, never a promise that production has this data.

## Active journey changes hierarchy, not the whole app

When a journey starts, the capsule stays visible across roots and opens `/trip`. Today may put “You're on your way to …” first, including exactly who can view the link and until when. Around/Contribute remain reachable. The journey screen may be map-heavy; this is an appropriate moment for geography. End/arrive/extend/uneasy actions keep their existing explicit confirmation and truthful delivery semantics.

## Cold start and global architecture

When Mira cannot establish the area, show search, saved places and a country-neutral help entry. When a country is known but its emergency number is unverified, show “number not yet verified” and never substitute another country's number. When local evidence is sparse, keep route/help/source coverage useful and invite an optional, specific contribution. “No confirmed local conditions” must never read as “safe.” Labels and assumptions use the user's locale and place; India is a launch data source, not a UI default. Treat source coverage separately for routes, lighting, Help Points, community and local safety updates.

## Navigation acceptance criteria

- A person can explain Mira's collective value without opening Map, Trips or chat.
- On a 375×812 phone, the first viewport shows a local answer or an honest sparse-state answer, a place intent, and the community provenance/unknown cue. The map occupies 0% of the default viewport.
- Search/place check and Mira chat are each one tap from Today; Mira and Contribute are persistent tabs; an active journey is one tap to resume; Report is at most two taps; Emergency retains its existing one-tap dialler/option contract.
- Every community-derived public statement can be traced to a release rule and source/age/uncertainty disclosure; every withheld or unverified state stays visibly distinct.
- With map CSS/tiles blocked, place and route text still lets the person decide what Mira knows.
- No notification or retention loop depends on raw incident density, contribution counts or a public profile.
