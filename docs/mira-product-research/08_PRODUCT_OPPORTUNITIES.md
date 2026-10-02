# Product opportunities, feasibility and priority

Research date: 2026-10-02. Priorities are **recommendations to validate**, not a build order approved by users. “Available now” means current data/APIs can technically support a useful scoped version; it does not imply Mira already implements it or that claims are validated. Evidence basis: [user research](02_USER_NEEDS_RESEARCH.md), [competitive audit](03_MARKET_COMPETITIVE_RESEARCH.md), [AI substitution](05_MIRA_VS_GENERIC_AI.md), [intelligence model](06_SAFETY_INTELLIGENCE_MODEL.md).

## Criteria

Rank by observed decision need, frequency, ability to change a feasible option, correctness and coverage of inputs, privacy/trust cost, and whether the answer is materially better than an LLM plus Maps. A high safety impact claim needs stronger validation than a convenience claim. No adoption estimate or crime reduction estimate is available.

| Capability | Priority | Feasibility | Dependency / proof | LLM + Maps substitution |
|---|---|---|---|---|
| Intent first planning for a concrete movement (run, walk, commute, pickup, late arrival) | **P0** | **AVAILABLE NOW** for a bounded flow | Validate tasks and evidence/unknown language with users. Must offer viable options. | Prose is commodity; decision workflow with current Mira data must outperform. |
| Evidence ledger in every consequential answer (source, freshness, coverage, limitation) | **P0** | **AVAILABLE NOW** conceptually; data plumbing varies | Must know provenance of each input; no unsupported certainty. | General AI can cite sources, but Mira can make consistent claim eligibility and expiry rules. |
| Situation suited help options with open/access/staffing distinctions and route ETA | **P0** | **AVAILABLE NOW** partially; **PARTNERSHIPS/COMMUNITY SCALE** for verified staffing and entry | Test real place failures; never infer staffing from hours. | Places/hours are commodity; verified availability and suitability are the gain. |
| Compare feasible route/time/mode options with tradeoffs, including uncertainty | **P0** | **AVAILABLE NOW** for time/distance/daylight; **COMMUNITY SCALE/PARTNERSHIPS** for segment conditions | Start with known attributes, not “safest route.” | Maps handles routes; Mira must add credible contextual signals and action. |
| Calm “what if something changes?” options plus correct emergency pathway | **P0** | **AVAILABLE NOW**, country coverage conditional | Test under pressure and failure; exact call/share state must be accurate. | Generic advice is commodity; one tap, situation-specific action matters. |
| Privacy-preserving measurement of decision success and factual failures | **P0** | **AVAILABLE NOW** | Current app has operational logs but no product funnel; measure usable-option, correction and critical-error outcomes without raw location trails. | This is a product-learning requirement, not a consumer moat. |
| Structured observation and correction intake, with privacy and moderation | **P1** | **AVAILABLE NOW** to build; useful intelligence **POSSIBLE WITH COMMUNITY SCALE** | Pilot narrow facts and corrections; measure moderation/coverage. | Compounding local history is the potential moat. |
| Place/segment verification and freshness operations | **P1** | **COMMUNITY SCALE / PARTNERSHIPS** | Requires sustained checking and reversal; verify staffing/access. | Hard to reconstruct with one AI query. |
| User-approved journey preferences and saved choices | **P1** | **AVAILABLE NOW** | Keep sensitive data narrow and user controlled; test time saved. | AI memory exists; value depends on privacy and movement actions. |
| Opt-in trip/arrival check-in with revocable contact sharing | **P1** | **AVAILABLE NOW** | Audit stalking threats, delivery reliability and false action claims. | Sharing exists elsewhere; integration within decisions may reduce effort. |
| Destination arrival briefs: late landing, hotel access, last mile, local support | **P1** in a scoped launch geography, **P2** broad global | **AVAILABLE NOW** for official facts; **PARTNERSHIPS** for live service/local verification | Test a few concrete decisions, not generic city guides. | High commodity risk without operational data. |
| Proactive trip prompts tied to explicitly saved plans | **P2** | **AVAILABLE NOW** but notification value unproved | Opt in and measure actionability vs annoyance. | Assistants/calendar apps can prompt; movement context must add value. |
| Live transport disruption/ride pickup intelligence | **P2** | **PARTNERSHIPS** or region-specific APIs | Coverage and licensing city by city. | Providers often own best live data. |
| Community-aware route context at time of travel | **P2** initially | **POSSIBLE WITH COMMUNITY SCALE** | Dense independent observations, bias audit, no risk probability. | Potential differentiation, but cannot be promised globally. |
| Automatic routine inference/deviation alerts | **DON'T BUILD YET** | **RESEARCH/EXPERIMENTAL** | Stalking and false alert risks; unclear user demand. | Similar functionality exists; trust cost high. |
| Universal women-safety score / “safest route” verdict | **DON'T BUILD YET** | **SHOULD NOT BUILD** | Ground truth and coverage inadequate; false precision. | Easy to mimic and potentially harmful. |
| Passive continuous tracking as default | **DON'T BUILD YET** | **SHOULD NOT BUILD** | Privacy threat exceeds demonstrated value. | Existing tracking products do this. |
| Public live incident feed and reward-based reporting | **DON'T BUILD YET** | **SHOULD NOT BUILD** in proposed form | Privacy, misinformation and anxiety; low link to decisions. | Existing feeds already serve awareness. |
| Own turn-by-turn mapping/navigation engine | **DON'T BUILD YET** | **SHOULD NOT BUILD** for thesis | Very high cost; Maps incumbents win. | Fully substitutable. |

## P0 proof of value

Before building a broad system, test three decision moments: early run outside a familiar campus, late return after a social/work event, and unfamiliar late arrival. A user should be able to state intent, understand two plausible options and their evidence gaps, choose a step, and recover when a place or route is unusable. Compare with Google Maps plus a current LLM. Stop or narrow the feature if Mira cannot deliver a better decision using reliable inputs.

## Global reality

Globally plausible from V1: intent capture, time/daylight, basic route geometry where maps exist, official country guidance where reviewed, user-owned plans, controlled contact sharing, and honest unknown states. Local and uneven: operational transit, staffed places, route lighting quality, crime data, community observations, harassment patterns and help availability. “Best available refuge” is a city-level operational claim, not a global V1 claim. Avoid marketing “global safety intelligence” until measured coverage and quality support it. Data licensing also limits what third-party place facts Mira can retain or call proprietary. [Current country coverage](../COUNTRY_COVERAGE.md), [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
