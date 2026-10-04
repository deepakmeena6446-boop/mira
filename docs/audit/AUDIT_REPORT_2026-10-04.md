# Mira — multi-agent product audit, 2026-10-04

Prompt: [AGENT_AUDIT_PROMPT.md](AGENT_AUDIT_PROMPT.md). Build audited: local `main` at `266e102`, production build (`next build` + worker), fixture mode (no Google, Claude or push keys), isolated database `mira_e2e_audit` on :3400, Hindi build on :3401. All email went to Mailpit; no message left the machine. Raw evidence (findings JSONL, coverage notes, verifier verdicts, scripts, screenshots) is in `/tmp/mira-audit-20261004/`.

---

## 1. Verdict

**No, not tomorrow.** The server side does what it promises. Exactly one missed-check-in email went to accepted contacts, never to unaccepted ones, and never with coordinates. Live links die on arrival. Tokens can't be guessed. Every IDOR and CSRF attempt was refused. Deletion is complete.

The failures are on the phone, at the moments that matter most:

1. **The one-tap emergency number disappears.** It goes about 2 minutes after a location fix on Home and Around. It is also missing on nine screens when they are opened directly.
2. **Mira answers distress with a route question.** That covers typos, plain words, Hinglish and Hindi alike: "help me pls", "I was harassed", "bachaoo", "कोई पीछे आ रहा है".
3. **The Report screen takes location without a tap**, and the rest of the app then reuses that fix.
4. **"Start and share" can silently start nothing.** With another journey open, it drops her into the old, unshared trip, so the alert she asked for never exists.
5. **After a missed check-in, the traveller and the follower are told things that aren't true.** The traveller's screen names a contact who was never alerted. The follower's link later says "trip has ended" with an upsell.
6. **A worker stop mid-send (for example a deploy) loses the alert for good.** It is at-most-once, never retried.

Items 1–5 were reproduced by independent verifiers. Item 6 is confirmed by code and simulation. Fixes 1–6 in §7 are the blockers. Most are small or medium changes; item 6 is the only server-side one.

---

## 2. Scorecard

| # | Promise | Result | Findings |
|---|---|---|---|
| R1 | Evidence, not verdicts | ⚠️ | No verdict word in Mira's replies (about 60 Hinglish/Hindi turns plus every English screen). Product-written copy does break the rule: starter "Is there a better way…" (L02-008), headline "what's open, lit…" (L02-007), "Help Points open now" tiles (P04-001). |
| R2 | Location only on an explicit choice | ❌ | `/report` asks for GPS on load and the app reuses that fix (R00-001, P03-001). One "Use my location" tap is remembered forever, despite "for this view only" (P03-002). |
| R3 | "Just me" is the default | ⚠️ | The default holds and nothing carries over (P01). When two devices start at once, "Start — just me" can land in a *shared* journey (P18-004 → P0-3). |
| R4 | Alerts only to accepted contacts, exactly once | ❌ | A worker stop between claim and send means **zero** alerts, never retried (P0-7). Otherwise the **core held.** One email per miss, none to unaccepted contacts, none after arrival, none after deletion, still one after 2+ worker cycles and under device races. Gaps: a promised alert that never sends (P02-002), no all-clear after a miss (P02-003), and a false alarm when "I'm home" is told to Mira (P11-004). |
| R5 | No coordinates in email or notifications | ⚠️ | Every email and the follower page are clean. In-app, Mira's plan replies print raw coordinates (L02-002), the I feel unsafe sheet shows them for copying (L02-003), and a trip to saved "Home" gives link holders the exact point (P06-006). |
| R6 | Receipts, not claims | ❌ | Names an un-alerted contact as alerted (P02-001). Says a start failed when it succeeded (P09-001). Marks two same-name contacts "Opened WhatsApp ✓" after one tap (P07-001). WhatsApp wording itself is honest. |
| R7 | Live links die | ⚠️ | 192-bit tokens, no timing oracle; forged, revoked and removed links → 404; links go dark within 15 s of arrival or end. The magic-link confirm page can switch a signed-in browser into someone else's account (L01-001). |
| R8 | Mira is not emergency help | ❌ | Mira never claims to call or alert anyone. But 112 is unreachable in ≤2 taps in several states (P0-1), and distress messages get route planning (P0-6). |
| R9 | Reports stay private | ⚠️ | Personal details held and redacted, text encrypted at rest, 5-person threshold works, pile-on held. One person with five browsers counts as five people (P14-001, latent while releases are off). |
| R10 | No location history | ✅ | Journeys older than a day were purged from DB, API, export and UI; no position trail anywhere (P15). |
| R11 | Help Points "listed open" | ⚠️ | Sentences say "listed open", but tiles say "open now" (P04-001) and unknown hours count as "not open" (L02-010). |
| R12 | Honest degraded states | ⚠️ | Random walk: no forever-spinner or blank screen in 1,902 steps (P19). But "couldn't reach Mira" on a start that worked (P09-001), a blank map with no text (P06-003, P03-010), and loop failures blamed on coverage (P04-003). Failed checks shown as empty, with no client timeouts (L06-004 to L06-007). |
| R13 | One design language | ⚠️ | Main screens match the mockups; no sideways scroll at 320 px. Two sheet systems (L03-002). Offline, 404, invite and sign-in-link pages look like another app (L03-007). Support pair missing on arrived/ended screens (P01-006). |
| R14 | One clock | ❌ | Times follow the device locale ("9:05 am", "५:१० AM") with no zone (P02-005 cluster). Abroad, plans use the phone's zone (P05-001). DST hour can't be planned (P05-003). Hinglish times land on "Now" (P11-001). |
| R15 | Data control is real | ⚠️ | Delete removes everything (DB, API, UI); live link dies; contacts not alerted afterwards. Export misses some held data (P15-003). Forget-habit without `place` forgets all instead of 404 (P15-002). |

---

## 3. Confirmed P0s, then P1s

Each entry below was reproduced by a fresh verifier agent that got only the finding text: 2/2 runs unless stated. "Severity" is the final rank. Where the verifier disagreed, both views are given.

### P0-1 · The emergency number (112) disappears or never appears — R8

One root cause, several triggers. The emergency country comes only from a fresh GPS reverse lookup. It is kept in memory, expires after 120 s (`COUNTRY_FRESH_MS` in `src/lib/locale-store.ts`), and is not refreshed anywhere except `/trip`. `watchWhileVisible` in `src/lib/location-store.ts` exists but has no callers. Once lost, the header reads "Emergency options" and the sheet says "MIRA couldn't determine which country you're in". The I feel unsafe sheet then has no tel: link, no Help Points and no refresh.

| Trigger | Ids | Verified | Severity |
|---|---|---|---|
| Standing still, online, **~120 s after the fix** on Home and Around | P05-002, P08-001 | 2/2 with a realistic GPS shim (fresh timestamp per call, watch every 5 s): flipped at 119–124 s | **P0** |
| **Cold open** of /mira, /trips, /me, /circle, /inbox, /contribute, /plan, /plan/legs, /welcome; also You → Manage (full reload) | R00-002, P08-002, P01-011 | 2/2 with shim. No path to a number except going back to Home (not signposted) | **P0** (verifier raised R00-002 from P1) |
| Offline ~2 min on a live journey (metro tunnel) | P01-002, P09-009 | 2/2. 112 returns on reconnect | P1 |
| Location never given (guest, Delhi, en-IN) | P03-003 | 2/2. No number on any of 10 routes, no country picker; copy does point to the phone's dialler | P1 (verifier; finding said P0) |
| **One failed reverse-geocode call** (500, network error or hang) on Home, Around or `/trip`. Home never recovers, and nothing says the lookup failed | L06-003 | Shown by L6 with `page.route`; same mechanism (not separately re-verified) | **P0** |
| Online, stationary on `/trip` | part of P05-002 | **ENVIRONMENT**: with the shim, 112 stayed 150 s. Playwright's stale fix timestamps caused it | — |

Related: P07-003 (Circle rejects a local number when the country has expired), L02-012.

### P0-2 · Report screen takes location without a tap — R2

`/report` and `/report?c=…` call `getCurrentPosition` on load and POST the coordinates to `/api/geo/reverse`. With permission denied, the request still fires, which on a phone means an unprompted permission prompt. The fix is then treated as her choice app-wide. Home shows "Near HPMC" and posts the point to four endpoints, and a report started from a named place still uses the device fix. Twenty-one other guest routes make zero calls. Ids R00-001, P03-001 (V3, 2/2). Suspected area: `ReportScreen.tsx:50` `useLocation(true)` → `location-store.ts:158-163`.

### P0-3 · "Start and share" silently starts nothing when a journey is already open — R3, R4

With a just-me journey open, "Start and share with Sis" gets `409 trip_active`. The app silently navigates to the *old* journey: a different destination, unshared, with no message. Sis gets nothing, and the alert the sheet just promised never exists (P01-001, V4 2/2). From two devices at once, the reverse also happens: "Start — just me" lands in a journey shared with Sis (P18-004, 1/3 runs, not separately verified). The server held throughout, with exactly one active journey. Suspected area: `GoSheet.tsx` `trip_active → router.push('/trip')`; the same branch is in `MiraChat` and `PlanJourneyControls`.
**Severity:** the verifier rated P1, because `/trip` does say "Nobody is alerted automatically". Kept at P0 because of the reverse (share-without-opting-in) path and the rubric's "choose the higher".

### P0-4 · After a missed check-in, the traveller's screen describes alerts that didn't happen — R6, R4

- **P02-001:** Meera removes the alerted contact and adds Chitra. The "Are you okay?" box now says the provider accepted the alert "for Chitra", who was never emailed. With nobody left it reads "…for ." (V5 2/2). `TripScreen.tsx` ~534 falls back to the *current* recipient list.
- **P02-002:** on a journey that has already missed, the screen still promises "Mira attempts an email to Chitra" 10 min after the ETA. That email never comes (V5 2/2; the verifier raised it from P1 to P0).

### P0-5 · The follower's link says "trip has ended" after a missed check-in — R12, R6

The mother gets the missed-check-in email, which promises the link works "while the trip is still open". About 19 minutes later the trip expires. The link then shows "<Name>'s trip has ended. Live sharing is off." with a "Try Mira" card. Nothing says she never checked in, and the email never warned the link would stop (P06-001, V5 2/2). After the 30-minute grace it becomes "Page not found" (P06-007). When the worker catches up more than 30 min past ETA, the alert goes out and the trip expires about 30 s later, so the traveller never sees "Are you okay?" (L06-002). Suspected area: `SharedTripView.tsx` renders "has ended" for every non-arrived terminal state.

### P0-7 · If the worker stops mid-send, the missed-check-in alert is never delivered — R4

The alert is claimed in the same transaction as the miss, and SMTP runs after commit. If the worker exits between the two (crash, watchdog exit, or a **deploy's SIGTERM**), the claim stays "claimed". Five minutes later the next pass marks it "unconfirmed", and it is **never retried**: zero alerts. The traveller gets an "unconfirmed" notice, but she is the person who isn't responding.
- **Code:** stated as the design in `src/server/journey/worker.ts:48-54`. `shutdown()` in `src/worker/main.ts:80-89` ends the DB pool and exits without waiting for an in-flight tick.
- **Simulated by L6** on its own journey (claimed row, expired claim): 0 emails, then the trip expired (L06-001).
- **Verification:** confirmed by code reading and simulation. No independent re-run, because killing the shared worker mid-send wasn't allowed.
- **What held:** with the worker down *before* the miss, exactly 1 email after restart. Three concurrent workers on a copy DB sent 10 emails for 10 journeys, no duplicates.

### P0-6 · Mira answers distress with a route-planning question — R8

Only exact phrases open the I feel unsafe sheet. Everything else goes to the plan engine and gets the same question: "I can start from a named place without your device location… Which starting place should I use?"

- Typos and plain words: "help me pls", "someone is folowing me", "I'm scared what do i do" (P08-003, V6 2/2, 19/19 phrases).
- Plain requests: "I was harassed near the gate", "call the police for me", "can you alert my sister?" (L02-001, V10 2/2).
- Hinglish and Hindi: "bachaoo", "madad karo", "police bulao", "मुझे बहुत डर लग रहा है", "कोई पीछे आ रहा है" (P11-005, 3/3 on both builds).
- Arrival told to Mira during a live shared journey ("ghar pahunch gayi", "I'm home"): the trip stays active and the contact later gets a missed-check-in alert (P11-004, V10 2/2, alert observed).

The route answer never calls a model, so this would also happen in live mode. Suspected area: `src/domain/urgent-intent.ts` (exact-word `DANGER`), `src/domain/ask-routing.ts` `askUsesPlan()`.
**Severity:** verifiers rated P1, because the header I feel unsafe / Emergency stay visible. Kept at P0 because §5 P8's "must verify" (Mira points to Emergency) fails across four phrasing families, and the arrival variant causes a false alarm.

### P1s (all confirmed)

| Id(s) | What happens | Promise | Suspected area |
|---|---|---|---|
| P09-001 | A lost reply to Start shows "We couldn't reach Mira" and no recheck, while the journey is live. The contact gets the share email, then a missed-check-in. | R6 | `GoSheet.tsx` drops the idempotency key on error. `SafetyAccess.confirmShare` already has the recover pattern. |
| P02-003, L02-004 | Ending a trip after a miss says "All done · Nothing needed". Alerted contacts never get an all-clear (`arrived_notice_at` null). | R4/R6 | arrival-notice path only on "I'm here" |
| P18-001, P15-001 | The journey bar and Home "I'm with you…" never refresh after I'm here, End or a miss elsewhere; it never shows "Check-in due". After account deletion on another device, `/trip` keeps "Sharing enabled" and the email promise. | R4/R12 | `TripScreen.refresh` ignores `{trip:null}`; the dock renders once |
| P03-002 | One "Use my location" tap, even when denied, sets `mira.location.skip="0"` in localStorage for good. Every Home, Around or Map open asks again (5/5). Sign-out doesn't clear it, and there's no off switch. | R2 | `location-store.ts` `rememberLocationChoice` |
| P08-004 | A double-tap on I feel unsafe or Emergency opens then closes the sheet: the second tap hits the scrim (16/16). | R8 | `UnsafeSheet.tsx`, `EmergencyPill.tsx` scrim `onClick` |
| P08-005 | Offline, tapping any tab replaces the app with an offline page that has no call link. | R8 | `/offline.html` |
| P09-004 | On a low-end phone (Slow 3G, 4× CPU), Home is visible at ~2 s but dead until ~7.7 s. Taps on I feel unsafe, Emergency and Use my location are lost. | R8/R12 | hydration; the Support pair could be plain `tel:` links before JS |
| L01-001 | Login CSRF via magic link: the confirm page names no account and the link isn't bound to the browser that asked. Y's browser was switched into X's account, and Y's next journey was visible to X. | R7 | `/auth/link`, `/api/auth/email` |
| P19-001 | An email sign-in link opened on another device (no 18+ cookie) dead-ends: every Continue → 403 "Confirm that you are 18 or older", and the page has no checkbox. Garbage and unknown tokens get the same 18+ message instead of "link expired" (V11 2/2). | flow | `/auth/link` checks the 18+ cookie before the token |
| P14-001 | One person with five browsers (one IP) counts as five independent reporters and publishes a community note (3/3). Latent: releases are off and strict beta forbids "on". | R9 | aggregation independence = account/cookie only |
| P07-001 | Two WhatsApp contacts with the same name: one "Send to" marks both "Opened WhatsApp ✓" and hides the second button. | R6 | `TripScreen.tsx` keys opened state by `c.name` |
| P07-002 | "+91 098765 43210" is stored as +9109876543210, and "919876543210" as +91919876543210. The masked hint hides it. | R6 | `src/domain/phone.ts` `normalizePhone` |
| P05-001 | Abroad with an IST phone, "Tonight 10 PM" in Lisbon is planned at 17:30 local: "It will be daylight". The When sheet does say "Times are in Asia/Calcutta (this phone)". | R14 | no zone from coordinates; only India's profile has one |
| P05-003, L05-008 | In the DST repeated hour or spring-forward gap, "Now" and exact times silently fall back to "Choose a time". | R12/R14 | `instantForLocal` in `src/domain/plan-options.ts` |
| P05-004 | Asked a country's emergency number, Mira gives only the first: Japan → 110 (no 119), Kenya → 999. The table itself is correct. | R8 | Mira answer formatting |
| P11-001 | "kal raat 11 pm ghar jaana hai" → "You mentioned 11:00 PM", but the plan opens at Now and says "daylight". "baje" and "बजे" aren't recognised. | R14 | English-only regexes in `shouldSeedPlan`, `plan-intent` |

Downgraded by verifiers to **P2**: P13-001 (refresh after switching situation empties the plan), P09-002 (duplicate report after lost reply + Back), L02-002 (coordinates in Mira's plan replies; her own position, not stored), P18-002 (other device stale ~15 s).

---

## 4. P2 and P3, grouped by screen

Ids point into `/tmp/mira-audit-20261004/findings/*.jsonl`. A 20% random sample of P2s was spot-checked (§8). "Repro" lines are folded into their root cause.

**Every screen / shared parts**
- Times follow the device locale, not one clock: lowercase "9:05 am", native digits, no zone label (P2: P02-005, P05-006, P05-007, L05-007, L05-009; P3: P03-008, P06-011, P07-005, P08-009, L05-010, P15-006).
- Phone dark mode ignored; theme follows only the clock (P3: L03-010, L04-010).
- Focus invisible on card rows (P2: L04-001). Focus lands under the tab bar or composer (P2: P10-007, L04-011).
- At 320 px and 200% text the header Support pair collapses and overlaps; labels truncate (P2: P08-006, P10-008, P10-014).
- Accessible names differ from visible labels (P3 per spot-check: P10-009). Radio groups ignore arrow keys (P3: P10-004).
- State changes are silent and drop focus to the top (P2: P10-002, P10-003).
- Two sheet systems (P2: L03-002). Pages outside the shell look like another app (P3: L03-007, P19-007). No Support pair on arrived/ended, Privacy, Terms, 404 (P2: P01-006; P3: L03-008, P03-012).
- Hindi build: only 9 strings translated, urgent sheets in English (P2: L05-001); `lang` reverts on reload (P2: L05-003); "जा रहे हैं" may read as masculine, an owner copy decision (P2: L05-002, confirmed in `src/lib/i18n.ts:25-26`, not seen on screen).

**Home / Around / map**
- "Help Points open now" tiles for listed-open places (P2: P04-001, P01-009, P12-012). Unknown hours shown as not open (P2: L02-010).
- City-level updates counted as "near you" (P2: L02-006). Headlines claim "open, lit, true" (P2: L02-007).
- Dawn and dusk sky card contrast 3.2–3.4:1 (P2: L04-002). Hydration error #418 on some cold opens (P3: P19-004).
- Map blank with no text when tiles fail (P2: P03-010, P06-003; the tile failure itself is environmental).

**Plan / brief / detailed planner**
- Legs start from the wrong place and ignore time order (P2: P12-002). Detailed-planner Save always makes a new plan (P2: P12-001). Tab edits labelled "Saved" (P2: P12-003). Two-device edits silently lost (P2: P12-004, P18-003). Journeys hides the rest of a plan during a leg (P2: P12-005). "Where I am now" way-back can't be saved, with jargon (P2: P12-006, P09-005).
- The ETA chosen in the plan is ignored at Start (P2: P13-002). Saving a plan isn't retry-safe (P2: P09-003).
- Run brief: wrong failure reason (P2: P04-003); two times for one twilight (P2: P04-004); polar daylight contradiction (P2: P04-005); "5 hour run" silently becomes 30 min (P2: P04-006); loop duration can't be typed and each keystroke throws a ZodError (P2: P04-007).
- Fixed bar covers "Clear plan" on tablet and desktop (P2: L03-004). Truncated gate names look identical (P2: L03-001). Hindi place search says "No match" (P2: P11-003).
- P3: raw ISO times and IANA ids (P12-008), the 3-leg limit isn't explained (P12-009), `?planStep=` opens the old planner (P12-010), past times briefed in the future tense (P05-008, P13-006).

**Mira chat**
- Hinglish/Hindi movement sentences not understood (P2: P11-002). Data-rights questions get a route plan (P2: P15-005). "What's open nearby?" starter misrouted (P2: L02-009). Starters put rankings in Mira's mouth (P2: L02-008). Countries with "the" not found (P2: P05-005). "Use current location" bar covers the last starter (P2: L03-003).
- On Slow 3G, urgent words in Home's box show a blank screen for ~4.5 s before the sheet (P2: P08-008).

**Journey (/trip) and dock**
- "ETA with time to spare" while late or missed (P2: P02-004, P13-005, P10-015). The sharing panel says both "following" and "stays private" (P2: P01-003). Home says "I'm with you" while 0 uploads (P2: P01-004).
- A WhatsApp contact accepting email mid-trip gives the wrong claim (P2: P02-007). "Send link" shares the generic link (P2: P07-004).
- Help-near panels have no expanded state (P2: P10-005); a 45-word status is re-announced every 30 s (P2: P10-006).
- P3: "+10 min" is one-use but "Review timing" extends without limit (P01-007); greyed "+10 min" after a miss isn't explained (P02-008); wrong reason on the missed screen (P02-009); "1 minutes ago" (R00-003).

**Follower page (/t/) and invites**
- The follower's age uses the follower's clock (P2: P06-002). Exact Home coordinates shown to link holders (P2: P06-006). A closed link becomes a generic 404 (P2: P06-007).
- Invite edge states all say "isn't valid / try again" (P2: P06-004). An expired 30-min cookie says "can no longer be accepted", though reopening works (P2: P06-005).
- P3: names and "arrived" visible for 30 min after the end (P01-005, owner decision on R7); delivery promises in invite copy (P06-010); `/api/t` Referrer-Policy (P06-009).

**Circle, contacts, emails**
- Invite emails are an uncapped, unblockable channel for attacker-chosen text: 10/10 delivered to one victim, no per-recipient cap, no opt-out (P2: P20-001; P3: P20-002).
- Impersonating names ("MIRA team", "Emergency", "mirahelp.co") and bidi/invisible names (P2: P17-002, P17-001). Destination change skips label cleaning, so links and line breaks reach emails (P2: P19-002).
- Emails say "hasn't contacted anyone else" when it has (P2: L02-005). A valid local number is rejected after country expiry (P2: P07-003). Unaccepted contacts vanish from Go with Mira silently (P2: P02-006).

**Report**
- Hindi names and plates slip past the screener (P2: L05-005). Retries burn the hourly quota (P2: P09-007). "Something happened" files as "other" (P2: P03-005).
- P3: the PII detector misses spelled-out numbers and "at gmail dot com" (P14-005); a long paste returns 413 (P19-006).

**You / data / account**
- Export omissions (P2: P15-003). Forget-habit with a malformed key forgets all (P2: P15-002). Deleting mid-journey gives no warning, and the follower sees 404 (P2: P15-004). Duplicate "Home" label moves the old place (P2: P09-006). The delete sheet at 200% is unscrollable (P2: L04-004).
- P3: export shows full WhatsApp numbers (L01-004); stale habits listed after a place is removed (P15-007).

**Contribute / Updates**
- Provider-hours matches announced as "someone else saw" (P2: P16-001). Self-contradiction blamed on "others" (P2: P16-002). The anomaly flag silently blocks Scout for up to a year (P2: P16-003). P3: P16-004 to P16-007.

**Sign-in**
- P3: generic "fields invalid" (P17-003, P19-005), 429 copy with no wait time (P17-004), Google start returns 500 without the 18+ cookie (P17-005), duplicate 18+ checkbox (P17-006), sign-in sheet has no Close (P10-012).

**Admin / moderation**
- "Reviewed" reads as verified (P2: P14-002). Reporters are promised notes that can't appear in this build (P2: P14-003).
- P3: a service-wide login throttle lets anyone lock moderators out (L01-003); the admin cookie isn't cleared on logout (P14-006); UTC times and raw geohash in admin (P14-007); a time band other than "Just now" never counts (P14-004); queue scrolls sideways (L03-005).

**Resilience (L6)**
- A failed notes or local-updates check is shown as an empty result on Around, the brief and Home (P2: L06-004). The brief's "Try again" under Local updates retries the route instead (P2: L06-005). A route failure leaves "0/0" Help Points and "Checking community notes…" spinning 70 s+ (P2: L06-006).
- No client timeout on any API call, so a stalled dependency spins indefinitely (P2: L06-007). The journey screen retries a failed Help Point lookup ~289×/min (P2: L06-008).
- Held: the Support pair stayed on screen in every failure mode, and the map bundle never loads on Home. Home on Slow 3G + 4× CPU: FCP ~1.9 s, interactive ~7.5 s, 229 KB JS (P9); per-route numbers are in `coverage/L06.md`.

---

## 5. Persona journeys

- **Priya (P1):** "Got to Gate 3 and Sis saw I'd arrived ✅ — but with an old trip still open, 'Start and share with Sis' quietly shared with nobody ❌, and in the tunnel my 112 became 'couldn't determine which country' ❌."
- **Meera (P2):** "Missed my check-in. Asha got exactly one email with no coordinates, Bina got nothing, I'm here killed the link ✅ — but after I swapped who follows, my screen said Chitra had been alerted when she hadn't ❌."
- **Ananya (P3):** "Planned and reported without an account, and the report followed me when I signed in ✅. But just opening Report took my location ❌, and with location off I never saw 112 ❌."
- **Kavya (P4):** "Planned a 05:10 loop. Asked for 5 h, got 30 min without a word, and the brief gave twilight at both 5:55 and about 5:45 ⚠️."
- **Sara (P5):** "In Lisbon Mira honestly said it didn't know my emergency number ✅. It told me my 10 PM walk would be in daylight, because it planned on India time ❌. Back in Delhi, 112 vanished two minutes after I stopped walking ❌."
- **Asha's mother (P6):** "Accepted, watched 'Expected by 9:11 AM IST', saw the link die on arrival ✅ — but after the missed-check-in email it told me her trip 'has ended' ❌."
- **Rekha (P7):** "WhatsApp opened with my live link and Mira only said 'Opened WhatsApp for Didi ✓'; when I missed, it honestly said nobody was told ✅ — but it first rejected Didi's number, and two 'Sis' contacts got one tick ❌."
- **Divya (P8):** "I typed 'help me pls' and Mira asked which starting place to use. Two minutes after I turned location on, Emergency stopped showing 112 ❌."
- **Sunita (P9):** "The page came up fast but my first taps did nothing. I got there and tapped I'm here ✅, but in the lift the app said it couldn't start, and my daughter got a missed check-in anyway ❌."
- **Rohan (P10):** "Got from Home to 'You made it' on keys alone, and the missed-check-in alert spoke up ✅. But every time I picked something, Mira went quiet and threw me back to the top ⚠️."
- **Nisha (P11):** "Told Mira 'kal raat 11 baje ghar jaana hai'. It answered in English and planned it for right now, in daylight. 'ghar pahunch gayi' left my trip running ❌."
- **Farah (P12):** "Dinner, dessert and the way home all saved ✅. But Mira checked my 12:30 walk from the restaurant I'd already left, and renaming it gave me three copies ⚠️."
- **Zoya (P13):** "Took a cab, Didi saw 'by car or taxi', arrived 1 min late and nobody was alarmed ✅. My 'Arrive by 10:49' was ignored at Start ⚠️, and a refresh after 'Travelling' threw my plan away ⚠️."
- **Moderator (P14):** "Held reports came in flagged; I redacted, approved and rejected, and the five-person note went up calm ✅. Then one person with five browsers got a note published too ⚠️."
- **Ira (P15):** "Forget and clear worked, and Delete wiped everything ✅. My other phone kept saying Didi would be emailed if I didn't arrive ❌."
- **Tanvi (P16):** "Friends confirmed my answers and Updates told me once, as a count ✅. It credited 'someone else' when only shop hours matched ⚠️."
- **Under-18 (P17):** "I couldn't get past the box without ticking it, and the API wouldn't let me either ✅. My friend called herself 'MIRA team', and her mum got 'MIRA team missed their check-in on MIRA' ❌."
- **Maya (P18):** "The server never made two journeys or sent two alerts ✅. I checked in on my phone, but my laptop still said 'On your way… Sis can follow', even while Sis was being emailed ❌."
- **Chaos monkey (P19):** "1,902 random taps, refreshes and tunnel drops never broke a screen ✅. The sign-in link from another phone says 'confirm you're 18' with nothing to tick ❌."
- **Stalker (P20):** "Her declines told me nothing, tokens were unguessable, my report pile was held, and dropping me killed her link ✅. I still sent her ten invites under the name 'I know your route' ❌."

---

## 6. Not tested, and why

- **WebKit / iOS Safari.** Not installed for Playwright; all runs were Chromium with phone viewports. iOS geolocation, PWA and permission behaviour are untested.
- **Real devices, real screen readers** (VoiceOver, TalkBack, NVDA), forced-colors mode. Announcements were inferred from ARIA, not heard.
- **Live providers.** No real Claude replies (the scripted companion was audited, and the routing code was read), no Google routes, places or hours, and no Overpass or Mapillary lighting. Live mode (§2) was not run; it needs the owner's OK.
- **Countries other than India.** Fixture reverse geocoding only knows Delhi. Other countries were simulated by intercepting `/api/geo/reverse` with the server's own country data (P5, V7).
- **Real email bounces** (Mailpit accepts everything). The rejected and unconfirmed wording was checked by editing the agent's own delivery rows.
- **Real WhatsApp, the Android share sheet, and push on any platform** (push is off in fixture mode; deletion cascade checked with a synthetic subscription row).
- **Map tiles.** They fail CORS in this environment, so long-press-to-report and keyboard map panning are untested.
- **Production client-IP handling.** Rate limits trust `x-forwarded-for` here. Production depends on `CLIENT_IP_HEADER`.
- **Server-side clock and DST.** Only the browser clock was faked; no live trip crossed a real DST change.
- **Service-wide limits** (global 500/h mail, admin lockout). Deliberately not tripped, to avoid disrupting other agents.
- **The `error.tsx` boundary.** Nothing reachable from the UI triggered it.

---

## 7. Top 10 fixes, in order

| # | Fix | Restores | Effort |
|---|---|---|---|
| 1 | Keep the last verified country with its age across loads (sessionStorage/localStorage). Refresh it on visibility and with a periodic fix while the app is open. Don't clear it when a reverse lookup fails (L06-003). Fall back to the device locale or a manual country. **Never remove the `tel:` link**: show "Last known: India · 112" instead (P0-1). | R8 | M |
| 2 | Widen urgent intent: stems, typos, Hinglish/Hindi, and requests like "call police" or "alert my sister". Make the plan engine's fallback for non-plan text point to Emergency and Help Points. Turn arrival phrases during a journey into an "I'm here" prompt (P0-6, P11-004). | R8, R4 | M |
| 3 | `/report` must not request location on load. Don't promote an implicit fix to an app-wide choice. Scope "Use my location" to what the copy says, and add an off switch in You (P0-2, P03-002). | R2 | S |
| 4 | Build the missed-state copy from delivery records, not the current recipient list (P02-001/002). Send an all-clear when a trip ends after an alert (P02-003). Give the follower page a "didn't check in, live sharing has stopped" state after expiry (P06-001). | R6, R4 | M |
| 4b | Make the missed-check-in alert retryable and idempotent: an outbox row with a per-recipient send key, retried on a stale claim instead of being marked unconfirmed. Let `shutdown()` wait for the in-flight tick before closing the pool (P0-7). | R4 | M |
| 5 | On `trip_active`, show the conflict and offer "End that journey and start this one". Never navigate silently. On a lost Start reply, recheck with the kept idempotency key before saying it failed (P0-3, P09-001). | R3, R6 | S |
| 6 | Reconcile the journey client with the server: handle `{trip:null}`, closed and missed in `TripScreen` and the dock, and refresh the dock on navigation and polls (P18-001, P15-001, P18-002). | R4, R12 | S |
| 7 | Magic link: name the account on the confirm page and bind the link to the requesting browser, or require confirmation when another session is active. Let a second device complete the 18+ step (L01-001, P19-001). | R7 | M |
| 8 | Urgent-path robustness: ignore scrim taps for ~600 ms after a sheet opens (P08-004). Put a `tel:` link and guidance on the offline page (P08-005). Render the Support pair as plain links that work before hydration (P09-004). | R8 | S |
| 9 | One time formatter ("9:05 PM", uppercase, zone label when it differs). Take the zone from the place's coordinates. Make `instantForLocal` DST-safe. Parse Hinglish/Hindi times (P05-001, P05-003, P11-001, P02-005 cluster). | R14 | L |
| 10 | WhatsApp: key the "opened" state by contact id. Fix trunk-0 and double-country-code normalisation, and show the full stored number on save (P07-001, P07-002). | R6 | S |

Before public releases are switched on: count report independence by more than account or cookie (P14-001). Add a per-recipient invite cap and a "don't email me again" link (P20-001).

---

## 8. Numbers

| | |
|---|---|
| Agents run | 40: 1 recon, 20 personas (P1–P20), 6 lanes (L1–L6), 11 P0/P1 verifiers (V1–V11), 2 P2 spot-checkers (S1–S2) |
| Run time | ~3 h wall clock (08:33–11:30 IST). Host load peaked at ~48, which slowed agents but caused no false findings after re-runs. |
| Flows walked | every persona's main story plus its edge-case list. A 1,902-step random walk (5 seeds). 63 bad deep links × 3 modes. ~700 visual captures (4 widths × 3 palettes). axe on 84 states × 3 setups. 405 CSRF probes. Every `[id]` route probed for IDOR. |
| Raw finding lines | 243: P0 17 · P1 27 · P2 103 · P3 96 (25 are repro/extension lines of an earlier root cause) |
| After dedupe (root causes) | **P0: 7** · **P1: 16** (plus 2 P1-ranked triggers inside P0-1) · 4 P1→P2 downgrades by verifiers |
| Verification | All P0/P1 lines independently re-run, 36 verdict lines: **36 CONFIRMED, 0 NOT REPRODUCED**. One sub-claim ruled ENVIRONMENT (112 loss on `/trip` while online: a Playwright GPS-timestamp artifact). P0-7 and L06-003 confirmed by code and simulation, not by an independent re-run. |
| P2 sample (20%, seeded) | 17 sampled: 16 CONFIRMED on screen, 1 confirmed in source only (Hindi build already stopped) |
| Environment incidents | :3400 restarted once (~1 min, 05:06 UTC, background-task time limit; no DB reset). Agents re-ran affected steps. Brief Postgres connect timeouts under peak load. |

### Cleanup notes
- The audit databases (`mira_e2e_audit`, `mira_e2e_audit_hi`), audit servers, the Hindi build copy and traces are removed at the end of the run. Screenshots referenced by findings are kept in `/tmp/mira-audit-20261004/shots/`.
- The developer's database `mira`, the dev server on :3210 and the repo source were not touched. The only repo change is this report.
