# MIRA — Product specification (V0)

**Source of truth for what to build.** Read with `MIRA_UX_UI_SPEC.md`, `MIRA_TECHNICAL_ARCHITECTURE.md`, and `MIRA_OVERNIGHT_EXECUTION_PLAN.md`. The execution plan controls sequence; this document controls product behavior. This is a greenfield specification: the workspace was empty on 2026-09-24.

## 1. Purpose, user, and promise

**MIRA: Know more. Move freely.** A free, open-source minded, privacy-first, community-powered companion for women moving through a city. It helps someone understand observed conditions before a trip, arrange a temporary check-in, and contribute local observations. It offers context and uncertainty, never a guarantee of safety. Its tone is calm, capable, and useful for ordinary travel.

The first user is a woman moving between a metro station, university, hostel, shops, and nearby streets in a single pilot area. She may be unfamiliar with the area, travelling late, or simply planning a route. A trusted contact is a separate, invited recipient for **one** journey. A moderator sees private reports for review. No public user profiles, social graph, or guardians exist.

Jobs to be done:

1. **KNOW:** “What has been observed about this place or route, at this time, and how much information is available?”
2. **ACCOMPANY:** “Help me set a check-in and, if I miss it, notify the one person I chose and who accepted.”
3. **REPORT:** “Let me describe what I experienced or observed without publicly exposing me or another person.”

## 2. V0 boundary and truthfulness

V0 is a mobile-first web app for **Delhi University North Campus around Vishwavidyalaya Metro**, limited to the pilot rectangle **28.6850–28.7050° N, 77.2020–77.2250° E**. Its exact boundary and source snapshot are recorded in the map-data manifest during implementation; the map importer must validate them. Elsewhere, show “MIRA does not cover this area yet,” and allow viewing only generic map data if available. Do not imply citywide coverage.

The three home actions are KNOW, ACCOMPANY, REPORT. An anonymous visitor can inspect KNOW and submit a report. No end-user account is required. ACCOMPANY uses a private browser session, manual arrival confirmation, and an optional contact who explicitly accepts an invitation for that journey. It does **not** continuously track location. Contact notification requires a configured delivery service; without one, journey self check-ins still work and the UI clearly says contact alerts are unavailable. A browser tab or PWA alone cannot promise reliable reminders after closure.

Day-1 KNOW uses a real, attributed OpenStreetMap snapshot of places, walkable ways, and available tags. It may show sourced transport, pharmacy, staffed/public places, and listed opening hours when present; missing tags are **unknown**, not negative observations. Route lines and durations derive from a real imported walking graph or are withheld. No invented incident history, fabricated audits, or synthetic observations appear in production. Community reports improve information only after review and privacy-safe aggregation.

V0 excludes native phone calls. A bounded “Stay with me” experiment may offer in-app conversation only if genuinely working and explicitly labelled as an experiment; otherwise it is hidden behind a clean module boundary. It cannot claim protection, monitoring, emergency response, or human presence.

## 3. Product principles

- Show **evidence, context, and uncertainty** together. Prefer “We have limited recent observations” to a safety verdict.
- Give useful baseline place/route information with zero reports. Community data adds depth rather than creating the product.
- Require explicit consent for location access and journey start. Manual place selection must remain available.
- Keep sensitive data private, short-lived, and out of public responses, URLs, logs, analytics, and map tiles.
- Avoid emotional pressure, fear language, alarm colors, scores, and dark crime heatmaps.
- Keep essential functions free; no V0 monetisation or targeted advertising.
- Accessibility and Hindi/English input matter. UI copy ships in English in V0; report text accepts Hindi, English, and Hinglish without forcing translation.

## 4. KNOW functional contract

Inputs: selected place, or origin and destination inside the pilot; optional time context (`now`, `evening`, `late`, default current local time). Location permission is optional. Search uses the local pilot place index, not arbitrary live third-party geocoding. Origin/destination coordinates never enter the browser URL. Within the pilot, show a place card or up to two **walking** routes if a connected graph permits. The alternate route must actually differ in path; never invent one. Display length, estimated walking duration (clearly an estimate), accessible map/list, and source/update date.

Each result separates: (a) mapped facts from OSM with source and limitations; (b) approved aggregated community observations, if thresholded; (c) coverage statement. Observations are positive, environmental, or incident-related. No public raw narrative or precise reporter point/time. Do not infer lighting, street activity, women present, or live business status from absent or stale OSM tags. Do not rank routes as safe/unsafe or recommend that a user take a particular route on safety grounds. Route differences can be described as observed facts, e.g. one has more mapped staffed places and the other has limited data.

Coverage language is categorical: **no recent community data**, **some recent community data**, or **multiple independent recent observations**. “Some” must never expose sub-threshold report content; it is allowed only for public-source/audit evidence. Do not output a numerical safety/confidence score. If no relevant evidence exists, say so explicitly. Report freshness and local time relevance; daytime observations do not automatically describe late-night conditions.

**Acceptance:** With zero community reports, a user can inspect a real pilot place and any connected route using sourced map facts and clear uncertainty. With sparse or unavailable data, the UI never claims safety, shows a nonempty useful baseline where real map data exists, and hides unavailable route detail.

## 5. REPORT functional contract

The user selects **experienced** or **witnessed**, a broad category (`harassment`, `following/stalking`, `unwanted touching`, `threatening behaviour`, `transport issue`, `environment`, `positive condition`, `other`), approximate place within the pilot, recency (`today`, `yesterday`, `past week`, `earlier/unsure`), time of day (`day`, `evening`, `late`, `unsure`), and optional narrative (max 1,000 characters). Reports with `unsure` time of day stay private and do not enter time-band-specific public aggregates. Voice transcription is a progressive enhancement only if it can be verified to process on-device without uploading or retaining audio; otherwise ship text only. Any transcript must be editable and confirmed before submission. A short structured form works without AI, speech support, or location permission.

Before submission, show a privacy preview: broad public area, time bucket, and structured tags; warn against names, phone numbers, number plates, exact home addresses, and identifying details. Server-side deterministic detection/redaction runs regardless of client behavior. Any suspected identifying content or ambiguity sends the report to private moderation, never to public output. AI can suggest fields **after** deterministic minimisation and only with opt-in and configured provider; it is not the publication gate. The reporter may edit suggestions. No raw post or public report page exists.

Server stores a restricted report for at most 30 days pending review. A moderator may approve its **structured, non-identifying** content for aggregation or reject it. Approved report-derived aggregates are released only under the threshold/cadence rules in the architecture. A report acknowledgement says it was received for review, not that a public warning was issued. No anonymous reporter lookup page that could reveal report status to another browser.

**Acceptance:** A user can submit a report in under roughly two minutes with text and manual fields. The public API reveals no raw report, identity, exact time, exact point, or sub-threshold content. Identifying content is held privately; a moderator can reject it. A no-AI path is fully functional.

## 6. Community intelligence contract

Reports are **observations, not verified allegations**. No individual report becomes a public claim. Only approved, non-identifying, independent reports in a coarse geographic cell and matching time band may contribute to a public summary. The architecture defines threshold, cadence, retention, anti-differencing, and duplicate handling. Publish source counts only in broad bands or omit them. Positive and negative observations can coexist; do not cancel one another into a score. Freshness affects whether they appear. Suspicious bursts are held for review. Moderator decisions concern publication/privacy/abuse, never a determination of whether a victim is truthful.

**Acceptance:** One report, duplicates from one browser, and a coordinated burst do not become public intelligence. A qualifying reviewed batch can produce a coarse factual summary without exposing its contributors. Revoking a report removes it from future releases.

## 7. ACCOMPANY functional contract

The user explicitly creates a journey with a destination label/place and ETA from 5 minutes to 4 hours. No continuous GPS collection; the browser may use current location once for optional origin selection and discards it after routing. The session stores only journey necessities, not a track. On creation, show ETA, check-in action, contact state, and exactly what happens if missed. The user may mark **arrived** or **end journey** at any time; these actions terminate the session. A closed tab does not terminate it, so server processing can still detect a missed ETA.

At ETA the UI prompts for confirmation if open. After a 10-minute grace period, the worker marks the journey missed. If one contact accepted this session's invitation and email delivery is configured, attempt one email saying the user missed a planned check-in and providing ETA plus a public place name if selected; otherwise use “planned destination,” without live location, origin, route, or exact home address. Delivery failure or uncertainty is recorded as such and never shown as success. Without accepted contact, the state becomes “missed; nobody was notified,” with an option for the user to close it later. A missed session is not an emergency dispatch. Maximum active lifetime is ETA plus 30 minutes; after that it auto-closes. Sensitive session/contact data is purged within 24 hours of close; no permanent movement history. Contact links are single-session, revocable, expiring, and reveal no live map. A contact must accept before alerts can be sent. The user can revoke at any time.

**Acceptance:** Arrival, cancellation, missed check-in with accepted contact, missed check-in without contact, delivery failure, expiry, and deletion all work. Tests advance a clock to verify state transitions and single delivery. No location history or contact dashboard exists.

## 8. AI and moderation boundaries

AI is optional sense-making. V0's optional hosted adapter only suggests category/tags from minimised text; deterministic logic handles duplicate hints and factual aggregate templates. Later AI may assist similarity and moderator summaries, but those are not required for V0. Deterministic validation, privacy filtering, access control, and publication thresholds remain authoritative. A model must never judge truthfulness, name an accused person, infer dangerous individuals, predict crimes, or invent facts. AI output cannot go directly to the public API. If no key, no consent, or provider failure, manual structured reporting and moderation continue normally. A deployed AI adapter must set no-store where supported and disclose third-party processing; provider retention terms must be checked before enabling it. Never send exact coordinates, contact details, or raw unredacted narrative to AI.

## 9. Privacy and non-negotiable red lines

MIRA must never: publicly identify alleged perpetrators; create offender profiles; publish faces, personal details, or raw incident narratives; expose live user locations, public journeys, or exact report points/times; retain permanent movement history; build family/partner/guardian tracking or remote location requests; assign binary safe/unsafe labels or crime probabilities; predict rape or criminal intent; use facial recognition or predictive policing; rank neighbourhoods, castes, religions, or communities by danger; sell incident/movement/location data; run vulnerability-targeted ads; optimise engagement with fear; imply AI or a route guarantees safety.

Private report and journey data needs encryption at rest for sensitive fields, restricted access, strict retention, and no sensitive telemetry. Give clear permission and deletion messages. Open algorithms, schemas, privacy design, and aggregate methodology can be published; raw reports, exact points, journeys, contacts, credentials, and operational abuse thresholds remain restricted.

## 10. Explicit non-goals

No feed, DMs, followers, voting, gamification, reputation system, public user map, persistent contact graph, police/dispatch integration, institutional dashboards, nationwide coverage, billing, ads, native phone calls, or advanced training pipeline. No claim that opening hours mean a business is currently open. No promise that notifications are instantaneous or always delivered.

## 11. Product-level release gate

The launch candidate must complete all three core flows without demo data in production, present uncertainty with every KNOW result, prevent public sensitive-data leakage, handle journeys when the app is closed through a real server worker, and show honest disabled states for missing integrations. The complete release condition is in the execution plan.
