# Open questions and evidence gates

There is **no unresolved founder-level product choice that blocks Phase 0 or Phase 1**. The frozen thesis and explicit defaults in [22](22_DECISION_LOG.md) let an autonomous agent begin without reinterpreting the mission. The following questions affect later enablement or launch; use the stated default until evidence changes it.

| Question | Needed by | Current decision / evidence required |
|---|---|---|
| Which first geography and participant mix produce a fair V1 validation? | Comparative user study before Phase 7 release | Start with local run/walk/late-return and unfamiliar-destination tasks where present route coverage can be audited. Recruit diverse ages, mobility modes and familiarity; do not assume one city generalises globally. Founder can select launch market later. |
| What minimum provider rights, quotas and historical/future-time capability exist for each geography? | Phases 2 and 5 before source claims | Inspect contracts/API responses. If absent, show labelled partial/manual plan; do not claim service availability. |
| What is the exact retention and guest rate-limit design for conversational future intents? | Phase 3 before guest Ask | Default to ephemeral planning, current signed-in chat controls until reviewed alternative; privacy/security review and deletion test required. |
| Can any support place truthfully be described as staffed, accessible or willing to help? | Phase 4 for such wording | Default **unknown**. Claim only from current operational verification with owner, time and correction route. |
| When does a locality have enough independent observations for a segment/time claim? | Phase 6 before enablement | Default no claim. Define threshold and false-positive review with moderation capacity; current weekly aggregate threshold is not automatically a route-level threshold. |
| Which local news or official sources have route/time precision and reliable event dates? | Phase 6 before enablement | Default no route-impact claim. City-level headlines can be omitted. |
| What user research threshold demonstrates material added value over Maps + general AI without adding anxiety? | Before Phase 7 comparative study | Pre-register task-success, time, error/correction and perceived-control thresholds; no invented pass percentage in this specification. |
| What native/background/navigation provider path is viable? | Post-V1 only | V1 foreground web journey and truthful stale state. No dependency for the first build. |
| Which countries have reviewed emergency numbers and language/cultural content? | Phase 5 and each country rollout | Generated coverage is the source; unknown means unknown. Review regional variation and translation before claims. |

If a later question becomes a blocker for a phase, the implementing agent records the exact affected claim/capability, leaves the baseline path usable, and marks that phase `FAIL` or disables the optional class as defined in [21](21_AUTONOMOUS_BUILD_PLAN.md). Do not turn a missing local data source into a strategic question about Mira's mission.
