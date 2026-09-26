# Contributions: MIRA Checks, corrections, receipts

How the Contribute tab works, what is stored, and why it can't be used to follow a person. The product rules come from `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md` §7 and `MIRA_SAFETY_CONTEXT_ENGINE.md` §6.5 and §11. Code: `src/domain/contributions.ts`, `src/domain/reputation.ts`, `src/server/contributions/`, migration `0013_contributions`.

## What someone can contribute

| Kind | How | Rule before MIRA uses it |
|---|---|---|
| Lighting | "Was the way lit?" after a walk (lit / partly / not lit; "can't tell" = no answer) | Existing walker rule: ≥ 3 different people, ≥ 60 % agree, last 90 days |
| Place confirmation (MIRA Check) | At most one question per walk, about a Help Point she passed within 60 m: "Was X open when you passed?" (open / closed / didn't notice / skip) | ≥ 2 independent people at the same local weekday × time band within 4 weeks, or 1 person + the place's listed hours agreeing |
| Correction | Contribute → Correct something → pick a place → hours wrong / entrance closed / place gone / not this kind of place. No free text. | ≥ 2 independent people (entrance: within 7 days; others: 30 days) |
| Incident report | The existing private report flow | Separate system (moderated, thresholded). **Never** a contribution, never rewarded. |

Disagreement means "reports differ": MIRA says nothing either way and nobody is credited, unless one side outnumbers the other 3 to 1. One person can never corroborate herself (see below). Place signals and receipts need an account with an email sign-in (one voice per person); lighting keeps its existing rules.

A MIRA Check is only offered with evidence: the journey's own points (the last ≤ 20, captured in the arrival transaction just before they're deleted) must pass within 60 m of the place. One Help Point lookup per journey. Contested places come first, then places whose hours aren't listed; at night a plain "confirm the listed hours" question yields to "Was the way lit?".

## Lifecycle and impact

contribution → pending signal → independent corroboration or provider agreement → verified → used → impact.

- "Your impact" shows only verified contributions that count: "You helped verify 8 pieces of local information". Pending ones are "waiting for someone else to confirm". Nothing else is invented.
- Diminishing returns: only the first verified contribution per place-and-question (or ~1 km lighting area) per 30 days counts.
- No points, streaks, leaderboards or volume badges.

**Local Steward** (beta, thresholds not final; env `STEWARD_*`): ≥ 25 counted verified contributions, on ≥ 10 different days, in ≥ 3 different ~5 km areas, ≥ 80 % of decided answers confirmed by others, an account ≥ 30 days old with an email sign-in, and no anomaly flags (more than 25 answers in a day; more than half of ≥ 6 decided answers disputed). The tab lists exactly what's still missing. It gives an eligibility flag for beta local verification tasks and a badge on Me. It gives no power over truth: a steward's answer passes the same corroboration as anyone's.

## Privacy design

1. **Signals are unlinkable.** `lit_votes` and `place_signals` hold a keyed hash of (person, subject, ISO week), the claim, the day, and for time-dependent claims the local weekday and time band. No user id, no journey, no time of day.
2. **Receipts are a separate per-person ledger** (`contribution_receipts`): kind, status, day, country, `area_key` = HMAC(person, ~5 km geohash) for diversity, `subject_hash` = HMAC(person, subject) for one-voice-per-window and diminishing returns. Keys are server secrets; the hashes differ per person, so receipts can't be compared across people or joined to signals without the key.
3. **The link from a receipt to its subject is encrypted and short-lived.** `subject_enc` (AES-256-GCM) holds the place id and answer, or ≤ 8 sampled street cells for lighting (never the route). It is deleted in the same statement that decides the receipt, and receipts are decided or expired within 30 days (places) or 90 days (lighting).
4. `subject_hash` is cleared 30 days after the decision; expired receipts are deleted after 30 days, decided ones after a year. `place_signals` are deleted after 45 days.
5. **MIRA Checks** (`mira_checks`) hold the journey's last points encrypted only while being prepared (minutes), then just the place id and name, for ≤ 24 h; answering removes those too.
6. **Deleting the account** deletes receipts and checks (foreign-key cascade). Signals stay, and nothing links them to anyone.

Why receipts guard independence: a signal's voter hash rotates weekly, so on its own it can't tell that two weeks' answers came from one person. Before a new place signal is stored, the server checks her receipts for the same subject inside the claim's window. Lighting receipts are decided with her voice counted once per cell across all weeks.

## Reports and public notes

Reports stay private. Copy never says "reviewed by a person": nobody is on moderation duty yet. It says "Submitted privately. Reports may be reviewed before they can contribute to MIRA's information." The weekly community-note job publishes nothing unless `PUBLIC_AGGREGATE_RELEASES=on` (default off).
