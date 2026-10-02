# Conceptual intelligence and decision model

This is a **product vocabulary**, not a database schema. The minimal unit is a movement decision at a particular time. Source data stay distinct from model inference. [Current evidence state](../../src/domain/evidence-state.ts) and [route API](../../src/app/api/geo/route/route.ts) are reusable seeds.

| Concept | Purpose/source | Lifecycle + sensitivity | Freshness and decision effect |
|---|---|---|---|
| `MovementIntent` | User's goal, origin/destination or loop, time, mode, constraints | Per plan; sensitive because it can reveal routine; user-owned | Drives relevant retrieval and option set, never public. |
| `JourneyOption` | Feasible candidate route/time/mode with duration, cost/accessibility constraints, support possibilities | Generated for one decision; transient unless saved | Compare only same intended move and current/future time. |
| `Route/Segment` | Provider geometry and labelled segment conditions | Third-party rights apply; avoid indefinite caching | A route condition applies only to its mapped segment and observed time. |
| `Place/SupportPlace` | POI and operational role (entry, access, hours, staffing, suitability) | Provider terms and source expiry; may include original local verification | Listed hours ≠ open now; open now ≠ staffed; support rank needs route and scenario. |
| `ConditionClaim` | Lighting, closure, obstruction, service operation, weather where sourced | Source claim with observation and expiry; privacy depends on contributor | Changes option only where route/time overlaps. |
| `CommunityObservation` | Consent-based first-hand fact/experience/correction | Private raw input; eligible derived claim after checks | Distinguish report, independent corroboration and verified fact. |
| `OfficialAdvisory/LocalDevelopment` | Government/operator/news fact | Sourced, geographically scoped, expiring | Only surface if decision/action changes. |
| `EvidenceClaim` | Claim + provenance + observed/published/checked time, scope, source state, verification, contradiction and permitted wording | Derived and auditable; no implied truth from LLM | Gates what can be said. |
| `CoverageState` | Whether source for that claim/place/time is ready, partial, empty, stale, failed or unavailable | Per claim and lookup, not per city alone | Empty is not zero risk; failed is not empty. |
| `UserPreference/TrustedContact` | Explicit modes, saved place, exclusions, sharing recipients | Encrypted/user controlled; opt-in history | Constrains choices; never infers consent to share. |
| `ActiveJourney/ActionReceipt` | Chosen option, progress, location freshness, action and delivery status | Short-lived, highly sensitive | Powers adaptation and truthful “sent/started/paused” claims. |

## Decision engine contract

1. Resolve intent and any indispensable context.
2. Generate feasible candidate options before selecting evidence; reject impossible modes/closed services.
3. Retrieve only claims that intersect option geography, time and mode.
4. Check eligibility: source validity, freshness, independence, contradictions, precision and provider rights.
5. Compare meaningful differences and burdens; do not reward any route for having fewer reports when reporting coverage is low.
6. Show unknowns that could change the decision. If evidence is too thin, compare only known facts and let the user choose or gather more.
7. Offer the least disruptive practical next step; user confirms consequential action.
8. During movement, recompute only when position/time/provider state changes meaningfully or the user requests it. Explain what changed.

**Hard rules:** no guarantee or safety percentage; no crime prediction; no raw report → “dangerous place” conversion; no group/occupation risk proxy; no “staffed” from a category/opening hours; no “live” from stale data; no routed ETA from a straight-line estimate; no source-less AI local fact; no silent route/share change. Comparative language is permitted when supported (“the station entrance was checked today; hotel access is unknown”).

**Confidence:** use claim-specific states (`official_current`, `provider_current`, `community_corroborated`, `single_unverified`, `stale`, `failed`, `not_covered`), not one overall percentage. Freshness windows depend on claim volatility: closure/service minutes-hours; opening/access hours or last verified date; infrastructure weeks/months; historical incident remains historical. Exact thresholds must be calibrated with field checks before public “verified” labels. [Research model](../mira-product-research/06_SAFETY_INTELLIGENCE_MODEL.md).

## Phase 2 resolver now implemented

`src/domain/plan-options.ts` separates `ready`, `missing`, `empty`, `stale` and `failed` for the imported public walking graph. Its route evidence cites the OSM **snapshot** `source_date`, route coordinates and a 365-day eligibility window. Graph distance at 4.5 km/h is an estimate, and the router only emits a second path when it meets the existing distinctness/stretch rules. No route is inferred from a straight line. The planned daylight claim uses an approximate NOAA solar-position calculation with time-zone conversion; ambiguity at DST transitions, twilight and unsupported latitude produce unknown evidence. Ride/transit service, lighting and opening hours at planned time remain unknown. The resolver does not rank personal safety or draw a conclusion from missing community reports.
