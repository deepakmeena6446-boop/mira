# Moderation policy

How MIRA handles community reports, exactly as the app does it today. Moderation decides about publication, privacy and abuse, never whether the person reporting is telling the truth.

## What you can report

Six categories, each one tap: **Harassment**, **Being followed**, **Unwanted touch**, **Dark or broken street**, **Transport problem** and **Something good**. There is also **Something else**. A reviewer may correct the category (for example to *Threats or intimidation*) and add tags from a fixed list, such as *poor lighting*, never free text.

Reports describe what happened in a place, not who did it. They are not sent to the police or anyone else; MIRA is not an emergency service.

## What is kept, and for how long

- **Where:** only a coarse area of about 1.2 km × 0.6 km. The exact point or place you chose is not stored.
- **When:** a rough recency (today, yesterday, this week), a time band (day 6 am–6 pm, evening 6–10 pm, late 10 pm–6 am), and the submission time rounded down to the hour.
- **What you write (optional, up to 1,000 characters):** encrypted. A reviewer sees it only when they choose to open it, and each opening is recorded.
- Every report is deleted within **30 days**. When a report is rejected, its text is deleted at once and the report within 24 hours.
- If you delete your account, your reports are moved to a random pseudonym that can't be linked back to you, and are deleted on the same schedule.

## What is never published

- **Individual reports.** No single report is ever shown to anyone except a reviewer.
- **What you wrote.** Your words never appear publicly, in any form.
- **"Something else" reports.** There is no fixed wording for them, so they stay private.
- Counts, exact places, exact times and anything about who reported.

## Identifying details: held and removed

Everything you write is checked on the server for identifying details: email addresses, phone numbers, vehicle number plates, links, social media handles, house or flat numbers and PIN codes, ID numbers, and phrases like "his name is…". A report with any of these is **held automatically**. It can't be approved until a reviewer removes the detected parts (they are replaced with "[removed]" in the private copy) or rejects the report.

Reports about a specific person, what they look like, or who lives somewhere are rejected as identifying content, even when the check doesn't catch them.

## Unusual bursts

If an unusual number of different people report the same category in the same area within a couple of hours, new reports there are **held** for a closer look. Separately, when community notes are prepared, an area whose reports mostly arrived inside one short window is held back that week.

## Review

A person reviews every report. Each decision uses a **fixed reason code**, never free text, and is recorded:

- **Hold:** needs redaction, possible coordinated burst, possible duplicate, unclear, other.
- **Reject:** identifying content, outside the pilot area, abusive or spam, duplicate, not an observation, other.
- **Withdraw** (an approved report) or **remove a public note:** privacy risk, reporter request, moderation error, other.

Approving a report does **not** publish it; it only lets it count toward a community note.

**During the beta**, review depends on a maintainer checking the queue. There is no guaranteed review time.

## When a community note appears

Notes are prepared once a week. A note appears only when all of these hold:

- At least **five independent people** have approved reports in the same area, the same time band and the same category. Different categories are never combined to reach five.
- Each person counts once. Duplicates (the same person or browser reporting the same thing, or identical text) count as one.
- Reports were sent in the **21 days** before the note is prepared, about something that happened within roughly the week before the report was sent, with a known time band.
- A tag is mentioned only if at least five of those people share it, and at most two tags are mentioned.
- If an area already had a note, a new one needs five people who weren't counted in the last one.

The wording is a fixed template, for example: *"Multiple reviewed observations mention poor lighting in this area during the evening."* A note shows only that sentence, the time band and the week it was released, as a line on the route card of a journey that passes through the area, with a "Why am I seeing this?" explanation. Notes are not drawn on the map. It never shows a count, an exact place, a time or a quote.

Each note **expires after 35 days** and disappears.

## Withdrawal and removal

A reviewer can withdraw an approved report at any time. It stops counting immediately, and any live note that drops below five people is removed at once. A reviewer can also remove any public note immediately, for example for a privacy risk.

To have a report you sent withdrawn, contact the maintainers privately (see below) with roughly when and where. Reports are stored coarsely, so we may not always find a specific one.

## Concerns, corrections and takedown requests

If you believe a community note is wrong, harmful, defamatory or identifies someone or somewhere it shouldn't, contact the maintainers privately; [SECURITY.md](SECURITY.md) explains how to reach them. Please don't post details in a public issue. A note can be removed immediately while we look into it, and we'll reply once we've decided.

Changes to this policy, the categories, the templates or any threshold are a protected area (see [CONTRIBUTING.md](CONTRIBUTING.md)) and follow [PRINCIPLES.md](PRINCIPLES.md).
