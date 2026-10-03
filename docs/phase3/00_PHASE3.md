# Mira — Phase 3: launch readiness

Branch `ux/phase3`, stacked on `ux/phase2`. It is not merged and not pushed. The owner's instruction (4 Oct 2026) is to execute Phases 3–4 and to leave anything that needs an outside account or service as a clearly marked placeholder.

## 1. One product: legacy retired (D40)

**Removed**
- `TodayScreen` and `/today`
- `GoScreen`
- the dead `AroundScreen`
- the legacy map: `HomeScreen`, which ended up at `/around/map/classic`
- the `NEXT_PUBLIC_MIRA_GO_ENTRY` rollback flags and the extra tab sets
- the components only those screens used: `CommunityPulse`, `JourneyCapsule`, `MiraLine`, the old `Chip` and `flags`

**Moved into the new screens**
- **The way back and extra stops** now live in Plan (*After this* → *Add the way back* / *Add another stop*). Each leg is checked for its own time.
- **Reviewing a return** from the live journey screen opens the new Plan. A *private manual* return (the guest check-in screen, or restoring a saved return) opens the detailed planner's options step, where a mapped option is chosen and the manual journey is confirmed.
- **The detailed planner** (`/plan/legs`, `?planStep=`) stays for two things only: the full options comparison and confirming a private journey's continued origin. It is restyled in the same language and now has the Support pair.
- **Tabs:** You, Circle, Privacy and Updates highlight Home, which is where they're reached from.

**Rollback** is now a git revert of the Phase 3 merge.

**E2E tests**
- The helpers walk the real paths:
  - `openRoute`: Going somewhere → From where I am → To a place → the brief
  - `startJourney`: Go with Mira → choose who follows → Start
  - `savePlaceAt` and `openSavedRoute`: a destination saved as "Home"
  - `savePlaceHere`
  - `newUser`: turns location on via Home's live card
- 14 specs moved off the removed screens. The rollback spec was deleted.

## 2. Data you control

- **Forget one habit:** `DELETE /api/me/habits?place=&mode=&hour=`. An unknown or malformed key returns 404, never a silent forget-all. In You, each remembered pattern has its own Forget action.
- **Download my data:** `GET /api/me/export` returns one JSON file:
  - account and preferences
  - places and Circle
  - saved plans
  - habits, in words
  - the open and last-day journeys
  - updates and chat
  - private-report metadata

  Report text stays encrypted for moderators, and the file says so. It appears in You → Privacy and your data.
- Integration test: `tests/integration/phase-three-data.test.ts`.

## 3. Follower page and one clock

- `/t/<token>` opens with the traveller's own sky card:
  - "On the way" or "Check on them", plus when it was last updated
  - who is going where
  - "Expected by …" in the traveller's time zone
- Every place time now reads "9:05 PM IST", with uppercase AM/PM, in the app, emails and admin.

## 4. Accessibility floor

`tests/e2e/x-phase3-a11y.spec.ts` visits 13 screens at 320 × 700 as a signed-in person. On every screen it checks:
- exactly one `h1`
- one `main`
- every button, link, switch, radio and field has an accessible name
- every image has `alt`
- no horizontal scroll

The existing 200%-text spec (`t-urgent-text-zoom`) still runs. The new map gained a screen-reader `h1`.

**Placeholder — needs people and devices:**
- screen-reader passes (VoiceOver on iOS, TalkBack on Android) through the core path: Home → Plan → Go with Mira → Journey → I'm here
- an independent contrast audit of the night theme

## 5. Languages (groundwork)

- `src/lib/i18n.ts` holds an English and a Hindi catalogue for the chrome every screen shares: tabs, the Support pair, Home's greeting and headings. There's a per-device choice and a `useT()` hook.
- The Hindi is gender-neutral, like the English.
- **Off by default:** a half-translated app reads worse than either language. QA turns it on with `NEXT_PUBLIC_MIRA_LANGS=on`, which adds a Language picker to You → App.
- **Placeholder:** Hindi copy for the remaining screens, reviewed by a native speaker for tone (calm, never alarming).

## 6. Performance, measured on the production build

- Client JavaScript is 2.67 MB across 124 files, all chunks combined.
- The largest chunk (577 KB) is MapLibre. It loads only when a map is on screen (`next/dynamic`, `ssr:false`).
- The Home route chunk is 20 KB.

**Placeholder — needs a real device and network:**
- Lighthouse / WebPageTest on a low-end Android over 3G
- budget: first contentful paint under 2.5 s, interactive under 5 s
- a check that the map chunk never blocks Home

## 7. Staging deploy and real-device QA — placeholders

Both need accounts and hardware this environment doesn't have.

**Staging**
- The Railway plan is still blocked, as recorded in the Day-0 sprint notes.
- Release steps and owner-only gates are in `docs/DEPLOY.md` and `docs/PUBLIC_BETA_RELEASE.md`.
- Needed: a host, a managed Postgres with migrations `0001…0024`, a worker process, `APP_BASE_URL`, SMTP, Google keys and an admin password hash.

**Device QA checklist** (each item on an Android and on an iPhone)
1. Home with location granted, denied, and not yet chosen. In each case the live card says the honest thing.
2. Plan → Go with Mira → lock the phone for 5 minutes → unlock. Expect: position paused, "updated N min ago" on the follower page, no false arrival.
3. Missed check-in with an accepted email contact. Expect: the email arrives, and the follower page says "Check on them".
4. "I feel unsafe" → Go to a Help Point → Go with Mira, in under 10 seconds.
5. 200% system text and dark mode on every root.
6. Report → Send privately, offline then online. Expect: no duplicate report.
7. WhatsApp "Send my live link" opens WhatsApp with the link. You press Send.
