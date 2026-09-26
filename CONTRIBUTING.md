# Contributing to MIRA

Thank you for helping. MIRA is used by women to get home, so the project is open to everyone and careful about what reaches production. Anyone can read, question and improve it; nothing reaches the app people rely on without review.

Before you start, read [PRINCIPLES.md](PRINCIPLES.md). Every change is tested against it. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Run it locally

You need Node.js ≥ 22.11 (Node 24 LTS recommended), npm, and Docker with Compose v2. No API keys are needed: every external service has a placeholder.

```bash
docker compose up -d            # PostGIS (127.0.0.1:54329) + Mailpit (SMTP 1025, UI http://localhost:8025)
npm install                     # also copies the MapLibre worker into public/maplibre
npm run env:local               # writes an ignored .env.local with fresh secrets; prints a one-time moderator password
npm run db:migrate
npm run pilot:import            # imports the committed OSM extract used by the placeholder maps provider
npm run dev                     # web on http://localhost:3100
npm run worker:dev              # second terminal: missed arrivals, deletion, weekly release
```

All mail is captured in Mailpit at http://localhost:8025; nothing reaches a real inbox. The moderator area is at `http://localhost:3100/admin/login`. See the [README](README.md) for a walkthrough and the full script list.

Never commit `.env.local` or any real key. Only `.env.example` is tracked.

## Tests

With `docker compose up -d` running:

```bash
npm run check       # lint + typecheck + unit and integration tests (uses the mira_test database and Mailpit)
npm run test:e2e    # production build + Playwright, mobile and desktop (uses mira_e2e and Mailpit)
```

- `npm run check` must pass for every pull request. CI runs the same three steps.
- `npm run test:e2e` takes about 6–10 minutes and isn't run in CI. Run it on its own, and always before a pull request that touches a protected area. The first time, install the browser with `npx playwright install chromium`.
- Add a test for the failure case of anything you change, not just the happy path.

## How a change gets in

```
Issue or Discussion → (protected area? short written proposal first) → Pull request
  → CI: lint · typecheck · unit + integration tests
  → Maintainer review → (protected area? second review with the checklist below)
  → Merge to main → staging deploy and smoke test → a maintainer promotes to production
```

- Open an issue or Discussion first for anything bigger than a small fix, so no one's work is wasted.
- Proposals use this shape: *the situation she's in · who it helps · the principle it serves · the data it needs · how it can fail*.
- Every pull request answers: **Which principle does this serve? Does it collect, store, show or send any new data?**
- `main` is protected: a pull request, green CI and 1 approval (2 for protected areas); no force-push.
- **Merging is not releasing.** Only maintainers deploy, by promoting a tested commit.
- Roadmap decisions are made by maintainers, in writing, against the principles and evidence from real users. Upvotes show interest; they don't decide. Feedback from women who use MIRA carries more weight than feedback from contributors who don't.

## Kinds of contribution

| Kind | Examples | Review |
|---|---|---|
| Code | Bugs, UI, performance | Standard |
| Accessibility | Screen readers, contrast, large text, one-handed use | Standard (high priority) |
| Translations | Copy in Hindi, Hinglish, Tamil, Bengali, Marathi… | A native speaker and a maintainer |
| Map fixes | Street lighting (`lit`), footpaths, names | **Upstream in [OpenStreetMap](https://www.openstreetmap.org), under OSM's own rules**, not in this repo. They reach MIRA on the next OSM fetch |
| Locale data | Emergency numbers, helplines, time zones | Protected (see below) |
| UX research | Anonymised interview notes, usability tests | Maintainer |
| Moderation rules, safety research | Report categories, templates, thresholds, abuse cases | Protected |
| Documentation | Setup, architecture, FAQs | Standard |

**Locale data** (in `data/locales/`) must cite **every value** to an official source (a government, regulator or the operator itself), with the URL and the date you retrieved it. Values without a citation won't be merged, and cited values are re-checked from time to time.

## Trust levels

| Level | Can | How you get there |
|---|---|---|
| **1. Community Contributor** | Open issues and pull requests, join Discussions, translate, test | Anyone, immediately |
| **2. Trusted Contributor** | Triage and label issues, review non-protected pull requests (counts as one review), run the staging smoke test | About 5 merged, useful contributions over at least a month, a maintainer's nomination, and agreeing to the principles |
| **3. Maintainer** | Merge, approve protected areas, promote to production, moderate, hold production secrets | Sustained trusted work and the existing maintainers' agreement. Kept to 1–3 people; production secrets only for those who need them |

Levels can be stepped down after 6 months of inactivity or a breach of the principles. The reason is written down, and it isn't personal.

## Protected areas

These need **2 approvals, including a maintainer, plus the checklist below**. `.github/CODEOWNERS` lists the exact paths.

- **Trips and alerts:** trips, arrival, missed-arrival alerts, the worker, the live trip view, emergency numbers and Help Points.
- **Authentication and sessions:** sign-in, sessions, CSRF, the admin login, request handling in `src/proxy.ts`.
- **Privacy and retention:** database migrations, encryption, retention and deletion, account data, the privacy page, the service worker.
- **Location handling:** the location store, map and geocoding providers, geo input validation.
- **Moderation:** report rules and PII detection, moderation, aggregation, the admin area, the [moderation policy](MODERATION_POLICY.md).
- **Trust thresholds:** contributor thresholds, lighting agreement and decay, burst and rate limits, time windows.
- **Locale data:** emergency numbers and other per-country data in `data/locales/`.
- **AI behaviour:** Mira's persona and tool rules.
- **Policies:** [PRINCIPLES.md](PRINCIPLES.md), [MODERATION_POLICY.md](MODERATION_POLICY.md), [SECURITY.md](SECURITY.md).

Default thresholds are public, in the code. Only maintainers change the values production uses. (Letting production override abuse-related values privately, so they can't be gamed, is planned.)

### Protected-area checklist

Copy this into your pull request and answer each point:

1. Does it store, show or send any new personal or location data? If so, why is that the minimum?
2. Can it make MIRA claim something happened that didn't (a sent alert, a contact watching, a place being open)?
3. What happens when it fails? Is the person told, clearly?
4. Are there tests for the failure case?
5. Is there a new public output? Is it thresholded and does it show what isn't known?

## The principles test

Every change, in any area, must pass this. If the answer to any question is "no", the change needs rework or a written case in the pull request:

- **Calm and factual?** No fear language, no red/green maps, no scores, and never "safe" or "unsafe" for a place, route or person.
- **Location only while she chooses?** No new location history or passive tracking.
- **About streets, never people?** Nothing describes individuals, groups or who lives somewhere.
- **Many voices, with doubt?** No single person's input is shown; sources, recency and unknowns are.
- **True when it matters?** MIRA never claims an alert went out or someone is watching unless it's true, and failures are shown to her.
- **Quick?** A new way to contribute takes a tap, not a form.
- **She decides?** Nothing is shared, sent or started without her tap.
- **Evidence, not AI, decides truth?** No safety fact comes from a model; old information shows its date or disappears; "not known" is said plainly.

## License

By contributing, you agree that your contribution is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only), the same license as the project.
