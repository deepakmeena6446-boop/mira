# Dependency candidate — 2026-10-06

Dependency commit: `7d0ef7d8146a1a0cae3761f3f9580226f2e65be6`.

Branch: `codex/deployment-security`. Based on `a2c853e34c06314238effb1fe442b4e89287fccb`.

The owner approved preparing a new candidate after the October 6 readiness review. This supersedes the original exact-SHA constraint only for preparing the candidate. No staging or production deployment is authorised or performed. Application source, Next.js version, provider configuration, migrations and Railway settings are unchanged.

## Dependency changes

- `sharp` 0.35.4 → 0.35.5, including its optional platform binaries; libvips packages 1.3.3 → 1.3.4. The installed native library reports librsvg 2.63.2.
- `source-map-js` 1.2.1 → 1.2.2 within existing parent version ranges.
- Remove unused `drizzle-kit` 0.31.11 and its exclusive dependency tree, including the deprecated esbuild-kit loader and vulnerable esbuild 0.18.20. Repository search found no drizzle-kit command, import, config or documentation usage. `db:new-migration` is the repository's own script; runtime migration uses unchanged drizzle-orm.
- Next.js and eslint-config-next remain 16.3.6. No forced downgrade, override, local dependency patch or audit suppression was introduced. npm normalised optional platform dependency records while resolving the lockfile; other retained packages did not change versions.

Lockfile SHA-256: `f9e713d1a8fa3e8ae1d2a0875f44b4ffd8160196d7036a60d14e80d9c337806f`.

## Validation

| Check | Result |
|---|---|
| Fresh `npm ci` | Pass |
| Lint and typecheck | Pass |
| Unit and integration suite | 1,073/1,073 tests, 123 files, pass |
| Production Next.js and worker/migrator/import builds | Pass |
| Client bundle secret audit | Pass: 130 files, 10 patterns |
| Native sharp image check | PNG encode/decode round trip passed; sharp 0.35.5, librsvg 2.63.2 |
| source-map-js check | Valid indexed map round trip and oversized-offset rejection passed |
| Migration-authoring command without drizzle-kit | Pass in a temporary directory; no database connection |
| Full browser regression suite | 126 passed, 0 failed, 6 intentional project-specific skips; 12.2 minutes |
| Linux amd64 clean install, build, bundle audit and native image | Pass on Node 24.21.0; production audit 0 |
| GitHub CI on dependency commit | Blocked before execution: run 37490651058, job 112362178465, account billing lock |

Host: macOS arm64, npm 11.17.0. The initial checks passed on Node 26.4.0; full lint/types/unit/integration/build and bundle audit also passed on Node 24.21.0, the intended Railway Node major. Native image and indexed-map smoke checks passed on Node 24 as well. A separate clean Linux amd64 / Node 24.21.0 install, Next.js/worker build, bundle audit and native image round trip also passed using the official node:24-bookworm image. Its image digest was sha256:22f6fe5f59fb7fed238b19623506d573dffaa932ce33b84ce541a9a2e0eade28. The Linux installed native library reports sharp 0.35.5 and librsvg 2.63.2.

Integration and browser tests use a new disposable **local** PostGIS container bound only to `127.0.0.1:54339`, with separate mira_test and mira_e2e databases. Browser web/worker processes use port 3400 and Node 24.21.0, labelled placeholder providers and the existing local Mailpit capture service. Test environment inheritance contained no deployed provider/database variables. A first E2E attempt without parent CLI configuration reached an aggregation result of `disabled: true`: the aggregation subprocess inherited no complete test environment in the clean checkout. That run was interrupted, then restarted using generated configuration from the existing e2eServerEnv helper for the parent test process too. No application or assertion changes were made. No Railway database was used. The E2E harness's test-schema reset was confined to this disposable local mira_e2e database. The corrected complete Node 24 browser run exited successfully; the six skips are existing mobile/desktop exclusions for touch, service-worker, narrow-screen, WhatsApp and accessibility checks covered in the other project. They are not newly disabled tests. The disposable database was removed after validation; the existing local database and Mailpit containers were retained.

## Audit result and remaining tooling finding

Fresh production-only npm audit: **0 findings** (`npm audit --omit=dev`).

Full npm audit: **5 high package entries**, all one [unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in the development chain:

`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`.

The latest published braces version checked on October 6 is still 3.0.3; the advisory lists no fixed release. The latest Next.js eslint plugin also retains fast-glob. These are lint dependencies and no runtime application import was found. They process repository-controlled patterns during linting. Do not describe the entire installed dependency set as vulnerability-free: Railpack can install development dependencies for builds and retain them in its image. Maintainer review of this remaining build/tooling exposure is required before public release; follow upstream for a compatible fix. npm audit's proposed Next.js 14 downgrade is not an acceptable automatic fix.

Sharp and source-map-js fixes use their [upstream](https://github.com/lovell/sharp/releases/tag/v0.35.5) [patched](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) releases. This is dependency maintenance, not evidence that a deployed MIRA instance was exploited.

The four distinct local-test `config.warning` messages are expected from intentionally absent live providers:

- `No GOOGLE_MAPS_SERVER_KEY: search, routes and Help Points use the OpenStreetMap fallback (thin outside mapped areas).`
- `No OVERPASS_URL: the OpenStreetMap lighting source and OSM Help Points are unavailable.`
- `No MAPILLARY_TOKEN: the street-imagery lighting source is unavailable.`
- `No ANTHROPIC_API_KEY: Mira answers with the scripted companion; ambiguous Safety update headlines are left out.`

Mail uses local SMTP capture only. The NO_COLOR/FORCE_COLOR notices are test-runner formatting warnings, not provider configuration failures. These local fixture results do not prove production provider delivery.

GitHub CI annotation: “The job was not started because your account is locked due to a billing issue.” See the [candidate CI run](https://github.com/deepakmeena6446-boop/mira/actions/runs/37490651058). No CI retry or billing change was attempted.

## Candidate status

Dependency preparation and local regression verification are complete. This record is a documentation-only commit after the tested dependency commit; application/test source and the lockfile are unchanged. The candidate remains a draft for review, with the release holds below still open.

## Release hold

The candidate has not been deployed or tested on real phones. Existing staging continues running the earlier application build.

Before a future authorised release:

1. Resolve the GitHub account billing lock and obtain green CI on the selected candidate SHA; do not treat a job that never started as a code pass.
2. Review this candidate and the remaining development advisory. Review the [deployment documentation draft](https://github.com/deepakmeena6446-boop/mira/pull/1), which corrects CLI targeting, PostGIS first boot and backup schedules.
3. Obtain Railway support for the required worker ALWAYS restart policy and approved production backup/recovery setup. The current staging worker's ON_FAILURE ×10 limitation remains unresolved. No plan upgrade or billable action was performed.
4. Complete restricted provider keys, final production identity, moderator readiness, physical-phone smoke and all gates in `docs/PUBLIC_BETA_RELEASE.md`, including support/security contact, named primary/backup responder, policy review and monitoring/recovery rehearsals.
5. Only after separate approval, deploy the same new reviewed SHA to staging, record its migrations/logs/HTTP/provider/phone results, then obtain separate production approval. The old a2c853e staging smoke evidence cannot certify changed dependencies.

No application feature, data collection, storage, output or alert behavior changed. This supports the reliability/privacy principles. No real emails, WhatsApp or push messages were sent by this work. No branch was merged into main.
