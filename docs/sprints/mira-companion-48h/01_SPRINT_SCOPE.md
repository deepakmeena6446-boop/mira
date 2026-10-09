# Frozen sprint scope

The sprint is 48 elapsed hours of bounded development, not a promise to implement
every existing idea. Reuse the current Next.js application, APIs, stores, worker,
PostGIS, and component system. Keep the four existing navigation roots: Home,
Mira, Around, Journeys; profile remains accessible through Home. No navigation
migration, provider migration, or database migration is planned.

## Mandatory outcomes

| ID | User-visible result | Existing code to reuse | Dependencies | Definition of done |
| --- | --- | --- | --- | --- |
| M1 | Home explains Mira immediately and offers an outing input plus “Around a place” | `src/app/(app)/HomeNow.tsx`, `src/components/mira/Situations.tsx`, `src/lib/ask-handoff.ts` | Current routing and input hydration | At 320 and 390 CSS px, the purpose and first action precede metrics, contribution, map, and location prompt; input survives handoff; no first-open GPS request |
| M2 | Prepare an outing with named places/time or inspect context for a selected place | `plan/PlanDecision.tsx`, `plan/PlanSheets.tsx`, `around/AroundNow.tsx`, `/api/geo/search` | Working app/database; existing provider or imported pilot | Guest completes named-place entry without GPS; explicit selection resolves ambiguity; edits invalidate earlier evidence; no invented route when unsupported |
| M3 | Receive a concise prioritised response with source detail and actions | `src/lib/brief.ts`, `src/lib/decision-take.ts`, `MiraChat.tsx`, existing Evidence/Frame components | Source responses and deterministic fallbacks | Normally <=3 relevant summary items, <=2 primary actions, source/qualification beside consequential claims; complete/empty/partial/failed/unavailable states tested |
| M4 | Follow a real next action without misleading capability claims | `plan/GoSheet.tsx`, `trip/TripScreen.tsx`, `SafetyAccess.tsx`, existing share helpers | Existing selected action's dependencies | Directions/plan editing/help work where available; starting/sharing requires explicit consent; manual send, foreground GPS, dialler and email states described accurately |
| M5 | Revisit a draft or eligible saved plan and use existing explicit preferences | `plan-store.ts`, `saved-plans.ts`, `/api/me/plans`, `/api/me/prefs`, `trips/JourneysScreen.tsx` | Session storage; account+database for saved plans | Guest tab draft resumes within its existing two-hour TTL; signed-in eligible named plan saves/reopens/updates/deletes within 30 days; mode preference respected; no automatic sharing |
| M6 | Correct or contribute after seeing something relevant, without pressure | `AroundNow.tsx`, `ContributeScreen.tsx`, contribution/correction APIs | Existing authentication and evidence rules | One secondary path from selected place/brief; can skip and continue; actual success/failure shown; private submissions never called published or reviewed |
| M7 | Fail honestly and avoid unintended persistence/location exposure | Existing evidence states, output guards, session/CSRF and expiry logic | No new service | Missing AI, GPS denial, stale data, route/news failure and connectivity loss leave supported actions; no unsupported guarantees, stale cross-place response, or saved first movement turn |

Paths under `plan/`, `around/`, `mira/`, `trip/`, `trips/` above refer to
`src/app/(app)/`. Check actual filenames before editing; the technical map is in
[03](03_TECHNICAL_PLAN.md). M1–M7 are one release, not seven new feature systems.

### Save boundary: explicit bounded decision

Account saving currently rejects device-origin plans, Google-derived resolutions,
and incomplete legs. The mandatory sprint does **not** remove these server guards
or silently archive restricted provider content. Add a shared save-eligibility
result used before the click, with actionable copy:

- Guest: “Sign in to save”; retain the draft across sign-in.
- Device origin: “Choose a named starting place to save this plan.”
- Google result: “This plan can stay in this tab, but Mira can't save these place
  details to your account yet. You may need to choose the places again after a
  reload.” Explain the existing TTL; do not promise persistent Google resolutions.
- Partial leg: identify the leg that needs completion.
- Eligible plan: save normally; update the same saved ID; refresh evidence on open.

This is an honest bounded repair, not full Google-backed persistence. Correct the
current query/provenance leak: Google display names must not be copied into fields
described and persisted as user-entered queries. Preserve actual typed input in
place-selection callbacks, including return legs. Do not implement a new storage
scheme within mandatory scope. Identifier-only rehydration is deferred.

### Preferences boundary

Reuse the existing explicit travel mode and Help Point exclusions. A one-outing
constraint is not silently stored. A remembered sharing preference may preselect
an existing consent UI but never start sharing. New preference fields, background
habit inference, and a new preferences database are excluded.

## Conditional outcomes

| ID | Result and reuse | Condition | Done / fallback |
| --- | --- | --- | --- |
| C1 | Live model wording through current Claude provider | Valid credentials, network, budgets, output guard | Source-bound output passes evaluation; otherwise existing deterministic response, not a broken chat |
| C2 | Real place/route/map results through existing geo providers | Permitted credentials/egress or imported sourced pilot data | Label source and approximation; unsupported region or failed source stays unknown; manual plan and external navigation where valid |
| C3 | One relevant local update in the summary | Current pipeline supplies attribution, matching scope, and evidence of present actionable relevance | Apply 03's conservative gate; if it cannot be established, omit the item. No generic incident digest as filler |
| C4 | Community observation in the response | Existing API supplies publishable, current, appropriately scoped evidence | Preserve thresholds/conflicts/expiry; zero notes means omit, failure means couldn't check; never enable public incident releases |
| C5 | Actual account sign-in, email, push, or contact notification | Existing provider and local/staging test environment are available | Test the actual action; missing provider gets existing supported path and accurate state. Local Mailpit is simulated delivery |

The release does not depend on enabling C1, C3, C4, or C5 in a public environment.
Fixtures can establish code behaviour only; they must not enter normal production
responses or masquerade as real local information. Database absence is a real
runtime blocker for this architecture, not something the UI can universally fix.

## Stretch, only after all mandatory acceptance passes

- Better short follow-up wording for an already selected plan.
- One small contextual placement improvement to an existing correction control.
- Further reduction of duplicate source text without hiding qualifications.

No stretch item may introduce a new provider, migration, public feed, or a new
primary screen. Preserve verification time instead of chasing polish.

## Explicit exclusions

In addition to 00: no arrival-directory seeding project, invented entrance or last
service data, new off-app sharing product, renamed navigation, offline-first
service worker, rewritten auth, new onboarding, revamped Scout thresholds, new
reputation mechanism, altered moderation/publication thresholds, automatic WhatsApp
Business sender, or native background tracking. Existing return/multi-leg paths
must not regress, but no new itinerary engine is required.

## Feasibility challenge and cut line

The tempting but infeasible version combines a new Home, new chatbot, new local
feed, new persistence model, new community flywheel, and tracking overhaul. This
contract instead improves existing screens and fixes trust/continuity defects.

Allocate about 6 hours to audit/baseline, 12 to entry/context, 10 to concise
evidence/actions, 8 to continuity/privacy/contribution, and 12 to verification,
fixes and delivery. These are timeboxes, not performance promises.

If behind: cut stretch first, keep automatic local news absent, retain existing
community review rules, and use deterministic responses. Do not cut consent,
source-state handling, named-place entry, supported save/reopen, or regression
verification to fit more features. A failed mandatory gate must be reported as
incomplete; it cannot be renamed a pass by invoking this cut line.
