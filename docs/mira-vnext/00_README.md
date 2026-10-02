# Mira vNext — canonical documentation index

**Status:** Phases 0–3 and 5 passed local engineering gates on 2026-10-02. Phase 4 remains `KNOWN-RISK` because real iOS/Android checks were skipped at the user's direction; Phase 6 optional enrichment remains disabled because moderation/source operations are not ready. Phase 7 Go/Journeys/You and consent changes are implemented locally, but external validation and release gates remain open. `/plan` carries guest intent through Go, Around, map and Ask; a selected walking option starts only after confirmation and live origin check. An unmapped loop can instead start a user-timed check-in-only journey after confirmation and a fresh origin check; an additional return leg can be made the main leg for review without erasing the previous main leg. Live trip start still requires sign-in and device location at that moment. The working tree already contained unrelated modifications to Mira limits, capability replies and tests; inspect `git status` and preserve that work. [Phase results](20_ACCEPTANCE_TESTS.md).

## Source of truth, in order

1. [01 Frozen thesis](01_FROZEN_THESIS.md) — founder intent and boundaries.
2. [15 V1 product contract](15_V1_PRODUCT_CONTRACT.md) and [16 data/privacy contract](16_DATA_AND_PRIVACY_CONTRACT.md) — shipping scope and non-negotiable safeguards.
3. [05 target architecture](05_TARGET_PRODUCT_ARCHITECTURE.md), [06 user journeys](06_CORE_USER_JOURNEYS.md), [07 Ask Mira](07_ASK_MIRA_CONTRACT.md), [08 intelligence](08_INTELLIGENCE_MODEL.md), [09 community](09_COMMUNITY_DATA_LOOP.md), [10 external intelligence](10_LOCAL_INTELLIGENCE_PIPELINE.md), [11 journey](11_NAVIGATION_AND_JOURNEY_MODEL.md), [12 global coverage](12_GLOBAL_COVERAGE_MODEL.md), [13 information architecture](13_INFORMATION_ARCHITECTURE.md), [14 screens](14_SCREEN_STATE_INVENTORY.md) — experience contracts.
4. [20 acceptance tests](20_ACCEPTANCE_TESTS.md), [18 dependencies](18_BUILD_DEPENDENCIES.md), [19 migration](19_MIGRATION_PLAN.md), [21 autonomous plan](21_AUTONOMOUS_BUILD_PLAN.md) — execution gates.
5. [02 current map](02_CURRENT_PRODUCT_MAP.md), [03 gaps](03_THESIS_GAP_ANALYSIS.md), [04 disposition](04_FEATURE_DISPOSITION.md), [17 technical change map](17_TECHNICAL_CHANGE_MAP.md) — migration evidence. Code is authority for current behaviour, not target direction.
6. [22 decisions](22_DECISION_LOG.md), [23 open questions](23_OPEN_QUESTIONS.md) — rationale and truly unresolved items.
7. [24 Phase 0 baseline](24_PHASE_0_BASELINE.md) — current scenario/API observations, contract and test evidence for the first implementation gate.
8. [25 Phase 3 privacy review](25_PHASE_3_PRIVACY_REVIEW.md), [26 Phase 4 device protocol](26_PHASE_4_DEVICE_TEST_PROTOCOL.md) and [27 Phase 7 validation protocol](27_PHASE_7_VALIDATION_PROTOCOL.md) — engineering review and outstanding independent gates.
9. [28 Phase 7 event schema](28_PHASE_7_EVENT_SCHEMA.md) — proposed coarse outcome fields; collection remains disabled until privacy and research approval.

The founder's pasted “MIRA — THESIS MAPPING + CANONICAL PRODUCT DOCUMENTATION” brief is the authority behind `01`. If a downstream document conflicts with `01` or `15`, stop, record the conflict in `22`, and resolve it before implementation. Do not silently use a legacy document to override this hierarchy.

## How a fresh autonomous agent uses this set

Read `01`, `15`, `16`, `20`, then the selected phase in `21`; follow its linked contracts and current-system paths in `17`. Record PASS / FAIL / KNOWN-RISK and update `22` for a material decision. Never infer that a proposed screen, provider, data source, or capability already exists. The implementation phase must leave the current app usable and all safety/privacy gates intact. The user explicitly waived physical-phone checks for this build session and directed continuation; [D23](22_DECISION_LOG.md) records the local-work exception. No device evidence or release gate is thereby passed.

## Legacy documentation status

`docs/mira-product-research/*` is evidence, not a target specification. `docs/launch-ux/*`, root `MIRA_REDESIGN_*`, `MIRA_MOBILE_INFORMATION_ARCHITECTURE.md`, `MIRA_GLOBAL_PRODUCT_BLUEPRINT.md`, `MIRA_SAFETY_CONTEXT_ENGINE.md` and `MIRA_GLOBAL_INTELLIGENCE_AND_TRAVEL.md` describe earlier designs; treat conflicting product prescriptions as **superseded by this set**, but retain them for rationale. `docs/archive/v0/*` is historical. `README.md`, `PRINCIPLES.md`, `MODERATION_POLICY.md`, `docs/LOCATION_PRIVACY.md`, `docs/CONTRIBUTIONS.md`, `docs/DEPLOY.md`, `docs/INCIDENT_RESPONSE.md`, `docs/COUNTRY_COVERAGE.md` and release records remain current operational evidence where they describe shipped behaviour. They require review during migration if the target changes their claims. Do not auto-edit generated `docs/COUNTRY_COVERAGE.md`.

## Readiness distinction

`READY_FOR_AUTONOMOUS_BUILD` in this dossier means an agent can begin the **first defined phase** without redefining the product. It never means the app is ready to launch, has validated local safety outcomes, or can claim global verified intelligence. Each phase has separate release and evidence gates. [Current public beta launch gate](../PUBLIC_BETA_RELEASE.md) remains in force until deliberately replaced.
