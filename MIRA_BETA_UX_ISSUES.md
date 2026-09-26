# Beta UX issues: historical source review

These drafts describe the pre-hardening state at `0b63bf5`. The current beta-hardening changes address UX-01 through UX-03; use `docs/PUBLIC_BETA_RELEASE.md` for the live release verdict. Keep this record for the original issue evidence.

Verified from `feat/global-day0-beta` at `0b63bf5` on 2026-09-26. These are issue drafts, not implementation changes. The repository has no configured Git remote, so they have not been posted to a hosted tracker.

## UX-01 — Make walking-route lighting easy to notice

**Priority:** P1 · **Area:** Home route sheet

**Evidence:** `src/app/(app)/HomeScreen.tsx:608-619` shows a small Lighting context row only after a destination and walking route are selected. The detailed `LightingSummary` is rendered below the primary “Start with MIRA” button at `HomeScreen.tsx:672-711`. `HomeScreen.tsx:746-755` removes the one-time Home explanation as soon as the user has a saved place. The map lighting layer is also conditional on a selected walking route (`HomeScreen.tsx:428`). Multiple route options use small text in `src/components/app/RouteOptions.tsx:40-42`.

**User scenario:** A returning user opens Home with saved places, or picks one and acts on the prominent Start button. They can miss the Lighting line and never scroll to the source breakdown. It looks as though MIRA has no streetlight information, even where the route API returned it.

**Acceptance criteria:** Make the lighting fact and its “not known” share prominent before starting a walk, with an obvious way to inspect sources and age. Preserve the approved route-sheet order and avoid any safety verdict. Explain that lighting is available for mapped walks; for rides, transit, or a straight-line estimate, say why it is unavailable. Verify on a 375 px viewport with both one and multiple route options, including a returning user with saved places.

## UX-02 — Distinguish failed lookups from genuinely absent map evidence

**Priority:** P1 · **Area:** Lighting and Help Points

**Evidence:** `src/server/lighting/index.ts:130-159` converts each failed evidence layer to an empty array. `src/server/lighting/index.ts:46-51` also returns an empty layer when Overpass is unconfigured or a request is inside its one-second polite window. `src/components/app/LightingSummary.tsx:44-48` then says no source has mapped lights yet. `src/server/help-points/index.ts:30-36,77,96` converts a provider failure into an empty candidate list; `/api/geo/help` returns that list as a successful response (`src/app/api/geo/help/route.ts:36-42`). Home marks Help Points as failed only when the API itself fails (`HomeScreen.tsx:176`), while `src/components/app/HelpPointList.tsx:13,37-39` and `src/components/app/UnsafeSheet.tsx:145-146` can present the empty list as “none found.” `src/components/app/HelpNearSheet.tsx:78-81` has the same ambiguity.

**User scenario:** A map provider times out while the app server stays up. The route or nearby sheet says no Help Points were found, and lighting says sources have not mapped the area, even though neither lookup completed. A user may stop looking for an available Help Point or assume the lighting information does not exist.

**Acceptance criteria:** Carry source availability and failure status through the API, separately from the data list. Show “couldn’t check right now” with retry when lookup failed; reserve “none mapped/found” for a completed lookup. Keep any successfully returned evidence visible and never infer that an area is safe or unsafe. Add regression coverage for provider failure with HTTP 200 from the app API and for an unconfigured optional lighting source.

## UX-03 — Keep the after-arrival MIRA Check discoverable while it is preparing

**Priority:** P2 · **Area:** Arrival and Contribute

**Evidence:** `src/components/app/AfterArrival.tsx:31-35` renders no question until a check is ready. `useJourneyCheck` in the same file (`:40-55`) requests checks immediately, retries once after 2.5 seconds, then stops, with no loading or “check later” message. The GET endpoint attempts a bounded preparation pass before returning but swallows preparation errors (`src/app/api/contribute/route.ts:18-21`); the worker or a later Contribute visit can still prepare it (`src/server/contributions/checks.ts:141-153`, `src/app/(app)/contribute/page.tsx:15-21`). The Contribute empty state only says that MIRA may ask after journeys (`ContributeScreen.tsx:70-89`).

**User scenario:** A just-arrived user's check preparation fails transiently on the first two GETs. The arrival page shows nothing, so they leave without knowing a question may appear on the Contribute tab. A later ready check can sit unseen until it expires after 24 hours.

**Acceptance criteria:** Show an honest preparing state or a clear path to Contribute when a check is pending, and refresh until it is ready or definitively unavailable within a bounded interval. Do not promise that every journey produces a check; preserve the one-question limit and the night-walk lighting question's priority. Verify delayed preparation and the no-check case.

## Scope and evidence limits

This was a source-level UX review, not a new visual/browser test. UX-01 is additionally supported by the user's report that streetlight information is hard to see. The issues describe confirmed render paths and failure handling; they do not assert how every phone visually renders the screen.
