# Definitive existing-feature disposition

This is the implementation anti-drift matrix. Decisions describe future work; nothing is removed yet. “Technical value” distinguishes reusable infrastructure from present placement. File paths in [02](02_CURRENT_PRODUCT_MAP.md) and [17](17_TECHNICAL_CHANGE_MAP.md).

| Existing feature | Current state | Thesis fit / user value | Technical value | Decision | Target location and required change |
|---|---|---|---|---|---|
| Welcome/onboarding | Two-step intro, optional location | Useful consent entry, weak intent start | Reusable shell | **CHANGE** | First-use intent and permission at need; guest baseline. |
| Today home | Feature hub | Low coherence | Reusable components | **REBUILD** | Go home: intent CTA, active journey, resume recent plan, calm context. |
| Today Check a place | Search launcher | Relevant to destination | Good search plumbing | **MERGE** | Into intent/place resolution; allow origin/time. |
| Around place brief | Place + walking context | Valuable but narrow | Route/evidence fetch | **MERGE** | Option/arrival brief inside planning. |
| Full map / route sheet | Routes, layers, alternatives | High | MapLibre/provider adapters | **KEEP + INTEGRATE** | Plan and active journey views; map is evidence/action canvas. |
| Search and reverse geocode | Local/global place lookup | High | Provider abstraction | **KEEP + INTEGRATE** | Context resolver; ensure future/remote destination. |
| Walking alternatives | Up to 3, fastest + context | High | Reusable route API | **CHANGE** | Explicit option builder and tradeoffs; no “safest route.” |
| Ride/transit route | One provider route or unknown | Partial | Reusable provider call | **CHANGE** | Time-aware alternatives only where provider supports; manual plan fallback. |
| Lighting | OSM, imagery, walker corroboration | Relevant condition | Strong evidence discipline | **KEEP + INTEGRATE** | Time-relevant claim on options; no risk inference. |
| Help Points | Hours-aware deterministic rank | High in discomfort | Strong class/lookup base | **CHANGE** | Situation-suited support choices, routed ETA, verified access/staffing state. |
| Unsafe sheet | Immediate local actions | High | Reusable fast path | **KEEP + INTEGRATE** | Global and in-journey support state; scenario-sensitive options. |
| Emergency pill/country profiles | Dialler, reviewed numbers | Critical | Strong source discipline | **KEEP AS-IS** initially | Persistent urgent action; update presentation only after testing. |
| Ask Mira chat | Signed-in, LLM/tool cards | High potential, current gap | Streaming/tool safety gates | **REBUILD** | Intent → context → evidence → options → action; preserve grounded action receipts. |
| Scripted fallback | Limited deterministic answer | Critical failure coverage | Reusable | **CHANGE** | Useful low-data option/next-step fallback, no fake intelligence. |
| Short live trip | Foreground GPS, ETA, sharing | High | Robust state/worker | **KEEP + INTEGRATE** | Chosen plan becomes active journey; truthful paused state. |
| Trip history / habit suggestions | Recent trips, saved-place patterns | Recurrence candidate | Reusable with consent | **CHANGE** | Saved plans/repeats, explicit opt-in for learning, no passive tracking. |
| Circle contacts | Encrypted email/phone, opt-in | Support value | Reusable | **MOVE** | You and support sheet; never prerequisite to planning. |
| Individual live links | Time-limited share | Support value | Strong token model | **KEEP AS-IS** initially | In chosen journey; audit visibility/revocation. |
| Missed check-in worker / inbox/push | Delivery/status, worker health | Important | Strong operations | **KEEP + INTEGRATE** | Active journey status; do not imply guaranteed delivery. |
| Private reports | Coarse, encrypted, moderated | Fits learning with limits | Strong privacy | **CHANGE** | Optional incident observation after movement; clear downstream use and controls. |
| Weekly public notes | ≥5, IST Monday, off | Too sparse for core | Privacy gates | **DE-EMPHASISE** | Legacy evidence until reviewed replacement; no premature expansion. |
| MIRA Checks | Post-walk fact check | High potential | Strong structured loop | **KEEP + INTEGRATE** | Tiny contextual prompt after relevant trip. |
| Place corrections / receipts | Two independent checks, status | High | Reusable | **KEEP + INTEGRATE** | Support-place freshness and correction feedback. |
| Lighting votes | Three agreement rule | Relevant | Reusable | **KEEP + INTEGRATE** | Contextual after dark, not generic task list. |
| Scout/impact branding | Contribution identity | Low direct movement value | Underlying receipts useful | **DE-EMPHASISE** | Keep account record, remove primary navigation emphasis. |
| CommunityPulse | Thresholded note panel | Weak standalone value | Data retrieval useful | **MOVE** | Relevant claim inside option/active journey only. |
| Safety updates / local news | City-level news sections | Often weak relevance | Classifier/source pipeline useful | **MOVE** | Journey relevance pipeline; no generic feed. |
| Saved places/preferences | Explicit and encrypted | High | Reusable | **KEEP + INTEGRATE** | Intent shortcuts and user-controlled defaults. |
| Habit default-on | Saved-place arrival patterns | Privacy concern | Reusable with consent | **CHANGE** | Opt-in only after explicit explanation; migrate without silent collection. |
| Appearance/install | Theme/PWA | Peripheral | Reusable | **MOVE** | You/settings; no core CTA. |
| Admin moderation | Review/suppress/audit | Trust essential | Strong | **KEEP + INTEGRATE** | Extend only for new observation classes with operator staffing. |
| Operational logs/readiness | Worker/provider health | Essential | Strong | **KEEP AS-IS** | Protect in every phase. |
| Product analytics | No decision funnel | Needed to verify value | Little current infra | **REBUILD** | Coarse opt-in/aggregate outcome metrics, no coordinate/message log. |

**Phase 7 local disposition:** Go/Journeys/You now replace the five primary tabs by default; `/today` preserves the older entry and `NEXT_PUBLIC_MIRA_GO_ENTRY=legacy` restores the five-tab hierarchy in a rebuilt artifact. The underlying Around, Ask, report, contribution, contact and Emergency routes remain. An encrypted, explicitly saved plan now appears in Journeys. Habit learning is opt-in with a legacy review state. Plan-linked community/news enrichment remains off under the existing moderation policy. These are implementation changes, not external validation or permission to deploy. See [19](19_MIGRATION_PLAN.md) and [20](20_ACCEPTANCE_TESTS.md).
