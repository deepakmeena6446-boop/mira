# Privacy, abuse and trust architecture

Research date: 2026-10-02. This is a product threat model, not legal advice or an implementation audit; see [current audit](01_CURRENT_PRODUCT_AUDIT.md) for existing controls.

## Core rule

Mira cannot make a woman safer by creating a detailed record of where she goes that an abusive partner, compromised account, employee, data broker or malicious contributor can exploit. NNEDV documents location tracking as a tactic of technology facilitated abuse. The US FTC's enforcement against location data brokers illustrates the harm of persistent precise location trails. [NNEDV technology safety](https://nnedv.org/content/technology-safety/), [NNEDV stalking](https://nnedv.org/latest_update/technology-facilitated-stalking/), [FTC Mobilewalla](https://www.ftc.gov/news-events/news/press-releases/2024/12/ftc-takes-action-against-mobilewalla-collecting-selling-sensitive-location-data)

## Abuse cases and product responses

| Threat | Harm | Required principle |
|---|---|---|
| Abusive contact gets a trip link or device access | Live stalking and inferred routines | Explicit per-trip sharing; short expiration; revoke; no default auto-share; accessible account/session review. |
| Compromised account | Home/work, trips, contacts and reports exposed | Minimise server history; strong re-auth for sensitive exports/sharing; session revocation; deletion. |
| Public report deanonymises survivor | Retaliation or unwanted contact | Coarse spatial release, delayed publication, narrative redaction, private or aggregate-only contribution option. |
| Malicious report targets a person or neighbourhood | Defamation, discrimination, misrouting | No public accusation without review; provenance, duplicate detection, appeals and correction. |
| False “safe” place / stale open hours | User sent somewhere unusable | Fresh verification and clear uncertainty; rapid correction; compare multiple options. |
| Overconfident AI | User relies on an invented fact or action | Tool grounded claims, action receipts, explicit unknowns, fail closed on unsupported safety verdicts. |
| Repeated notifications | Routine leakage to lock screen or others | Opt in, private notification text, quiet hours, simple pause, no notification based on sensitive inferred behaviour by default. |

## Data location and retention proposal

| Data | Default placement | Why |
|---|---|---|
| Saved home/work and routine places | On-device where feasible, or encrypted server storage only for a clear cross-device need | High re-identification value. |
| Passive location history | **Do not collect** | Weak early product need, extreme abuse risk. |
| Current coordinates for a query | Transient processing, precise only as needed | Provide a nearby answer without building a longitudinal trail. |
| Active journey coordinates | Time limited; delete after journey and short operational window | Needed for opted-in share/check-in, not permanent memory. |
| Sensitive report raw narrative and exact point | Restricted, short retention; publish only transformed observation with consent | Survivor control and moderation. |
| Derived preferences | Explicit, inspectable, editable, deleteable | Personalisation should be user directed. |
| Usage analytics | Aggregate, no raw coordinates or message text | Learn product value without surveillance. |

These are recommended defaults, subject to engineering/legal review and user research. Existing retention and sharing behaviour must be compared against them before implementation decisions.

## Consent and control

Ask at the moment a capability needs location, contacts, background activity or calendar/trip access. Explain what is used, who can see it and for how long. Maintain a visible “who can see my live trip?” state; let users end sharing immediately. Deletion must remove raw location history, saved places, derived routines and linked reports where safe and lawful; explain any moderation/legal retention exception. A user who cannot grant background location should still receive meaningful planning help.

Opt-in personalisation should start with explicit preferences and saved places. Inferred routines or “behaviour deviations” are **research/experimental** and should not trigger alerts without a clear, user chosen rule. A user may change a routine for harmless reasons; an alert can reveal private behaviour to another person. “Safety through surveillance” would violate the product thesis.

## Trust in advice

Every answer should distinguish **verified operational fact**, **reported experience**, **model inference**, and **unknown**. Safety language must be calm and specific. Test comprehension: users should know whether a place is listed open, recently confirmed open, or staffed. General AI risk frameworks identify transparency, privacy and validation as key criteria; WHO guidance emphasizes communicating uncertainty without undermining trust. [NIST AI RMF](https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/), [WHO uncertainty guidance](https://www.who.int/europe/publications/communicating-uncertainty-in-health-emergencies-guidance-and-tips)

## Launch gates for high-consequence features

- A place recommendation has recent enough facts for its claim, a navigable path, and a way to report “closed/wrong/unavailable.”
- A trip-share feature has expiration, revocation and an accurate recipient view of what is shared.
- An AI answer cannot state an action is complete without an action receipt.
- A public community claim has a privacy and moderation path, source class and expiry/correction process.
- An emergency path uses reviewed country-specific information where available and makes unavailable coverage explicit.
- Privacy and safety testing includes an abusive partner with phone access, a stolen account and a malicious local contributor.
