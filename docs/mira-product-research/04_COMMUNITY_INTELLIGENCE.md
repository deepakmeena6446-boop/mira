# Community intelligence: observations, not a feed

Research date: 2026-10-02. **Status:** proposed product rules, not implemented behaviour. Read with [the current product audit](01_CURRENT_PRODUCT_AUDIT.md).

## Decision

Community should supply *specific, time and place bound observations* that improve an answer to a movement question. A report count, public feed, or contributor leaderboard is not the product. Mira should preserve the underlying observation and its limits, then surface a concise explanation only when it changes a user's options.

This is grounded in how crowdsourced systems deal with mutable reality. Waze lets drivers say a report is “not there,” shortens its lifetime, and limits excessive reporters; OpenStreetMap keeps edit histories, supports discussion and reversions, and escalates serious vandalism. Google Maps moderates suggested edits and shows pending/approved/rejected status. These are useful mechanisms, but a report about harassment is more sensitive than a pothole: a survivor may require anonymity and cannot be asked to prove an experience to strangers. [Waze](https://support.google.com/waze/answer/13739290?hl=en), [OpenStreetMap](https://wiki.openstreetmap.org/wiki/Vandalism), [Google Maps](https://support.google.com/maps/answer/7055486?co=GENIE.Platform%3DDesktop&hl=en)

### What other communities teach, and what does not transfer

| System | Trust mechanism | Mira adaptation / limit |
|---|---|---|
| Waze | Fast, in-context reports, “not there” corrections and expiration. | Use for volatile operational facts; never ask someone to invalidate another woman's harassment experience with a tap. [Waze](https://support.google.com/waze/answer/13739290?hl=en) |
| Wikipedia | Verifiable claims trace to published sources; contentious living-person material receives stricter treatment. | Preserve provenance and impose higher review on public accusations; first-hand local observations often cannot meet Wikipedia's published-source rule, so distinguish their claim class instead. [Wikipedia policy](https://en.wikipedia.org/wiki/Wikipedia:Verifiability) |
| Google Maps | Suggested edits are moderated; contributors can see status and appeal content removal. | Give contributors a receipt, correction status and recourse, while withholding sensitive raw incident details. [Google Maps](https://support.google.com/maps/answer/7055486?co=GENIE.Platform%3DDesktop&hl=en), [content reports](https://support.google.com/contributionpolicy/answer/7445749?hl=en) |
| OpenStreetMap | Change history, discussion, proportional rollback and a Data Working Group for serious vandalism. | Keep an internal reversible audit trail and escalation path; do not expose a survivor's identity as OSM exposes mapper accounts. [OSM vandalism process](https://wiki.openstreetmap.org/wiki/Vandalism) |
| Reddit | Community moderators review reports; Crowd Control filters untrusted/brigading accounts before publication. | Queue suspicious coordinated reports and separate submitter trust from truth of a specific event. Karma and popularity must not become safety evidence. [Reddit moderation](https://support.reddithelp.com/hc/en-us/articles/15484545006996-Crowd-Control), [Reddit queue](https://support.reddithelp.com/hc/en-us/articles/15484440494356-Moderation-Queue) |
| Stack Overflow | Review queues and reputation-gated privileges route edits and flags to experienced reviewers. | Contributor history can prioritize review effort, but public status/points and voting should not determine whether harm occurred. [Stack Overflow queues](https://stackoverflow.com/help/privileges/access-review-queues), [flagging](https://stackoverflow.com/help/privileges/flag-posts) |

## What to collect

| Contribution | Useful question answered | Default treatment |
|---|---|---|
| Place fact: entrance, staffed desk, public access, operating hours | “Where could I go for help now?” | Structured fact with source, time checked, expiry, and easy correction. |
| Route condition: lighting outage, blocked path, isolated segment, active businesses | “What is this route like at this hour?” | Attach to a segment and time band; seek corroboration or official data. |
| Transit experience: platform staffing, last service, pickup location | “How will this transfer work?” | Keep operational facts separate from a person's experience. |
| Personal incident or discomfort | “What happened here, and when?” | Private intake first; aggregate cautiously, with no public identity or exact trace. Never imply accusation is verified merely because submitted. |
| Positive observation: open, staffed, busy, accessible, clear sightlines | “What options exist?” | Give equal weight to enabling evidence. Require recent checks for volatile facts. |
| Correction: closed, moved, wrong hours, report no longer current | “Can I rely on this?” | Low friction, auditable, can supersede a stale fact quickly. |

Avoid “suspicious person” labels, ethnicity, occupation or housing status as safety proxies. The runner's concern about workers and strangers is genuine; a product inference that workers are inherently risky would be unsupported and discriminatory. Capture observable behaviour and environment instead (following, harassment, obstruction, lighting, open staffed places). Research on neighbourhood disorder finds perception can vary across residents sharing the same environment, so perception must not be silently promoted to objective risk. [Office of Justice Programs](https://www.ojp.gov/library/publications/resident-perceptions-crime-and-disorder-how-much-bias-and-how-much-social)

## Minimum observation record

`kind`, `geometry` (place/segment/area, privacy reduced where necessary), `observed_at`, `valid_time_window`, `submitted_at`, `source_type`, `verification_state`, `last_checked_at`, `expiry`, `evidence_pointer` where lawful and consensual, `privacy_class`, `moderation_state`, `supersedes`, `confidence_explanation`. A free text narrative can supplement structured fields but should not be the only machine readable content. The person should choose whether an incident stays private, contributes only to aggregate trends, or is shared in a carefully redacted form. No default public posting.

## Trust pipeline

1. **Ingest:** separate first hand observation, correction, second hand information, provider data and official notice. Ask only enough detail to answer a future decision; make “I don't want to share details” viable.
2. **Protect:** redact names, faces, personal contact details, precise home/work locations, and details that identify a survivor. Hold sensitive submissions out of public search.
3. **Screen:** detect duplicates, coordinated submissions, impossible times/locations, spam and targeted accusations. Rate limits are a brake, not a credibility score.
4. **Corroborate:** independent observations, recent place checks and reliable external sources can increase confidence. Multiple accounts controlled by one actor do not count as independent.
5. **Publish a claim class:** e.g. “hours confirmed by provider today,” “two independent recent observations,” “one unverified experience,” or “coverage thin.” Do not collapse these into one opaque score.
6. **Expire and correct:** an open business can change in hours; built infrastructure changes more slowly; past incidents remain historical context but should not become perpetual warnings. Keep provenance and reversible moderation decisions.
7. **Audit harms:** examine false positives, ignored reports, disparate effects on neighbourhoods and workers, privacy incidents, and whether guidance actually helps users choose an option.

**Do not equate no reports with safety.** Reporting is uneven; police data also miss substantial sexual violence. RAINN cites the US National Crime Victimization Survey as finding only slightly more than one quarter of rapes and sexual assaults reported to law enforcement. That estimate is US specific, but the measurement warning generalises: a blank map is not affirmative evidence. [RAINN](https://rainn.org/help-and-healing/if-youve-been-assaulted/reporting-sexual-assault-to-law-enforcement/)

## Contributor incentives

The value proposition should be “correct a fact that would help the next person” and “share an experience on your own terms.” Prompt after a completed journey only when there is a narrow, answerable gap: “Was this entrance staffed when you arrived?” No streaks, public ranks for incident reporting, danger badges, or rewards proportional to alarming content. Google Local Guides points can work for restaurant/map coverage, but safety reports have a different harm model; incentive copying is a **hypothesis to reject until tested**. [Google Local Guides](https://support.google.com/maps/answer/6304221?hl=EN)

## Network effect and its limits

The compounding asset is a provenance rich history of conditions by route segment, place, time band, mode and recent verification, plus a correction loop. Its value grows only if coverage is geographically dense, contributions are independent enough, and the system can distinguish fact from interpretation. Early “global community intelligence” will be sparse. Mira must show the coverage gap and remain useful through noncommunity sources.

## Open research and validation

- Test which contribution prompts women would answer after a routine trip, an uncomfortable trip, and an incident; examine emotional burden and retaliation concerns.
- Pilot place fact corrections and positive observations before deriving incident based route claims.
- Measure time to correction, moderator disagreement, duplicate rate, false claims, and whether users understand claim provenance.
- Review local defamation, privacy and emergency reporting obligations city by city before public incident visibility.
