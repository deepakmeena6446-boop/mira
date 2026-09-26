# MIRA — V0 UX and UI specification

**Source of truth for interaction and presentation.** Product behavior is defined in `MIRA_PRODUCT_SPEC.md`; technical enforcement is in `MIRA_TECHNICAL_ARCHITECTURE.md`. The app is a mobile-first web experience for one pilot area. Every main action must be discoverable without conversational prompting.

## 1. Information architecture and navigation

Persistent mobile navigation: **Home / Know / Accompany / Report**. Desktop uses the same destinations in a compact header. An active journey adds a prominent but calm persistent “Journey active” chip linking to its session; it does not replace navigation. A discreet “About MIRA / Privacy / Map sources” footer is available everywhere. A moderator route is separate and absent from consumer navigation.

Routes: `/` home, `/know` search/results, `/know/place/[id]` place detail, `/accompany` setup or active journey, `/report` report flow, `/privacy` plain-language data practices, `/admin/login`, `/admin/reports`, `/admin/reports/[id]`. Keep origin/destination/coordinates in transient client state or POST body, never in query strings or route slugs. Browser back must not cause duplicate report submission or journey creation.

The first view asks **“Where are you going?”** with a place picker and three action cards: “Know the area,” “Make sure I reach,” “Share an observation.” If a journey is active, show its ETA/check-in card above the three actions. The home page contains one short promise (“Know more. Move freely.”) and one honest line (“MIRA shares observed conditions, not safety guarantees”). Do not lead with a crisis alert.

## 2. Shared UI rules

- Tone: direct, warm, non-alarmist. Use “observed,” “reported,” “listed,” “limited information,” and “last updated.” Avoid “safe,” “dangerous,” “risk score,” “victim score,” and fear-based prompts.
- Visual system: bright neutral canvas; deep ink text; one composed accent such as indigo or teal; restrained warm highlight for attention. Red is reserved for validation or delivery failure. No flashing, sirens, skulls, warning triangles, or crime heatmaps. Use spacious cards, strong typography, and map details that remain legible in sunlight.
- Accessibility: WCAG AA contrast, visible focus, 44px touch targets, semantic forms/headings, keyboard and screen-reader access, reduced-motion support, labels independent of color, readable error text, map alternatives in list form.
- Every asynchronous action has a loading state, no double-submit, success feedback, a recoverable failure state, and an unavailable-service state. Skeletons should match card shapes; never fill with fake information.
- Form fields preserve user input on retry. Do not autosubmit when speech transcription or AI suggestions finish. Sensitive free text is not saved to localStorage, URL, analytics, or error events.
- Dates/times display in Asia/Kolkata for the pilot with an explicit “IST” label. Relative freshness should include an absolute date on expansion or detail view.
- Location permission is requested only after tapping “Use my location.” Denial reveals manual place selection and does not block the flow.
- Map attribution is always visible. On map failure, the place and route evidence remain available as a text list. Search, route, and data errors are separate states.

## 3. Screen inventory and flows

| Screen | Purpose and primary action | Required states and content |
|---|---|---|
| Home | Choose Know, Accompany, or Report; resume active journey | New user, active journey, service-unavailable banner only when relevant; obvious three cards. |
| Know search | Pick one place or origin + destination, optional time context | Search typing, no matches, outside pilot, location denied, loading; results from local place index. |
| Know result | Inspect map/list, facts, observations, uncertainty | Place or route header; source/freshness; 0–2 real route choices; three evidence sections; no-data, partial-data, map-failure states. |
| Accompany setup | Enter destination and ETA, optionally invite one contact | ETA validation, email/contact consent explanation, mail unavailable, create-in-progress. |
| Active journey | Confirm arrival or end session; inspect contact status | Due countdown, contact pending/accepted/revoked, at-ETA prompt, missed, email sent/failed/none, auto-closed. |
| Contact invitation | Let invitee accept one journey alert | Token valid/expired/revoked/already used, exact alert scope, accept button, no live map or origin. |
| Report entry | Describe an observation quickly | Type/category/place/time, optional narrative, voice support or text fallback, validation and offline handling. |
| Report review | Confirm minimised structured information | Editable fields, highlighted detected PII, broad-area preview, third-party AI consent if offered, explicit submit. |
| Report acknowledgement | Confirm private receipt | “Received for review”; no promise of publication; return home/Know. |
| Privacy/about | Explain data use and limitations | Journey deletion, report aggregation, map source, contact scope, AI provider processing when enabled. |
| Admin login | Authenticate moderator | Password + rate-limited error; no account discovery. |
| Admin queue/detail | Review restricted reports | Pending/held/approved/rejected, PII flags, coarse place and private details for authorised admin only, approve structured fields or reject. |

## 4. KNOW flow and copy contract

Home → Know → select place or origin/destination → select `now/evening/late` → inspect result. Place detail includes a name, location on map, “Mapped information” list, “Community observations” section, and “What we don't know” statement. A route result lists up to two actual walking paths with approximate minutes and distance, then observations intersecting coarse corridor cells. Present route A/B neutrally: shortest or alternate; do not use green/red verdict badges. If only one connected route exists, show one. If none exists, say “Walking directions aren't available for these points yet” and retain place context.

OSM tags are phrased as “Mapped pharmacy” or “Listed hours: … (may be outdated).” A route card must never imply an untagged path is dark, deserted, staffed, or well lit. A community section with no qualifying observations reads “No recent community observations are available here. This is not a statement about current conditions.” If the selected time band has no matching observations, say so. Sources and last updated date are one tap away and visible in the text view. Outside pilot: no route comparison; explain coverage and allow return to a pilot place.

## 5. ACCOMPANY flow and copy contract

Home → Accompany → destination picker/manual label → ETA → optional contact email → explicit **Start journey**. Setup disclosure: “MIRA does not track your route. It asks you to check in at your ETA. If you miss the check-in by 10 minutes, MIRA can attempt one email to an accepted contact; delivery is not guaranteed.” If mail is not configured, suppress contact input and state “Contact alerts are unavailable; you can still use a private check-in.” A contact invitation is sent only after journey creation and the email is valid; the invitee accepts before any missed alert. The invite page states ETA, one-alert scope, and expiry; it shows a public place name only if the user selected one, otherwise “planned destination.” No map or movement details.

Active view shows ETA, time remaining, destination, one prominent **I arrived** button and secondary **End journey**. “I arrived” immediately shows completion and session data deletion timing. “End journey” asks one concise confirmation because it stops future contact alert. At ETA, if page open: “Time to check in. Did you arrive?” with Arrived / Extend ETA (once, max total 4 hours) / End. A missed journey stays visible if browser returns: “You missed the check-in. [Contact alert sent / delivery failed / delivery unconfirmed / no contact was notified].” Do not imply emergency response. An SMTP acceptance only warrants “sent,” not “received or read.” Expired/revoked contact link: simple explanation without journey details.

The browser may close at any time. The server worker owns missed-check-in processing. The product makes no promise about device-local reminders when closed. No persistent journey archive is shown.

## 6. REPORT flow and copy contract

Home → Report → experienced/witnessed + category + approximate place/recency/time of day + optional text → Review → Submit → Acknowledgement. Four short form blocks; progress indicator only if the flow needs more than one screen on mobile. Category labels use everyday words and do not force a legal classification. Narrative placeholder: “What happened or what did you notice? Leave out names, phone numbers, plates, and exact addresses.” Voice input appears only if verified on-device transcription exists; it uses clear recording/transcribing states and converts to editable text, never submits audio automatically. Otherwise there is no microphone control.

Review displays the structured tags and a **broad-area public preview** with “Only reviewed, combined observations may appear in Know.” If PII is detected, identify the span in the user's own text and ask them to remove or generalise it. If AI suggestions are offered, they are visibly suggestions, editable, and consented to separately; declining leaves the flow fully functional. The acknowledgement says “Thanks. Your observation is private while it is reviewed.” It does not expose a moderation status page or claim the report is verified.

Errors: invalid/off-pilot place, missing required fields, expired browser session, too many submissions, processing unavailable, network failure. Distinguish “saved” from “not sent”; never silently discard text. On lost connection, retain the form in memory until page reload and offer retry; do not store sensitive text on device.

## 7. Moderator UX

One password-protected queue sorted oldest pending first, with filters for pending/held/approved/rejected. Detail shows private report text only after explicit open, structured fields, PII flags, potential duplicate hints, source/time, and actions: edit allowed structured fields, approve for aggregation, hold, reject. Require a short reason for reject/hold, and confirm approve/reject once. Display a permanent notice: “Approval permits aggregation only; it never publishes this report.” Never include one-click raw publication, public preview of unthresholded data, bulk export, or user profile. Admin can remove an approved report from future aggregate releases. Keyboard access and responsive layout are required, but desktop may be the primary moderator surface.

## 8. Responsive and failure behavior

Design first for 360–430px widths, then tablet and desktop. Mobile map/result uses a bottom evidence sheet with snap points; the sheet cannot obscure map attribution or action buttons. Desktop can place map beside cards. Forms remain single column on mobile. Test 320px overflow, 200% text zoom, landscape, touch and keyboard. No horizontal scroll for core content.

If tiles fail, render the selected place name, route text, and source/coverage sections. If the pilot snapshot is missing, KNOW shows an honest setup/error state rather than generated map facts. If SMTP is absent, only contact invitation/alert controls are disabled. If AI is absent, no warning banner is needed because manual reporting is normal. If background worker is unhealthy, disable creation of journeys that promise timed contact alert and say why; check-in-only sessions may proceed if the architecture can still honour their expiry, otherwise disable the whole journey start.
