# Security policy

MIRA handles live location, trusted contacts and private reports for people walking home. We take security reports seriously and are grateful for them.

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a vulnerability.**

- **Once the repository is public:** use GitHub's private vulnerability reporting on this repository (the **Security** tab → **Report a vulnerability**). Only the maintainers can see it.
- **Until then:** contact the maintainers privately through a channel you already have with them. Don't include exploit details in any public place.

The same private routes are how to reach the maintainers about [Code of Conduct](CODE_OF_CONDUCT.md) concerns and [moderation or takedown requests](MODERATION_POLICY.md).

Please include:

- what an attacker could do, and to whom (for example "read another person's live location");
- the steps to reproduce, ideally against a local setup (see [CONTRIBUTING.md](CONTRIBUTING.md));
- the commit or date you tested;
- whether you think it's being exploited.

MIRA is maintained by a very small team. We'll acknowledge your report as soon as we can, keep you updated while we work on it, and credit you in the fix if you'd like. There is **no bug bounty**, paid or otherwise.

## Testing rules

- Test against your own local copy wherever possible. It needs no API keys and captures all mail locally.
- If you must test a deployed instance, use only accounts, trips and links you created yourself. Never access, change or keep other people's data, and stop as soon as you've shown the problem.
- No denial-of-service, spam, social engineering or physical attacks.
- Don't send real alerts or invitations to people who haven't agreed to take part.

## In scope

- **Authentication and sessions:** sign-in, session cookies, CSRF protection, sign-out and account deletion.
- **Live trip links (`/t/…`) and contact invites (`/invite/…`):** these URLs carry bearer tokens. Anything that lets someone guess, reuse, extend or leak them, or see a trip after it should have gone dark, is in scope.
- **Location data:** live trip points, saved places, route and report locations. For example: location kept longer than documented, shown to someone who wasn't chosen, or stored more precisely than documented.
- **Report narratives and other private text:** anything that exposes encrypted report text, contact emails or journey destinations, or links a report back to the person who sent it.
- **Moderation and admin (`/admin`, `/api/admin/…`):** access without the moderator session, privilege escalation, or reading report text without it being recorded.
- **Public outputs:** any public response that reveals individual reports, counts, exact points or times, or bypasses the five-contributor threshold described in [MODERATION_POLICY.md](MODERATION_POLICY.md).
- **Alerts and delivery:** anything that makes MIRA say an alert or email went out when it didn't, or stops missed-arrival alerts without the traveller being told.
- Secrets or credentials exposed in client bundles, logs or the repository.

## Out of scope

- Problems in third-party services MIRA calls (maps, geocoding, email or AI providers). Report those to the provider; do tell us if MIRA uses them unsafely.
- The demo sign-in (a first name creates a local account). This is by design until real sign-in ships.
- The published default rate limits and abuse thresholds. They are public on purpose.
- Findings that need a compromised device or browser, or physical access to an unlocked phone.
- Missing best-practice headers or settings with no demonstrated impact.

## Supported versions

Only the latest commit on `main` is supported. Fixes are made there and are not backported.
