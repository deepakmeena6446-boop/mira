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
7. **Services are explicit.** Every `general` and `also` number has `covers`: the services (`police`, `ambulance`, `fire`) its source says it reaches. An empty list means the source doesn't itemise them. It is never guessed from the label.
   - `services` lists single-service numbers.
   - A single-service number's label names its own service and no other ("Police (Guardia Civil)", never "Emergency").
   - `coverage: "regional"` marks a number that only works in some regions.
   - `limitation` records a known gap in plain words.
   - `regional` records a service that has no national number because it is organised by region (e.g. South Africa's fire services). Each entry carries its own `source`.
8. **Status is declared and checked.** `status.emergency` must equal what the cited numbers support. The tests fail otherwise.
   - `VERIFIED`: police, ambulance and fire are each on a national number with no recorded limitation.
   - `REGION_DEPENDENT`: a number or service varies by region.
   - `PARTIALLY_VERIFIED`: anything less.
   - `status.reviewed` is the review date.
9. **Regional overrides.** `<ISO>-<SUB>.json`, named by ISO 3166-2 code, holds a subdivision's cited differences: `general`, `also`, `services` or `regional`, plus `reviewed`. An override's service number replaces the country's number for that service, and fills a `regional` gap for it. An override never applies to another country.
10. **Time zones and other numbers.** `emergency.also` lists other numbers that reach emergency services (e.g. 112 where 999 is the main number). Countries with more than one time zone omit `timezone`. Single-zone countries include it only with an official citation; otherwise the app uses the phone's own time zone.

The registry of all 195 countries is `data/countries/registry.json` (identity only). The generated status report is `docs/COUNTRY_COVERAGE.md`.

## Fallback

If a country has no reviewed profile, MIRA does not present a local dial number. If MIRA knows the country, the Emergency options control names it and says its emergency information has not yet been verified. If MIRA can't tell the country, it says that instead. Service-specific profile numbers are labelled by service; an all-service direct dial action requires explicit evidence of all-service coverage. Nigeria's 112 profile records a national designation but does not establish operational coverage in every area. The profile marks it `coverage: "regional"` with a `limitation`, so MIRA qualifies that call option. There is no country special-case in code.
