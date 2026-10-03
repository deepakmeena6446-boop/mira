# Plan → move → adapt → arrive

**Founder direction:** Mira may own the *journey experience* while provider infrastructure computes maps/routes. The current `/trip` already owns an active map, ETA, Help Points, contact sharing, arrival and a foreground geolocation watch. It is not reliable turn-by-turn/background navigation. [Trip screen](<../../src/app/(app)/trip/TripScreen.tsx>), [route provider](../../src/server/providers/geo/types.ts).

## State machine

`draft → options_ready/partial → option_chosen → ready_to_start → active → paused_location/needs_replan → arrived/ended/missed → optional_feedback → purged`. `unknown_route` is a valid draft/plan state; it must not be drawn as a street route. A changed destination, mode, contact list or route requires explicit confirmation and a new plan/action receipt. Existing journey state and missed-alert worker remain authoritative for alerts and deletion.

## Foreground contract

The active screen shows selected route or explicit non-route plan, current position age/accuracy, ETA/check-in time, next instruction only when a provider supplies reliable maneuver data, route context, “change plan,” “I need options,” Emergency, recipients and delivery state. The map can recenter, but the text view must work without visual map access. When app hidden/locked, browser location may stop; show last update age to user and contact, do not imply continuous monitoring, and preserve missed check-in if worker healthy. On resume, refresh position/evidence before claiming current conditions. Battery, data usage and screen wake lock must be tested on real devices.

## Adaptation

Trigger only on user request, route/service closure confirmed for the selected leg, lost route/provider failure, or materially late ETA. Keep the intent and constraints, regenerate feasible options from current position/time, display changed facts, ask the woman to choose. Never silently share a new destination with contacts. If no route provider is available, offer manual destination/contact check-in and external map handoff; label limits.

## Capability classification

| Capability | Class and boundary |
|---|---|
| Foreground map, GPS age, chosen route, support actions, ETA/check-in, replan | **Can build reliably now** with existing web/worker foundations, after acceptance tests. |
| Background GPS, lock-screen turn guidance, dependable movement notifications | **Needs native app later**; PWA cannot promise continuous execution. |
| Maneuvers, live transit/rerouting, traffic, venue indoor entrances | **Requires provider capability** and licensing; current GeoProvider exposes geometry/ETA, not maneuver steps. |
| Time-specific local route conditions and staffed-place confirmation | **Requires community density and verification operations**. |
| Official disruptions, transit service and emergency response integration | **Requires regional data/partnerships**, coverage measured city by city. |

**No false safety claim:** reaching a selected route's end is not proof the person is safe; arrival check-in is a state/action. Do not convert GPS silence into danger or broadcast it to contacts without a user-approved rule. A missed ETA follows the existing explicit check-in contract. [Worker](../../src/server/journey/worker.ts), [privacy](16_DATA_AND_PRIVACY_CONTRACT.md).

## Phase 4 local implementation boundary (2026-10-02)

The map connects a selected, source-eligible walking option to a two-step live start. The actual start rechecks planned time (within 30 minutes of now), a fresh device fix (within 30 seconds and at most 100 m reported accuracy), and proximity to the resolved origin. It rejects a route whose graph endpoints are more than 250 m from the selected places. Remote/future intent remains a plan until edited or reached. Start returns the existing journey record; sharing with Circle defaults off and requires an explicit selection. Ask's legacy trip button also starts privately.

The active trip screen displays the age of the last device fix and last successful upload, reported fix accuracy when available, and a hidden/locked browser warning. The GPS watch stops when the page is hidden and resumes with a server refresh when visible. A planned route stays on device. Route review uses the imported OSM walking graph; it only changes the shown route and worker ETA after the user confirms the new estimate. A Help Point may be chosen as a new destination with a user-entered check-in time; its route and staffing are explicitly unverified. The server updates the same journey and token without adding recipients or sending a new notification. Closed/unknown hours are handled by the existing candidate rules, not promoted to staffed or reachable claims.

For a walking loop with no mapped path, Around's map offers a manual check-in-only start. The person chooses an interval and separately confirms; a fresh device position must be close to the resolved origin at the planned time. The API receives no destination or mapped route, sets `autoArrival=false`, and the active screen requires a deliberate “I'm okay — stop sharing” action. Denied location leaves the plan available. This is a truthful fallback for unavailable loop routing, not route guidance or an automatic return check.

**Guest loop continuation (2026-10-03):** A guest with location denied can separately confirm a private foreground check-in timer at the planned time. `/trip/local` stores only start/due timestamps in this tab, can resume from Journeys, and expires 30 minutes after due. It has direct Emergency and support actions, but cannot verify position, detect return, monitor in the background, share, alert anyone or send a worker check-in. The signed-in live journey above remains a distinct action with fresh GPS and the existing worker safeguards. A calculated later daylight option helps choose a departure time without implying loop routing, lighting or running pace.

Real phone battery, locked-screen and wake-lock behavior has not been verified. This local implementation does not establish a Phase 4 PASS or a background-location capability.
