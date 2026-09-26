# Locale profiles

One JSON file per country, named by ISO 3166-1 alpha-2 code (`IN.json`). Subdivision overrides use ISO 3166-2 codes (`IN-DL.json`). The app reads these through `locationContext(point)` and never hardcodes an emergency number or helpline.

A wrong emergency number is a safety bug.

## Rules

1. **Every value is cited.** Each number, label, flag (such as `sms`), hours value, time zone and note carries the URL of an official government or regulator page that states it, the page title, and its retrieval date (`YYYY-MM-DD`). Notes carry their source and date in the note text.
2. **No citation, no value.** If an official page can't be fetched and read, leave the value out. Wikipedia, news sites and blogs can help you find the official page, but they are never the source.
3. **No unverified numbers.** Every number is checked against its source. Country files hold national numbers only. State numbers (ambulance 108/102 and so on) go in a subdivision override with their own citations.
4. **Protected-area review.** Changes under `data/locales/` need 2 approvals, at least one from a listed locale reviewer. Reviewers open every cited URL and confirm it still says what the profile says.
5. **Re-verify** each profile yearly, and whenever a cited source changes or disappears. Bump `version` and each `retrieved` date you re-checked. These dates are shown to reviewers, not users.
6. **Time zone** is an IANA zone. The app shows the place's local abbreviation and never hardcodes "IST".
7. **Optional fields.** `emergency.also` lists other numbers that reach the same emergency service (e.g. 112 where 999 is the main number); `emergency.services` lists per-service numbers (`service`: `police` | `ambulance` | `fire`). Each carries its own `source`. Countries with more than one time zone omit `timezone`, and single-zone countries include it only with an official citation; the app falls back to the phone's own time zone.

## Fallback

If a country has no profile, the Emergency pill still shows `112` with this line:

> Emergency number for this country not confirmed in MIRA yet. 112 works on most mobile networks.

It stays one tap. Never guess a local number to fill the gap.
