# V1: minimum coherent expression of the frozen thesis

V1 is a **single intent-to-journey product** usable with baseline data in multiple countries and locally enriched only where verified. It is not a global guarantee or an emergency service. Existing place/map/trip infrastructure should be reused. The V1 north-star measure is **completed useful movement decisions**, assessed with task success and correction/error rates, not daily opens.

## In scope

1. Guest or signed-in user enters activity, origin/destination or loop, planned time, mode and essential constraints; explicit remote/future planning works without current location.
2. Mira produces feasible options from available provider routes/place facts, daylight and reviewed country context; shows claim provenance, age, missing data and a practical next step. One useful partial answer before any second clarification.
3. Option comparison and map/text detail for walk/run, ride and transit where supported. If provider offers no route/service evidence, use a labelled manual-plan/handoff state; never invent a service or “safest” option.
4. User chooses an option, starts a **foreground** Mira journey, optionally shares with chosen contacts, sees live freshness/ETA, can replan, end, check in, seek support and open Emergency.
5. A discomfort flow ranks *candidate* support places for scenario and reachable route where data permit, labels unverified staffing/access, and offers contact/emergency without a place result.
6. Optional post-journey place/route fact correction through existing Checks/lighting/correction foundations; private incidents retain present moderation/privacy limits. Local news only when a sourced development materially affects the plan.
7. Explicit saved-plan/consent controls and privacy-preserving success/failure instrumentation. No raw coordinates, user chat text or contact identity in product analytics.

## Seven required demonstration tasks

| Task | V1 minimum outcome |
|---|---|
| Early run | Set 4:45 departure/loop; distinguish calculated darkness from unverified lighting/activity; compare feasible route/time alternatives, then start. |
| Late commute/return | Office-to-home at midnight, available modes/known hours and last-mile unknowns; choose, share optionally and adapt. |
| Unfamiliar local destination | Resolve destination, compare arrival/return route context, act without location grant if named origin supplied. |
| Date/event | Plan arrival and departure/return, optional chosen check-in; no relationship coaching. |
| Late arrival in another city | Remote planned origin/hotel and late time; sourced transport facts if available; honest manual/provider handoff otherwise. |
| Basic trip planning | Multiple journey legs or arrival/departure plans with reviewed country essentials, not itinerary/booking. |
| Uncomfortable during journey | Immediate support/change/contact/emergency options without a chat delay or false open/staffed claim. |

The S1 guest/no-location start requirement and the minimum route/time comparison remain an explicit acceptance question in [23](23_OPEN_QUESTIONS.md). A private tab timer must not be described as a monitored journey or used alone to pass S1.

## Explicit exclusions and gates

No live background GPS promise, lock-screen turn guidance, automated crime prediction, universal risk score, incident feed, booking, ride transaction, global verified refuge, inferred routine alert or general lifestyle advice. A city-level local claim is **feature-gated by measured source coverage and verification operations**. If a source or provider is unavailable, V1 must continue at the honest baseline. Emergency and chosen journey support remain usable without AI.

**V1 engineering acceptance:** all seven scripted tasks and the cross-cutting gates in [20](20_ACCEPTANCE_TESTS.md) pass, including privacy, emergency, worker, device and evidence checks. External-user comparison is useful later for product learning; it is not a condition for marking the build complete. A passing build does not guarantee anyone's safety.

**Implementation state, 2026-10-03:** The local build has Go/Journeys/You, signed-in and guest ephemeral movement Ask, explicit encrypted saved plans, a private guest timer and a legacy habit-consent transition. It does not yet satisfy full engineering acceptance: all seven scenarios remain partial, including first-turn Ask, S1 and S4 gaps; real-device journey behaviour was skipped by user direction, and live provider, privacy/security and operational checks remain open. Phase 6 enrichment is disabled; that is an honest low-coverage state, not a blocker to the baseline product. The separate public beta verdict stays **NOT READY**. [Current evidence](20_ACCEPTANCE_TESTS.md).
