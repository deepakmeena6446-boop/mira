# Companion experience and screen contract

Implement improvements to current screens, not a cosmetic redesign or new app
shell. Reuse typography, colour tokens, sheets, buttons, EvidenceLedger, and
SafetyAccess. Keep Home / Mira / Around / Journeys and existing deep links.

## First three seconds: Home `/`

Order, including when no account or location exists:

1. Compact existing wordmark and help access. Keep emergency label accurate to the
   reviewed current-country profile; unknown location must not produce a guessed
   number. Do not enlarge assistance into the dominant content.
2. Heading: **“Step out with confidence.”** Supporting text: **“Tell Mira where
   you're heading, or explore what matters around a place.”** Warm greeting may
   accompany this, but must not replace purpose with “Here's what's true.”
3. Existing ask input, label “Where are you heading or what would you like to
   know?” Placeholder: “A run at 5 AM, heading home, a new neighbourhood…”
   Primary submit label “Ask Mira”. Preserve pre-hydration input handling.
4. Two compact choices: **“Plan an outing”** -> `/plan?for=go` and **“Around a
   place”** -> `/around?check=1`. Existing run/travel presets may follow; no feature
   grid. These structured paths must work without an LLM.
5. If present, one current-journey or resume-plan row. Active journey takes
   precedence over an older saved plan. Show explicit “Open journey” or “Resume
   plan”; never suggest a draft is being tracked.
6. Optional contextual information only after a place was selected or location
   was explicitly enabled. No automatic incident digest, ratios of Help Points,
   zero-contribution counters, or contribution request ahead of the user's job.

Remove the first-open LocationAsk placement from Home. Show a location explanation
when the user chooses “Use my location” inside the relevant flow. Named search is
always available beside it. Preserve an existing affirmative settings choice;
do not silently reset or expand consent.

At 390x844 and 320x568 CSS pixels, purpose and at least one primary input/action
must be visible without scrolling at default text size. At 200% text size permit
vertical scrolling, never horizontal scrolling or covered controls.

## New user, two equally valid paths

### A. Outing

Home -> ask or Plan -> choose the intended place(s) -> confirm relevant time and
mode -> brief -> edit, directions, or optional journey start.

Ask only for missing information necessary to calculate the requested answer.
“A run at 5 AM” is a time hint, not a date, timezone, or permission to use GPS.
Offer “Choose starting place” then date/time. Do not force a destination for a
loop or for a question that only needs local context. Do not require sign-in to
read the answer. Resolve ambiguous place names through existing result choices.

### B. Nearby or destination context

Home -> Around a place -> manual place search OR explicit “Use my location” ->
selected-place context -> source details and appropriate action.

Show “Around [selected place]” so it cannot be mistaken for the user's current
position. This path does not require a route, departure time, trip, or account.
Selecting a destination must not overwrite the device/current-country context
used by immediate emergency assistance.

## Response hierarchy: Mira, Plan and Around

Use the same principles, not necessarily one giant shared screen:

- A one-line acknowledgement of the request and selected place/time.
- Up to three relevant items, each with its evidence qualifier. Selection rules
  are fixed in 03. Do not always lead with daylight or Help Point counts.
- One material limitation near the related claim; remaining detail under “What
  Mira checked”. Never bury an action-critical limitation in a closed disclosure.
- One primary next action and at most one secondary action. Source links and
  evidence expansion remain accessible without resembling competing main CTAs.
- Optional map after the answer or behind “View map”; no map on Home.
- A short follow-up input may remain. The answer must be useful without a long
  chat; preserve the existing conversation route for questions that need it.

For a short-answer fixture, target 40–90 words excluding expandable evidence.
Do not truncate essential qualifications to meet that target. Incomplete requests
can be answered with one focused question and an action.

Example structure (content values only when supported, never hard-coded facts):

> You’re planning a walk from [A] to [B] at [chosen time].
> The mapped estimate is [duration]. It doesn't include live conditions.
> [One relevant listed-hours or community observation, if qualified.]
> I couldn't check [material missing source].
> **Review this plan** · **Change time**

Avoid “safest route”, “no incidents”, “help is available”, “I am with you until
you check in”, and “this area is fine”. A public place listing isn't a promise
that staff will help. A streetlight pole isn't evidence a lamp works tonight.

## Screen-by-screen changes

| Existing surface | Change | Keep |
| --- | --- | --- |
| HomeNow | Lead with purpose/input; remove unsolicited first-open location question and dominant live-count/contribution cards | Header, avatar, existing navigation, active-journey access, ask hydration |
| MiraChat | Prioritised answer/action presentation; reliable handoff; honest model failure; ephemeral movement/location handling | Streaming contract, explicit actions, urgent support access, generic history controls |
| PlanDecision | Short answer above expanded ledger/map; source scope and planned time correct; save eligibility visible | Place/time sheets, modes, run presets, return support and GoSheet |
| AroundNow | Named place or location choice; short context summary and optional correction | Search, source detail, map on demand, Help Point exclusions |
| JourneysScreen | Clear distinction between draft, saved plan and active journey; resume refreshes evidence | Delete/update controls, TTL, explicit trip-state actions |
| TripScreen / assistance / contribution | Targeted wording, status and entry-point fixes only | Consent, worker safeguards, location freshness, “I'm here”, revocation and private-report rules |

## Required scenarios

### Familiar returning user

Show the active journey first if one exists; otherwise a current draft or eligible
saved plan. Read explicit preferred mode when preparing a new plan. Existing draft
choices and a new explicit request override defaults. Opening a saved plan
refreshes evidence and asks the user to update a past departure time. Nothing
starts or shares merely because the plan was reopened. Do not add inferred habits.

### Early-morning outing

“I want to run at 5 AM.” Resolve starting place and the date/timezone. Explain a
solar calculation as calculated daylight, not weather or visibility. Use a real
mapped loop only if available; otherwise say no mapped loop was found and offer
change place/time or a manual plan. Do not invent gate hours, crowds, or working
lights. A manual check-in is optional and does not summon help.

### Evening commute or return

Respect selected travel mode and return time. Show existing supported route
information with its actual time basis. A route API called without departure time
does not establish transit service at the user's future departure. Copy:
“This is a route estimate; I haven't verified services at 11 PM.” Use existing
return-leg editing when requested; do not introduce timetable ingestion.
Sharing remains a deliberate choice after planning, not the answer to every
evening question.

### Unfamiliar destination

User selects the intended result, then sees useful available context and a next
action. Do not fabricate an entrance, pickup point, hotel desk, or assistance
availability. Where those facts do not exist, a correct place, route handoff, and
clear unknown can still be useful. Saved-plan restrictions are explained before
the user invests in the save action, following 01.

### Sparse local evidence

“I don't have current community information for this place. You can still review
the mapped option or change your plan.” If a check failed, instead say “I couldn't
check community information just now.” Don't imply everything was checked.
No empty report counts, score, fake testimonial, or guilt-based contribution CTA.

## Failure interactions

| Situation | Behaviour |
| --- | --- |
| GPS denied/times out | Stop spinner; explain once; offer named search and explicit retry; retain typed plan |
| Search fails/no matches | Distinguish failure from no match; retain query; retry/edit; no fabricated place result |
| AI absent/timeout/budget exhausted | Deterministic brief or focused question and supported actions; do not abandon the user at “try again” |
| Route fails | No drawn invented path; keep named plan, available independent context and edit/retry |
| News unavailable | Omit headline module; expose failed/unavailable status if a relevant requested check was attempted |
| Goes offline | Retain already loaded/session data with last-check state; do not claim a server save, share, or contribution succeeded |
| Cold offline start | Existing offline shell and retry; no promise of a complete offline database or dialling capability without stored number |
| Stale async response | Ignore response belonging to old place, mode, time, or plan; never label it current |

## Sharing, help and contribution

Sharing: use current journey consent. “Send on WhatsApp” opens a user-controlled
send flow; Mira has not sent the message. Email acceptance is not inbox delivery
or acknowledgement. State when location updates pause while the web app is hidden.
Guest/local check-in has no remote monitor; private does not mean monitored.

Help: keep SafetyAccess reachable and independent of AI. Device dialler actions
need a user tap. If country is unknown, offer existing manual country selection
instead of inferring it from a destination, language, or browser timezone.

Contribution: after selected-place context, show one secondary “Correct this
information” action or the existing appropriate check. If an account is required,
explain then and preserve context; declining never blocks the brief. A submitted
private report says “Submitted privately”, not “Others have been warned”. Failure
retains editable input in the current flow but does not silently store sensitive
reports offline. Preserve existing fields and moderation restrictions.

## Mobile details to implement and inspect

Minimum 44x44 CSS-pixel tap targets; 16px input text; visible labels and keyboard
focus; sensible heading order; sheet focus trap and return focus; reduced-motion
support; live status announcements without repeatedly reading streaming text.
Bottom navigation, active journey dock and keyboard must not cover input, consent,
save, or help controls. Keep long names wrapping, including translated labels;
no horizontal carousel is required to discover a critical action. Retain existing
light/dark themes. Do not add decorative animation as sprint work.
