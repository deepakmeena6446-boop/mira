# Repository audit and implementation map

Audited base: `7ac26b3fe893962777cb70a5904b6241fbdf087c`, 9 October 2026.
Code and current route imports take precedence over historical documentation.
This is a static implementation audit plus local lint/typecheck/unit verification,
not a production, physical-device, or live-provider certification.

## Architecture to retain

Next.js 16.3.6 App Router, React 19, TypeScript, Tailwind 4; PostgreSQL/PostGIS
through current SQL/Drizzle migrations; separate Node worker; geo provider
abstractions and MapLibre; Claude/tool interface with scripted fallback; existing
account, consent, country, rate-limit and expiry machinery. Node >=22.11 is declared.

Read `AGENTS.md` and relevant `node_modules/next/dist/docs/` guides before code
changes. No new framework, service, database, auth scheme, or migration is planned.
The web app needs a database even for many guest APIs; no API key does not mean
no infrastructure. Keep production configuration and infrastructure untouched.

## Implementation status, grounded in code

“Implemented” below means code exists and was inspected, not externally verified.

| Area | Status and evidence | Reuse / action |
| --- | --- | --- |
| Navigation/Home | Implemented: `src/components/app/TabBar.tsx` uses Home/Mira/Around/Journeys. `src/app/(app)/HomeNow.tsx` shows LiveNow and HelpNext before ask input; requests nearby help, news and notes with a usable location | Reorder Home, preserve route structure. README's five-tab layout and older Go/Journeys/You notes do not describe current navigation |
| Plan | Implemented: `plan/page.tsx` defaults to `PlanDecision`; `?planStep=` uses `PlanScreen`; `/plan/legs` preserves detailed/return flows | Edit the active PlanDecision path; regress both entry points. Don't improve only the legacy planner |
| AI | Implemented: `/api/mira`, NDJSON cards, `providers/companion/{index,tools,claude,placeholder}.ts`; configured model default is `claude-sonnet-5-5` | Keep adapters/tool loop; no SDK migration. API key presence is not proof of a successful response |
| Deterministic plan Q&A | Implemented: `/api/mira/plan`, `src/domain/plan-ask.ts`; main MiraChat currently sends to `/api/mira` | Reuse pure helpers; don't assume the older endpoint is the only active chat path |
| Output guards | Partially effective: `claude.ts` passes `checkVerdicts: false`; other invented-action/number checks remain | Close unsupported factual/verdict path for the sprint response; don't claim every safeguard is absent or enable a brittle blanket word ban |
| Location/maps | Implemented: `location-store.ts`, LocationOnOpen, geo search/route/help/zone APIs, Google and OSM adapters, imported graph | Honor explicit location consent; separate selected place/device context and map/provider attribution; graph coverage is bounded |
| Local news | Implemented discovery/classification pipeline in `src/server/safety-intel/`; `SafetyUpdate.publishedAt` represents index time for GDELT, not necessarily event or publication time | Current recency/category filtering does not prove present actionability. Gate companion surfacing as below |
| Community/Scout | Implemented structured place/lighting signals, checks, corrections, receipts and Local Steward eligibility (`src/domain/contributions.ts`, `reputation.ts`, `src/server/contributions/`) | Keep evidence thresholds, conflicts, retention. Do not overhaul Scout or infer unique humans from email identities |
| Public incident notes | Conditional/not operationally established: private reports, moderated thresholded release; `MODERATION_POLICY.md` says nobody on duty; `PUBLIC_AGGREGATE_RELEASES` defaults off | Do not enable publication or promise human review. Separate these notes from structured place confirmations |
| Journeys | Implemented worker/state machine, manual/location flows, local guest check-in; TripScreen clears geolocation watch while hidden | Preserve; foreground updates cannot be advertised as continuous background tracking |
| Sharing/help | Implemented links/consent, dialler, optional email/push. `src/server/providers/whatsapp/index.ts` has `ADAPTER_IMPLEMENTED = false` | Manual WhatsApp send only; no dispatch. Treat worker health and delivery states as dependencies |
| Accounts/preferences | Implemented accounts, explicit mode/share prefs, help exclusions, opt-in habits, deletion/export | Reuse explicit settings; no new automatic habit learning |
| Persistence | Session draft TTL 2h; encrypted account plans 30d/max10. `saved-plans.ts` rejects device origins, Google resolutions, incomplete legs | Supported saving exists; universal saving is not implemented. Implement eligibility UX and query provenance repair, not a storage rewrite |
| Privacy defect candidate | MiraChat seeds a draft then posts its render-time `plan`; first movement turn can still have null plan. `/api/mira` persists when `user && !plan`. `storableCard` retains trip destination coordinates | Reproduce with integration tests; make movement/location turns ephemeral at the server and exclude location-bearing history cards |
| Release readiness | `docs/PUBLIC_BETA_RELEASE.md` explicitly NOT READY; some narrative/test counts are historical | Keep production verdict unchanged; report only current verification |

Archived mobile screenshots in `docs/phase1-ux/screenshots/` were visually inspected:
the local-stats card and contribution occupy space above the primary ask. They
are historical fixtures, not a freshly exercised live UI. Current code independently
confirms that hierarchy. Actual post-change mobile inspection is required by 04.

## Changes mapped to modules

### A. Entry and context

Modify `HomeNow.tsx`, `src/components/app/LocationOnOpen.tsx` only as needed for
prompt placement, `src/components/mira/Situations.tsx`, and existing ask handoff.
Preserve global explicit opt-in behaviour; remove unsolicited first-use Home prompt.
Keep named-place fallback in `plan/PlanSheets.tsx` and `around/AroundNow.tsx`.
Home input -> existing `/mira`; structured actions -> current Plan/Around routes.
Never put typed private context or coordinates into a new query-string handoff.

MiraChat, PlanDecision and AroundNow should share pure selection/presentation
rules, not a new global store or provider layer. Use `src/lib/brief.ts` and
`src/lib/decision-take.ts` where suitable; a small new pure module such as
`src/domain/companion-brief.ts` is allowed for a tested selection function.

### B. Short response contract

Use an internal typed view model, not an LLM-generated API truth object:

```ts
type BriefItem = {
  id: string;
  kind: 'listed' | 'community' | 'calculation' | 'estimate' | 'unknown' | 'failed';
  text: string;
  sourceLabel?: string;
  sourceUrl?: string;
  observedAt?: string; // actual observation/event time, if supplied
  checkedAt?: string;  // retrieval time; never substitutes for observedAt
  scopeLabel: string;
  limitation?: string;
};
// Actions are existing typed app actions/links, not arbitrary model URLs.
// The view also keeps underlying EvidenceState and place/time/mode context key.
```

Selection order: (1) requested question/explicit constraint; (2) information
needed for the chosen next action; (3) material time-sensitive local context;
(4) one useful secondary fact. Show at most three, de-duplicate, then expose the
rest in existing source details. Failure that limits the main action outranks
decorative facts. Unknown items do not all become a wall of warnings. No fabricated
facts to fill three slots. Explicit urgent intent uses existing immediate support.

Reuse `EvidenceState<T>`: ready, empty, partial, failed, unavailable. Keep missing
versus failed distinct. Empty only describes checked sources. All asynchronous
results must match selected place/geometry, mode, time and relevant timezone;
ignore/cancel stale requests. In particular current PlanDecision route fetching
does not pass a future departure to `/api/geo/route`: do not label transit/service
facts as verified “at that time”. Compute daylight separately from explicit time.

### C. News and community gate

Apply to information surfaced in the sprint companion summaries, Home, and the
selected-place context; don't turn a link to existing raw news into a priority
recommendation. Keep publisher, source URL, location precision, reporting status,
and “first indexed” semantics. Existing allegation labels must remain.

Automatic news item requires ALL: permitted source metadata; location explicitly
matching selected scope (city-level is never “on this route”); present relevance
established from the source, not index recency; and a concrete sourced implication
for this request. A generic old crime report fails. Current `SafetyUpdate` has no
reliable general-purpose operational expiry/action field, and `summary` is null in
the beta. Therefore default automatic news selection is **empty** unless the
existing data establishes those conditions directly. Do not add a model-generated
action/expiry, new ingestion system, or keyword heuristic pretending to verify
present conditions. The existing source browser can remain a labelled secondary
view; it must preserve broad scope and never imply route-specific risk.

Community items must pass existing server publication/claim rules and retain
observation period and scope. Coarse weekly incident notes cannot establish an
entrance or this evening's conditions. When freshness cannot support the summary,
leave the item out or show only historical evidence in explicit detail. Do not
change thresholds, enable publication, or treat a new private submission as a
verified public claim. Corrections use existing endpoint and review lifecycle.

### D. AI boundaries and deterministic path

LLM may extract intent and phrase non-consequential connective text. Sources and
deterministic code determine distances, timing, hours, evidence class, actions and
assistance claims. Reuse tool results; untrusted reports/headlines cannot issue
tool instructions. Do not introduce external tools or a new autonomy layer.

Retain `companionOutputIssue` checks for actions/numbers. Add focused tests for
unsupported verdicts, invented hours/dispatch, prompt injection, and valid English
and Hinglish questions/refusals that mention “safe”. A bare keyword ban is not an
adequate fix. If the generated short response cannot be validated against supplied
facts, serve the deterministic brief. It is acceptable to keep the consequential
summary wholly templated and let the model only interpret the request. Do not
expose unsafe streamed text before validating it; existing round buffering helps.

On model timeout/absence/quota, `providers/companion/index.ts` already falls back.
Ensure the fallback carries useful supported actions and avoids duplicate/contradictory
claims after a partial stream. A tool/database failure is distinct from an LLM
failure and may require an honest unavailable state rather than a full answer.

### E. Persistence, preferences and privacy

Use existing `planDraftSchema`, `plan-store.ts` and encrypted account saving.
Preserve the two-hour tab TTL, 30-day account expiry, max10, owner checks, deletion,
CSRF and no side-effect-on-open contracts. Create a shared save eligibility helper
covering the guards in `saved-plans.ts`; server validation stays authoritative.
Use it in both PlanDecision and PlanScreen. Follow 01's exact bounded save decision.

`PlanDecision.pick` currently sets destination `query` from result `p.name`, unlike
parts of PlanScreen; return-leg code also copies names. `serializePlanSession`
strips Google resolutions but retains `query`. Carry the actual user-entered query
through PlaceSheet callbacks and keep provider name only in ephemeral resolution.
Audit all selection and return paths. Don't simply rename provider data as user
data. No Google identifier-rehydration API or schema migration in this sprint.

Preferences: read `/api/me/prefs` using current schema. Explicit current request >
existing draft choice > remembered mode > existing default. Respect `helpExclude`
through current helpers. Persist changes only after an explicit setting action;
unsupported constraints must be acknowledged, not represented as guaranteed routing.

Privacy: add server-side movement detection to the history decision, including the
first turn with `plan: null`. At minimum never persist turns with a plan,
`shouldSeedPlan(message)`, or supplied location context. A validated optional
`ephemeral` request flag may carry the sprint entry's privacy intent for named-place
context requests; propagate it through handoff and follow-ups. Home outing/Around
context flows set it true. Keep generic history controls and explain which mode
is active. Do not trust React state to have updated before the first POST.
Do not store trip/help/nearby cards containing coordinates as chat history; keep
them ephemeral. Preserve old history deletion/export; no bulk migration or deletion
of pre-existing history is authorised. State this historical-data limitation.

No raw coordinates, typed destinations, prompts, share tokens or report text in
new telemetry/logs. Use current no-store headers and POST bodies for application
location requests. Existing third-party transfers still need honest disclosure;
don't claim all data stays on-device. Clear the existing scoped personal state on
sign-out/account change through current helpers.

### F. Action compatibility

Preserve GoSheet consent, `src/server/journey/` state machine, worker checks and
`src/lib/local-check-in-store.ts`. No journey starts from generating a reply,
choosing a map result, saving or opening a plan. “I'm here” remains the explicit
reliable end control; saying it in chat must not falsely imply the trip ended.

Preserve external navigation, manual WhatsApp/share-sheet flow, email outcomes,
freshness timestamps and revocation. Match copy in Home, Trip, follower page and
help surfaces: GPS updates while the web page is visible; missing email/worker
means no promised automatic alert. A listed Help Point is not staffed assistance.
Keep country-specific reviewed numbers and dialler wording; no model-number fallback.

## Dependencies and compatibility

Local test stack uses `docker-compose.yml` (PostGIS and Mailpit), committed sourced
pilot import, and separate `mira_test` / `mira_e2e` databases. Playwright's server
script drops schemas in its dedicated e2e database. Verify that target before
running; never use an existing personal or production database. Do not overwrite
an existing `.env.local` or run `env:local --force`. Runtime credentials were not
verified in this preparation; the managed environment reports no configured secret
bindings. That is not a reason to inspect secret contents or production systems.

Migrations are not required by frozen scope. If an unexpected schema defect blocks
a mandatory path, isolate and document it; use existing supported fallback and cut
stretch. Do not begin an unrelated persistence migration. Preserve old deep links,
API consumers, English/Hinglish behaviour, accessibility and existing test fixtures.
Update tests whose layout/copy is deliberately changed; retain behavioural assertions.
