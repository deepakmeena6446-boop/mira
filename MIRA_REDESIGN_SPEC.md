# Mira redesign experience specification

**Status:** Target experience and prototype brief. The initial production shell was implemented on 2026-10-01: Today, Around, explicit map, stable chatbot, contribution impact and revised first-open. Later sections describing richer place/community disclosures remain targets, not shipped claims. The launch constitution was amended; `PRINCIPLES.md`, community privacy and emergency correctness remain binding. All example local conditions below are **illustrative prototype data**, not claims about live Mira coverage.

## 1. Product contract

Mira is a community-powered safety and real-world intelligence companion. It helps someone understand a place and decide a next move using sourced context, other people's **independently checked** contributions, and personal safety tools they choose to activate. Its promise is useful on an ordinary day and while feeling uneasy. The experience should be recognisable from a sentence and interaction pattern: **“Here's what is known; here's what isn't; here's one useful next move.”**

The primary opening surface is a **contextual local briefing**, grounded in place and time. The persistent Mira tab remains the conversational companion for open questions, with sourced responses and user-chosen actions. Community is a method by which the briefing becomes better. The user does not need to become a “reporting operator.” Reports remain an important private input, but small corrections and Mira Checks are the routine contribution path. Existing journey, Circle and help tools provide standalone value where there is no community coverage.

## 2. First 60 seconds, in phone-sized moments

| Time | What appears | What the person learns | Exit |
|---|---|---|---|
| 0–20 s | One promise and one illustrated two-beat example: someone notices a useful local detail; others check it; Mira helps the next person. A short privacy line says sharing is chosen. No repeated three-step explainer below the illustration. | Mira is a safety companion improved by people, with a real local use. The example is labelled “Example.” | Continue or search a place. |
| 20–35 s | Location request explanation plus **Search a place instead**. Ask permission only on the person's tap. No account gate. | Location is optional for browsing and isn't passively stored. | Current area or searched area. |
| 35–60 s | Today opens to a real local briefing if evidence exists, otherwise an explicit coverage state. Place search is obvious. A restrained “What people help clarify” preview explains collective value, even when there is no release locally. | Personal value, limits and a way to help. | Open a place, Around, Contribute or help. |

This onboarding uses fewer words and decisions than the current four-item feature list. Do not silently fake a live community item in an empty area. The global empty variant should be intentionally designed and tested as often as the rich-data variant.

## 3. Screen contracts

### Today

**Answer before any scroll:** “Where am I in Mira's knowledge, what matters here now, and what can I do?”

**Glance budget:** one short heading, one current local fact or honest no-data state, source/time, one material unknown, one primary action, and a labelled Ask Mira entry. Put explanation behind a clear “Details” action. Do not duplicate the same fact in an introductory paragraph, a hero card and a local feed row. Preserve source failures, emergency access and chosen-sharing truth at the decision point even when that costs an extra line.

1. Small area/time scope and source status (“North Campus · checked recently”) plus a change-area action. No numeric “safety” value.
2. One local answer. If there is a relevant corroborated fact: condition sentence, age, source family, what remains unknown. If there isn't: “Mira has no confirmed local conditions here yet. That does not establish how it is now.” If a provider failed: say it failed. One tap opens the evidence ledger.
3. One primary intent: “Check a place” or active journey “Resume journey.” Saved-place shortcuts may follow without taking over. A compact, lower “Move with Mira” handoff explains that route context and chosen sharing are available; it is not a second competing hero.
4. One community handoff: “What people helped clarify” with at most two current, released non-identifying items; or a concise explanation of why it is empty. An eligible Mira Check can replace the lower item, not the main answer. A contribution affordance stays visible. A labelled **Ask Mira** entry sits near the place intent, and **Mira** remains in persistent navigation; neither replaces the evidence-led local answer.
5. Personal support remains reachable: “I feel unsafe” and verified Emergency / options have separate, stable one-tap controls. If an active journey exists, its capsule includes audience and end time.

Today is not a chronological incident feed. “Recent” is a validity property, not a content strategy. An empty condition does not suppress the place search, Help Points, or journey capability.

### Around / place discovery

Default view is **text-led**: current area, search, a few places or saved places and known context categories. A category is shown only if it has useful evidence or an honest coverage state. “View map” is explicit. Search should accept place, address or area; the existing `SearchOverlay` and provider adapters can be repackaged. Around keeps a list equivalent when map tiles fail. Opening Map is a spatial task with a meaningful question: where is the entrance, where is a Help Point, what is the walked route, how far away is it?

Do not put large POI lists ahead of local meaning. A generic pharmacy/restaurant pin list makes Mira feel like a map app again. Help Points should be ranked and labelled by why they might help, opening hours confidence, data source and whether the country profile changes their relevance.

### Community / local pulse

In the recommended architecture, Community is **a named section and disclosure on Today and Around**, not a fifth tab. It displays only publishable local intelligence, never individual report cards. Organise by practical condition (“access,” “lighting,” “transport”) with source type, coarse area, confirmation window and end of validity. A change log answers “What changed for someone making a decision?” rather than “Who posted recently?”

The current beta has public aggregate releases off. The first real build may show an honest “Local community conditions aren't available here yet” plus existing place evidence, correction impact and contribution invitation. Do not seed with synthetic posts or present external news as local community consensus. When release operations exist, show the ledger. If there is enough reliable coverage later, test whether a dedicated Community root improves comprehension before adding one.

### Contribute

The first screen pairs **“What have I helped clarify?”** with **“What do you actually know now?”** Show a private chart of *counted, independently verified* details by kind (lighting, place status, correction), plus separate pending/differed/archived explanations. Counts must never be raw submissions or a leaderboard. Mira Scout sits beside this impact, with its actual earned/not-yet-earned state and a plain-language explanation of sustained confirmation across days and areas. The illustrative storyboard uses a fictional earned Scout account; production must read the existing `ImpactView` and show real eligibility. This impact block must leave the eligible Mira Check reachable without hunting through an account screen. There are three contribution routes:

- **One quick Mira Check** only after arrival on a journey, about something the person actually passed, within the existing one-question limit. One factual, bounded answer. “Not sure” and skip are first-class. No push to walk somewhere to verify.
- **Correct a place or condition** through structured claims, with one per-person voice and independent corroboration. This is a stronger default for a male user who wants to help without using journey sharing.
- **Tell Mira something happened / a street condition changed** as a private report. The existing category grid and rough-area controls remain, but move below the everyday factual contribution path where relevant. Reports about harassment never become public individual stories or Scout credit.

The receipt must state its actual state: accepted privately, awaiting another independent answer, disagreed, verified and now in use, expired, withheld, or removed. Do not promise a report will be reviewed by a human unless that operation truly exists. If anonymous reporting is allowed, make it available without creating a profile.

### Private report and public aggregate detail

A **private report detail** is the author's own receipt: category, coarse area, when, what was submitted, retention/withdrawal and real processing state. Other users must never see it. The existing `src/server/report/submit.ts`, moderation and retention policies constrain this view. If there is currently no persistent user-accessible report receipt API, treat that screen as *NEW, gated by feasibility and privacy review*, not as implemented.

A **public local note detail** is a different object: a template-worded, thresholded, coarse statement produced by the aggregate release pipeline. It may show evidence class, release/expiry date, scope, limitations and how a person can challenge a factual condition without revealing any original reporter. The aggregate rules in `src/domain/aggregation.ts` and release gate in `src/server/aggregate/run.ts` remain authoritative. No comment thread, repost, exact location, raw quotation or “five people said” social proof for incident notes. The prototype “report detail” illustrates this **public note**, clearly labelled as an aggregate scenario.

**Lifecycle:** intake → deduplicate/classify deterministically → rate-limit/anti-abuse → moderation where required → independent corroboration and threshold → coarse template release → challenge/correction → recheck or suppress → expire and purge. Display state transitions only when the system has them; distinguish pending, differing, rejected, expired and withdrawn. A single incident report must not alter a public place verdict.

### Place intelligence

A place page starts with an answer to **“What do I know before going?”** rather than a route line. It then hands off to a **journey plan** that exposes the route engine Mira already has. The order is:

1. Place name and area, source age; unknown coverage stated early.
2. Current practical facts that affect arrival or use: staffed entrance/help access, opening hours if source-backed, route lighting coverage, local condition releases when available.
3. “What Mira could not check” on the same screen. Avoid a misleading all-clear when no data exists.
4. “Go with Mira” opens a plan with walking/ride/transit, alternatives where available, expected time or chosen ETA, lighting source/freshness, Help Points along the way, and the exact Circle/just-me share choice. These are built capabilities, not new feature requests.
5. “View route on map” when geometry matters; map not required to read facts.

Do not label a route “safe.” A route summary may compare practical tradeoffs (“better documented lighting; adds six minutes”) only where evidence supports both parts. The existing route/lighting/Help Point providers can be reused.

### Journey and travel context

During an active journey, position, route, ETA, what is ahead and whom the user chose to share with are genuinely spatial. Keep a full map here. Preserve the built **Send my live link, I'm here, +10 min, end without arriving, next Help Point, missed-arrival/delivery status, and worker/location-paused warnings**. After arrival, keep the existing one-optional-question flow, including the dark-walk lighting vote. The route is not presented as safety-certified. A persistent capsule lets the user return from any root. An unfamiliar city starts from a destination briefing with **country-specific, reviewed emergency details**, source coverage and the local unknowns; no India fallback. “Call me” or other decoy action is **not built** in this repository and is outside this redesign. Do not invent a new itinerary planner in this migration; the repo treats itinerary review as later-horizon work.

### Personal safety and Circle

The “I feel unsafe” and Emergency entries are separate, quiet, stable controls on all roots and prominent context actions during a journey. Emergency opens the reviewed local number in the dialler with one tap, or the existing options sheet when unknown/service-specific. The sheet opens instantly from already loaded state; order remains: move toward available help, tell chosen person, deliberate emergency call, location context. If a capability has no verified data, it says so. For sharing, always show **who sees the live link, whether an invite/message was actually sent, and when the link ends**. Circle management, privacy controls, saved places and habits live under You, with a short path from an active journey. Emergency/uneasy never depend on AI, auth, a fresh lookup or a map rendering.

### You / contribution identity

This is a private account and agency surface: Circle, saved places, what Mira remembers, notifications, travel preferences, impact receipts, Mira Scout if qualified, export/delete. A contributor with no journeys still sees useful impact. There are no public profiles, leaderboards, points or volume scores. Mira Scout means reliability across time/places and has no extra authority over truth.

## 4. Discoverability without a feature directory

The repository has more working capability than the first storyboard showed. The revised [capability inventory](MIRA_CURRENT_EXPERIENCE_AUDIT.md#capability-to-visibility-inventory-revisited-after-founder-feedback) maps each one to code and an entry point. A person should encounter the feature when a matching job arises:

| Job | First cue | Depth after a tap | Existing capability revealed |
|---|---|---|---|
| Understand this area | Today lead answer and “What people helped clarify.” | Local pulse, evidence ledger, sparse-state explanation. | Corroborated place/lighting claims and gated aggregate notes; source/age/unknown rules. |
| Check a place | Today search → Around. | Place fact → journey plan → optional map. | Search, saved places, hours/Help Points, source coverage, local context. |
| Go somewhere | “Move with Mira” handoff on Today/place. | Walk/ride/transit, alternatives, ETA, mapped lighting, Help Points, Circle/just-me choice. | Existing route and journey engine. |
| Stay connected while moving | Active capsule. | Live journey with audience, link handoff, ETA, next help, I'm here, +10 min, delivery/worker status. | Chosen Circle and privacy-limited trip lifecycle. |
| Feel unsafe | Separate, stable “I feel unsafe” and Emergency controls. | Instant prefetched help, tell people now, send link, call someone, reviewed local number, location in words. | Existing `UnsafeSheet` and country context. |
| Make a detail better | Contribute root or eligible arrival prompt; private verified-impact chart and Scout visible on Contribute. | One Mira Check or lighting vote, structured correction, private report, verified-only impact. | Existing contribution/reputation pipeline. |
| Ask an open question | Persistent Mira tab and labelled Today/place entry. | Source-aware answer with user-tapped action card. | Existing guarded AI/scripted tool orchestration. |
| Manage trust and memory | You overview. | Circle, saved places, travel preference, learned habits/forget, Help Point exclusions, notification choice, privacy, private Scout. | Existing account and device-local preference controls. |

**Home rule:** Today shows the community answer, one next intent and a short path to journey support. It does **not** show every setting, every provider or six equally weighted feature tiles. The depth screens must then expose the built features faithfully; hiding them to make Home “clean” would repeat the present mistake.

## 5. Trust is an interaction, not an icon

Tap a contextual claim to see a small **evidence ledger**:

- **Claim:** what Mira is willing to say, in practical terms.
- **Scope:** where and for what time of day (coarse for community incident information).
- **Source:** official, provider/OSM, independently corroborated community, or a combination. Do not collapse source types into a single “verified” tick.
- **Freshness:** observed/reviewed date, expected expiry, and whether source could not be rechecked.
- **Uncertainty:** missing segments, differing answers, limited source coverage, or known data age.
- **Next action:** check a route/place, answer if knowledgeable, retry a failed source or contact help.

Truth rules stay deterministic; AI may prioritise relevant evidence but never assert a fact. `src/domain/context.ts`, `src/domain/evidence-state.ts`, `src/domain/companion-output.ts` and the output guard remain boundaries. A “confirmed by community” indicator appears only after the appropriate independent threshold. Official ≠ community; verified ≠ certain; old ≠ current. One source failure cannot be converted to an empty result.

## 6. Seven scenario walkthroughs

| Person / intent | Start → outcome | Crucial safeguard |
|---|---|---|
| First-time woman | Welcome → Today local answer/unknown → inspect place → understand contribution chain. | No permission/account coercion; community promise visible before map. |
| Existing daily user | Today shows relevant local change or “nothing newly confirmed”; saved place and current journey are one tap away; optional pending Check. | No notification just to drive daily opens. |
| Checking before travel | Around search → place briefing → route/Help Points → optional map/journey. | Unfamiliar-place evidence gaps and country emergency confidence are explicit. |
| Notices a useful condition | Contribute → one structured observation or correction → private receipt → later real outcome if independently supported. | No instant public post or points. |
| Male contributor, little personal use | Contribute remains a full product path: correct a place, answer an eligible factual question, view private impact. | No gender-based modes; no requirement to share journeys. |
| Feeling uneasy | Stable uneasy entry → prefetched help / chosen contact; separate one-tap Emergency control; return calmly. | No AI/network gate or implicit alert claim. |
| New city traveller | Search destination without current location → coverage-aware place summary → country-specific options and sources → journey only if chosen. | No local-data vacuum disguised as safety or as India data. |

## 7. Empty-location matrix

| System reality | Today/Around sentence | What remains useful |
|---|---|---|
| No released community evidence | “No confirmed local conditions from the sources Mira checks here yet. This doesn't describe every street.” | Place search, route/time, Help Points, reviewed country help, contribution prompt. |
| Source returned no items | “Mira checked [source class] on [date] and found no current item in this scope.” | Same; do not infer absence of events. |
| Provider failed | “Mira couldn't check [source] right now.” | Retry; show independently available facts. |
| Source unavailable in geography | “[Type] is not available here yet.” | Name alternatives and explain coverage. |
| Source partially covers route | “Lighting is mapped on part of this walk.” | Show known/unknown segments; route still available. |
| Conflicting community evidence | “Recent answers differ, so Mira isn't making a claim.” | Offer an eligible check. |
| Expired item | Remove from current decision; optional dated history only if privacy rules allow. | Invite a current check; never carry forward the old certainty. |
| Location denied | “Choose a place to see what Mira knows.” | Search and manual place view. |

## 8. Retention without compulsion

Reasons to return: a saved-place detail changed, a route or Help Point needs checking before a real trip, a chosen journey is active, a trusted contact/Check needs action, or the person's contribution became genuinely useful. Daypart-aware context can gently change the relevant question. Keep “nothing has changed” quiet. Measure **comprehension, task completion, trust and useful confirmed facts**, not opens, time spent, pins shown or raw reports. The first improvement to retention may be making the app reliably useful before leaving home, not sending more notifications.

## 9. Prototype and validation boundaries

The standalone [mobile prototype](prototype/mira-mobile-concept.html) contains twenty-one navigable screen concepts at 390 px phone width and illustrative data from a fictionalised city context. It intentionally depicts a **future released aggregate** to make the design tangible; it labels that state “concept example.” The prototype also includes a sparse-area state. It makes no backend calls and writes no user data.

Before implementation, test 5-second comprehension with first-time users, map-hidden comprehension, 375×812 and 320×700 legibility, an empty area, an active journey, failed provider, location denied, and an uneasy state. Ask people what Mira knows, what it doesn't know, who can see their location, and whether an individual report will be shown publicly. A design passes only if those answers match reality.
