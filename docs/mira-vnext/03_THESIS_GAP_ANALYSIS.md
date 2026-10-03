# Frozen thesis versus current implementation

**Local implementation update (2026-10-03):** This table records the original pre-vNext gap analysis, not today's shipped behaviour. Go now leads with intent; a tab plan, grounded local options, plan Ask, confirmed foreground journey, remote legs and user-saved encrypted plan are implemented. Signed-in movement questions without a plan now enter ephemeral plan Ask, but first-turn understanding and non-movement routing have gaps recorded in [20](20_ACCEPTANCE_TESTS.md). Habit learning defaults off and old default-on accounts are paused for explicit review. Plan-linked community/news remains disabled. Real-device behaviour, live global providers, independent privacy/accessibility review and operations remain unproven; therefore the full engineering and release gates have not passed.

| Thesis requirement | Current implementation evidence | Gap and consequence | Required change |
|---|---|---|---|
| Start from intent | Today hero says “Check a place”; stable tabs Today/Around/Mira/Contribute/You. | User translates intent into feature choice. | One intent entry and plan state, with optional direct structured shortcuts. |
| Understand future place/time/mode | Mira context is current time/area/current location; route API accepts points/mode, not departure time or purpose. | Late arrival and future run lack temporal context. | Resolve explicit origin/destination, future time, mode and constraints; distinguish current vs planned conditions. |
| Compare viable options | Walking API gives up to three routes + lighting/help; UI shows alternatives, AI lacks full comparison tool. | User composes tradeoffs herself. | Deterministic option builder + evidence comparison; AI explains, not invents. |
| Navigate within Mira | `/trip` has map/route and foreground GPS; no turn-by-turn or guaranteed background location. | Journey ownership is partial. | Own foreground journey state and wayfinding guidance where provider data supports; visibly pause/fallback when backgrounded. Native-only needs recorded separately. |
| Adapt | Trip can extend/end/arrive; route can be re-fetched but no coherent change-of-plan flow. | Conditions changing do not re-enter decision loop. | Retain intent and chosen option; show current status, alternatives and explicit replanning action. |
| Appropriate support | Help Points ranked by estimated walk/time/class, not verified staffing/access/routed reachability. | Nearest may be unusable. | Support-place eligibility and verification states; never promise staffed without evidence. |
| Community as intelligence | Checks/corrections exist; public reports off and thresholded/weekly. | Little immediate, contextual local intelligence. | Structured fact loop first; privacy-preserving incident release only with operations. |
| News only when movement-relevant | Today/Around display city safety updates as sections. | City article can raise alarm without changing choice. | Contextual local-development pipeline and suppression when no affected movement. |
| Global with honest coverage | 195 registry, 60 reviewed emergency profiles; geo quality uneven. | “Works globally” can imply uniform local intelligence. | Per-claim coverage state, not a blanket city/country badge. |
| Natural recurrence | Saved places/habits and journeys, but no demonstrated decision funnel. | Could reward opens rather than value. | Repeat intent with consent; measure usable decisions and corrections, not DAU alone. |

## Thesis conflicts to carry explicitly

1. **Navigation:** older research suggested map handoff; founder now explicitly allows Mira to own the in-app journey. V1 therefore owns the foreground journey, with provider routing underneath. It does not promise lock-screen navigation or continuous background tracking.
2. **Local news:** current Today and Around use an “Official & news updates” section. Frozen thesis demotes this to an intelligence input; remove the generic feed surface from primary journey UX after relevance-gated replacement exists.
3. **Ask Mira:** current tool guide says begin safety-judgement questions with a fixed “not enough verified information” line and offer facts. Frozen thesis requires options and a next action when possible, while still refusing guarantees and unsupported verdicts. Replace the interaction contract; retain factual grounding.
4. **Community:** current private report and weekly release pipeline protects privacy but does not meet the desired timely local knowledge loop. Do not weaken privacy thresholds just to create content; grow checks/corrections and operate a bounded pilot.
5. **Personalisation:** the Phase 0 habit default-on conflict was addressed locally by migration `0020`: new accounts start off; old preference is preserved for review while learning and suggestions pause. Existing rows are available to inspect or delete until retention. Independent privacy review is still required; decision [D26](22_DECISION_LOG.md).

## Gap severity

**Blocking the thesis in V1:** intent capture, future/remote context, option comparison, evidence eligibility, active journey/adaptation integration, support-place truthfulness. **Important but density dependent:** original community intelligence, live disruptions and local verification. **Not needed for V1:** own global routing engine, predictions, passive monitoring and broad booking. See [15](15_V1_PRODUCT_CONTRACT.md).
