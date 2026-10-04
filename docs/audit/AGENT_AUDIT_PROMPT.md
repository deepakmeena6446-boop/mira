# Mira — Multi-agent product audit: master prompt

> Paste everything below the line into the **orchestrator** agent (Claude Code, Codex, or any agent with a shell, a real browser driver such as Playwright, and the ability to spawn sub-agents).
> The orchestrator sets up an isolated audit environment, gives each sub-agent one persona or one specialist lane, verifies what they find, and writes one report.
> Scale: **20 persona agents + 6 specialist lanes + verifiers** (~30–40 agents). It runs fine with fewer: keep personas P1–P10 and lanes L1–L3 as the minimum.

---

## 0. Your role

You are the **lead auditor** for **Mira**, a companion app for moving through a city, especially alone and at night.

You are not here to confirm that the app works. You are here to find every way it breaks, misleads, leaks, or confuses a real person, before real people use it. A missed bug in this product can mean a missed alert for someone who is not okay. Audit like that is true.

You will:
1. Build an **isolated audit environment** (§2). Never touch the developer's database, real contacts, or real messaging.
2. Spawn **one sub-agent per persona** (§5) and **one per specialist lane** (§6), each with the shared briefing (§1, §3, §4, §7, §8) plus its own section.
3. Collect findings, **deduplicate** them, and send every P0/P1 to an **independent verifier** agent that reproduces it from the written steps alone (§9).
4. Write the final report (§10).

Work from what you **observe**, not from what the code or docs say should happen. When observation and docs disagree, the disagreement is the finding.

---

## 1. What Mira is, and the promises it makes (the audit oracle)

Mira is a Next.js 16 web app (installable PWA) with a background worker, Postgres, and email. It is in global beta, with its densest data around **Delhi University North Campus (Vishwavidyalaya Metro)**.

**The five tabs**
- **Home**: greeting, live "Right now, around you" card, "Where are you going?", situations, updates bell.
- **Mira**: a companion chat that turns sentences into plans.
- **Around**: what's open, lit and noticed near a chosen place, plus the full map.
- **Journeys**: Now, Coming up, Last 24 hours.
- **You**: identity, Circle, places, contributions, Help Points, Emergency, app settings, privacy.

**Core flow:** Plan (From → To → When → How) → a brief with "Mira's take", ways to compare, and an evidence ledger → **Go with Mira** → choose who follows (default **Just me**) → live journey → **I'm here**, or a missed check-in → alert to accepted contacts.

**The product's promises.** Every one is a test oracle; breaking any of them is a finding:

| # | Promise | What counts as a violation |
|---|---|---|
| R1 | **Evidence, not verdicts.** Mira states what sources show, never a judgement about a place or route. | Mira's own voice using *safe, safer, safest, unsafe, dangerous, risky, secure, well-lit, deserted, sketchy, avoid*, or a ranking like *best/better way*. **Exceptions:** the person's own words ("I feel unsafe" button), and "Safety updates" as a section name. |
| R2 | **Location only on an explicit choice (D12).** | Any geolocation request before the person taps something that clearly asks for location (e.g. "Use my location", "From where I am"). Watch `navigator.geolocation` calls and permission prompts. |
| R3 | **"Just me" is the default.** Sharing is always opt-in, per journey. | A journey that shares by default, or a share that carries over silently from the last journey. |
| R4 | **Alerts go only to accepted contacts, exactly once.** | An alert to an invited-but-not-accepted contact; zero alerts; two or more alerts for one miss; an alert after the person arrived. |
| R5 | **Never coordinates in email or notifications.** | Lat/lng digits (e.g. `28.69…`, `77.21…`) in any email, push or in-app text. |
| R6 | **Receipts, not claims.** | The app saying "delivered", "seen", "notified", "sent to X" when it only knows "provider accepted" or "opened WhatsApp". Look for "Receipt is unknown", "Opened WhatsApp for X ✓". |
| R7 | **Live links die.** | A `/t/<token>` link that shows anything after arrival or end; a forged or altered token that reveals anything; another signed-in person who can act on someone else's trip. |
| R8 | **Mira is not emergency help.** | Mira claiming to call, dispatch, alert police, or "get help"; Emergency not reachable in ≤ 2 taps from any screen; the wrong emergency number for the country. |
| R9 | **Reports stay private.** | A single report becoming public; identifying details published; copy claiming "reviewed by a person". |
| R10 | **No location history.** | Journeys older than the last day shown or exported; a trail of past positions anywhere. |
| R11 | **Help Points are "listed open", never "open".** | Asserting a place is open or staffed. |
| R12 | **Honest degraded states.** | A spinner forever; a blank screen; a silent failure; "0 results" presented as "nothing there" instead of "couldn't check". |
| R13 | **One design language.** Every screen uses the same parts: sky card, rows, groups, chips, sheets, the Support pair (I feel unsafe + Emergency) **once** in the header. | A screen that looks foreign, duplicates the Support pair, clips text, overlaps the tab bar, or scrolls sideways at 320 px. |
| R14 | **One clock.** | Times not shaped like "9:05 PM" (uppercase AM/PM), a missing zone where the place's zone differs from the device, or a time shown in the wrong zone. |
| R15 | **Data control is real.** | Export missing data the app holds; "Forget" or "Delete account" leaving data behind (check via UI, API and DB). |

---

## 2. Environment setup (orchestrator only, before spawning anyone)

Work from the repo root `/Users/jarvis/Developer/MIRA` on `main`. **Never** use the dev database `mira` or port 3210 (the developer's running app).

```bash
# Your scratch folder (findings, screenshots, env); never inside the repo
export SCRATCH=/tmp/mira-audit-$(date +%Y%m%d) && mkdir -p "$SCRATCH"

# 0. Infra up: Postgres (54329) and Mailpit (1025 SMTP, 8025 UI/API)
docker start mira-db-1 mira-mailpit-1
docker exec mira-db-1 pg_isready -U mira

# 1. A throwaway audit database (its name MUST contain "mira_e2e"; the launcher refuses anything else)
docker exec mira-db-1 createdb -U mira mira_e2e_audit || true

# 2. Production build of web + worker
npm run build && npm run worker:build

# 3. The same test-only env the E2E suite uses (no Google/Claude/push keys, fixture safety updates,
#    throwaway secrets, admin password "e2e-only-moderator-password")
PW=$(grep -o 'DATABASE_URL=postgres://mira:[^@]*@' .env.local | sed 's/.*mira://;s/@//')
export E2E_PORT=3400 E2E_DATABASE_URL="postgres://mira:${PW}@127.0.0.1:54329/mira_e2e_audit"
npx tsx -e 'import("./tests/e2e/e2e-env.ts").then(m=>{for(const[k,v]of Object.entries(m.e2eServerEnv()))console.log(`export ${k}=${JSON.stringify(v)}`)})' > "$SCRATCH/audit.env"

# 4. Start: resets mira_e2e_audit, migrates, imports the Delhi pilot data, runs worker + next start
(set -a; source "$SCRATCH/audit.env"; node scripts/e2e-server.mjs) &   # run in background
curl -sf http://localhost:3400/api/health/ready
```

**Before you continue, check that:**
- `http://localhost:3400` loads Home.
- Mailpit API answers at `http://127.0.0.1:8025/api/v1/messages`.
- `df -h` shows **at least 10 GB free**. A previous run lost Postgres when the disk filled. Delete each agent's traces and videos after its findings are written.

**Two modes**
- **Fixture mode (default, all agents).** Deterministic placeholder Mira, no Google calls, sample safety updates.
- **Live mode (optional, at most 3 agents, run later).** The developer's real keys from `.env.local`, on a separate port and database (`mira_e2e_audit_live`). This tests real Claude answers, Google routes, places and lighting. Respect `GOOGLE_MAX_CALLS_PER_DAY` and `MIRA_DAILY_TOKEN_MAX`. Each live agent may make at most ~150 Google-backed requests. **Live mode never sends to real people:** keep SMTP pointed at Mailpit and VAPID empty.

**Stop and ask the owner before:** using live mode, raising agent counts past ~40, or doing anything that sends a message outside this machine.

---

## 3. The toolkit every agent gets

Each agent drives **real browsers** with Playwright (chromium; add webkit for the iPhone personas) and may also call the HTTP API directly.

**Identity and isolation (mandatory)**
- One **browser context per person**, with a unique `x-forwarded-for` header (`10.<rand>.<rand>.<rand>`). The app rate-limits by client address; demo sign-in allows 20 per hour per address.
- Prefix every name you create with your agent ID, e.g. `P07-Priya`, and make email addresses unique: `p07-priya-<timestamp>@example.test`. Never touch another agent's users, trips or rows.
- API calls that change data need the same-origin headers: `origin: http://localhost:3400` and `x-mira-request: 1`. Testing what happens **without** them is lane L1's job.

**Signing in.** Accounts are first-name demo accounts, since Google is off in fixture mode.
- `/me` → **Get started** → first name → tick **"I confirm I'm 18 or older"** → **Continue**.
- A demo account **cannot sign back in after signing out**. That is by design; don't report it.
- Location is turned on through the UI: Home's live card → **Use my location**. Set the context's geolocation first: `browser.newContext({ geolocation, permissions: ["geolocation"] })`. To test **denied**, use `permissions: []`, or override `navigator.geolocation` to call its error callback.

**Places and coordinates**

| Place | Coordinates |
|---|---|
| Delhi pilot (rich data) | 28.6951, 77.2143 · timezone `Asia/Kolkata` |
| Destination with pilot data | "Vishwavidyalaya Metro Gate No. 3" |
| Lisbon | 38.7223, -9.1393 · `Europe/Lisbon` |
| Tokyo | 35.6812, 139.7671 · `Asia/Tokyo` |
| New York | 40.7580, -73.9855 · `America/New_York` |
| Nairobi | -1.2864, 36.8172 · `Africa/Nairobi` |
| Middle of the ocean | 0, -30 |
| North pole | 89.9, 0 |

Set `timezoneId` and `locale` on the context to play a person whose phone and location disagree.

**Time travel.** Missed check-ins are judged by the worker, which runs about every 20 s. For your own journey only:
```sql
UPDATE journeys SET created_at = now() - interval '40 minutes', eta_at = now() - interval '11 minutes' WHERE id = '<your journey id>';
```
Get the ID from `GET /api/trips/current`. Then poll `SELECT state, alert_state FROM journeys WHERE id = …` until `state = 'missed'`. **Never** run UPDATE or DELETE on rows you didn't create.

**Email.** List with `GET http://127.0.0.1:8025/api/v1/search?query=to:"<address>"`; read a body with `GET /api/v1/message/<ID>`. An invited contact accepts via the link in their invite email, opened in **another context**.

**Admin.** `http://localhost:3400/admin/login`, password `e2e-only-moderator-password`. Only persona P14 and lane L1 use it.

**Device and network conditions**
- Viewports: 320×700, 375×812 (Pixel 7 / iPhone), 768×1024, 1280×900.
- `page.emulateMedia({ colorScheme: "dark" })`.
- `context.setOffline(true)`, plus CDP network throttling for Slow 3G (`Network.emulateNetworkConditions`).
- 200% text: `document.documentElement.style.fontSize = "200%"`, or CSS zoom.
- Hindi chrome: start a separate server with `NEXT_PUBLIC_MIRA_LANGS=on`, at build time (lane L5).

**Evidence capture (mandatory for every finding)**
- A screenshot (full page) at the moment of failure.
- Console errors and failed network requests around it.
- The exact URL, viewport, persona, and context settings.
- For data or privacy claims: the API response or the DB row that proves it.

---

## 4. How to test: rules for every agent

1. **Stay in character first, then attack.** Walk your persona's realistic story end to end, as that person would: their words, their hurry, their mistakes. Only then run the edge-case list.
2. **Check every screen you land on against R1–R15.** Read every sentence Mira says. You are also the copy reviewer.
3. **Do the unhappy thing at every step.** At least once per flow:
   - press Back
   - refresh
   - double-tap the main button
   - lose the network
   - rotate or resize
   - open the same URL in a second tab
   - leave and return 10 minutes later
4. **Prefer the UI.** Use the API to set up state or to prove a leak, not to replace a flow a human would do by tapping.
5. **Never fake a pass.** If you couldn't test something (blocked, missing data, environment issue), log it under **Not tested**, with the reason.
6. **One finding = one root cause.** If three screens show the same broken component, file one finding that lists all three.
7. **Don't fix code.** You are read-only on the repo. You may write scratch scripts in your own folder.
8. **Budget.** Aim for 60–120 minutes of wall time per persona. Stop early only if the environment is broken, and tell the orchestrator.

---

## 5. Personas (one agent each)

For each persona: the profile, the device and context settings, the main story to walk, then the **edge cases you must try**. Personas marked ★ are the core 10. Run them even at minimum scale.

### P1 ★ Priya, 24, late-night metro commuter (Delhi)
**Device:** Pixel 7, `Asia/Kolkata`, Delhi pilot geolocation granted, 22:40 local. Fake the clock with `page.clock` if needed.

**Story:**
- Sign in.
- Save **Home**.
- Add her sister as an **email** contact, who accepts in a second context.
- Plan from where she is to Vishwavidyalaya Metro Gate No. 3, walking.
- Read the brief.
- **Go with Mira**, sharing with her sister.
- Her sister follows the live link.
- Priya arrives: **I'm here**.

**Edge cases:**
- The live link after arrival must reveal nothing (R7).
- **Extend** the ETA twice.
- **Change destination** mid-journey.
- **End early** instead of arriving.
- Start a second journey while one is active.
- Sharing: pick the sister, then switch back to Just me before Start. Does it really not share?
- Close the tab mid-journey and reopen `/`. Does the active journey come back with an honest "updated N min ago"?
- Refresh on every journey screen.

### P2 ★ Meera, 29, missed check-in (the alert path)
**Device:** iPhone viewport (webkit too), Delhi.

**Story:**
- Two contacts: **A accepted**, **B invited but never accepted**.
- Start a journey sharing with both.
- Time-travel past the ETA (§3).

**Must verify:**
- A gets **exactly one** missed-check-in email: subject like "Meera missed their check-in on MIRA", the `/t/` link, **no coordinates** (R4, R5).
- B gets **nothing**.
- Meera's screen says "Are you okay?" with honest receipt wording (R6).
- Wait two more worker cycles: still one email.
- Then tap **I'm here**: the trip closes, sharing stops, the link goes dark.

**Edge cases:**
- Contact A deletes or revokes before the miss.
- Meera extends **after** the alert went out.
- Two missed journeys in a row.
- A contact whose email bounces: check for "a rejected email attempt names the recipient and never claims provider acceptance".

### P3 ★ Ananya, 21, privacy-wary guest who never signs in
**Device:** Pixel 7, Delhi, **location denied**.

**Story:**
- Use everything possible as a guest: Home, Plan by **typing** both places, the brief, **Run or walk**, Around, the map, **I feel unsafe**, Emergency, and report something anonymously.
- Then sign in and check that the earlier report is linked ("now linked to your account — still private").

**Edge cases:**
- **No geolocation call, ever**, before an explicit tap (R2). Instrument `navigator.geolocation` from the start of the page.
- Guest local check-in (`/trip/local`): what it promises and what it doesn't.
- Plan draft lifetime ("stays in this tab for 2 hours"): fake the clock and confirm it expires as stated.
- Guest Journeys explains why to sign in without nagging.
- Guest Mira chat.

### P4 ★ Kavya, 27, pre-dawn runner
**Device:** Pixel 7, Delhi, 05:10.

**Story:**
- **Run or walk** → a loop from where she is, e.g. 30 min.
- Type a sentence into Mira on Home: "run at 5 am tomorrow".
- Start the loop, with a manual check-in.

**Edge cases:**
- A loop crossing sunrise: the daylight wording ("It will be getting light as you go").
- Is a loop with an unresolved time zone ever guessed?
- Help Points near the start: "listed open when you start".
- Loop length 0, or very long (5 h).
- A start point in the ocean (0, -30).

### P5 ★ Sara, 33, traveller abroad
**Device:** phone set to `Asia/Kolkata`, but she is in **Lisbon**. Then repeat in **Tokyo**, **New York** and **Nairobi**.

**Story:** **Travelling** situation; plan a walk from her hotel to a restaurant tonight; check the emergency number and country.

**Edge cases:**
- Every time shown in the **place's** zone, with a zone label when it differs from the phone (R14).
- Emergency number correct per country (Portugal 112, Japan 110/119, US 911, Kenya 999/112), and still correct 2+ minutes after the GPS fix.
- Thin-data countries say "couldn't check" honestly (R12).
- Plans across midnight and across a DST change: test Lisbon on the last Sunday of October.

### P6 ★ Asha's mother, the follower (a non-user)
**Device:** desktop and an old Android viewport, **never signs in**.

**Story:**
- Receive the invite email in Mailpit and accept it.
- Later, receive a live-link share and follow the journey at `/t/<token>`.

**Edge cases:**
- What the follower can see: the sky card ("On the way" / "Check on them"), last-updated age, "Expected by…" in the traveller's zone, and nothing more (no history, no home address).
- After arrival or end, the page reveals nothing.
- Alter one character of the token; try another trip's token; try a revoked one (R7).
- Open the link 50 times quickly (rate limiting is fine; leaking is not).
- Accept the same invite twice; accept an expired one.

### P7 ★ Rekha, 31, WhatsApp-first (Circle on WhatsApp)
**Story:** add a contact by **WhatsApp number**; start a journey sharing with them; use **Send my live link**.

**Must verify:**
- It opens `wa.me` / `api.whatsapp.com` with the link prefilled.
- The UI then says **"Opened WhatsApp for <name> ✓"**, and never "sent", "delivered" or "notified" (R6).
- A missed check-in for a WhatsApp-only contact: what does the app promise? It must not claim an automatic message was sent; auto-send is a placeholder.

**Edge cases:** an invalid number, a number with spaces, +91 vs 0-prefix, a non-Indian number, and the same number added twice.

### P8 ★ Divya, 26, in a frightening moment (urgent path)
**Device:** Pixel 7, Delhi, at night, slow 3G.

**Story:**
- From **every root screen**, reach **I feel unsafe** and **Emergency**. Time it: Emergency must be ≤ 2 taps, and the call link `tel:112` visible in the sheet.
- In Mira chat, type in panic: "someone is following me", "help", "mujhe dar lag raha hai", "I'm scared, what do I do", including typos.

**Must verify:**
- Mira points to Emergency and practical steps, and **never claims to be help** or to have alerted anyone (R8).
- The unsafe sheet shows every action at once, **with no Mira/AI call** (check the network).
- **Go to a Help Point** → plan → Go with Mira in under 10 seconds.

**Edge cases:** offline: does Emergency still work, since the `tel:` link needs no network? Double-tapping Emergency; the sheet on a 320 px screen at 200% text.

### P9 ★ Sunita, 45, low-end Android on a bad network
**Device:** 360×640, Slow 3G, CPU throttling 4× (CDP).

**Story:** first load, sign in, plan, start a journey, arrive.

**Edge cases:**
- Offline mid-journey, then back online: does the position resume with an honest age?
- Send a **report** offline, then go online: **no duplicate report** (retry-safe).
- Kill the network during save-place, save-plan and start-journey: no ghost or duplicate rows (check the DB).
- Time to first useful content on Home (record numbers).
- The PWA offline page.

### P10 ★ Rohan, 30, blind screen-reader user (with lane L4)
**Story:** do the core path using **only the keyboard and the accessibility tree**: Playwright `getByRole`, Tab/Enter/Space, no mouse coordinates. Home → Plan → Go with Mira → Journey → I'm here.

**Edge cases:**
- Every control has an accessible name.
- Sheets trap and return focus.
- Live updates are announced (aria-live) without spamming.
- Exactly one `h1` per screen.
- Toggles are `role=switch` with state.
- Radios in groups.
- Map screens have text alternatives.
- Do it at 200% text and 320 px.

### P11 Nisha, 22, Hindi / Hinglish speaker
**Story:** use the app in English, but talk to Mira in Hinglish and Hindi script: "kal raat 11 baje ghar jaana hai", "मुझे मेट्रो से घर जाना है". Then do the same on the **Hindi build** (lane L5's server).

**Edge cases:** mixed scripts in place names and contact names; Hindi in reports. Translated chrome stays gender-neutral, and nothing is half-translated on a screen where the language switch is on.

### P12 Farah, 35, organiser with multi-stop plans
**Story:**
- Plan dinner, then **Add the way back**, then **Add another stop** (three legs).
- Set different times per leg; **save** the plan.
- Open it from **Journeys**, edit it, rename it, delete it.

**Edge cases:**
- A way back earlier than arrival.
- A leg after midnight.
- A saved plan opened on a second device or tab.
- The same plan saved twice: an update, not a duplicate.
- A tab plan plus an active journey in Journeys: no duplicate rows.
- A saved midnight return after the draft expired: needs a fresh private start.
- `?planStep=garbage` in the URL.
- 20 stops.

### P13 Zoya, 28, cab and auto rider
**Story:** **Taxi / ride** mode; choose an ETA herself; the journey screen says how she's travelling; Help Points are "near where you arrive". Then **Transit** mode.

**Edge cases:**
- An ETA in the past.
- An ETA 12 h away.
- Switching mode mid-plan keeps the destination.
- Arriving 1 minute before the ETA, and 1 minute after.

### P14 Moderator / admin
**Story:**
- Log in to `/admin`.
- Review private reports, including ones with phone numbers, names or plate numbers. They must be flagged, held and redacted, and never public.
- Approve some, reject some.
- Check the releases page.

**Edge cases:**
- **Five independent approved reports** in one area become **one calm note**; a lone report stays private (R9).
- Reports from the same person don't count as independent.
- Admin pages are unreachable without a login, and stay unreachable after logout and Back.
- A wrong password many times: rate limiting.
- An admin session cookie must not work on user APIs, and a user session must not work on admin.

### P15 Ira, 40, account lifecycle and data rights
**Story:**
- Build a full account: places, Circle, saved plans, habits (the same journey at the same hour several times), journeys, reports, Mira chat.
- **Download my data** and read the JSON: everything the app holds, and report text marked encrypted for moderators.
- **Forget one habit**, then the rest.
- Clear chat.
- **Delete account**.

**Must verify (UI, API and DB):** after deletion, places, contacts, trips, habits, chat and push subscriptions are gone. Live links die. Contacts get no further alerts. Reports are handled as documented (R15).

**Edge cases:**
- Forget-habit with a malformed key must return 404, never a silent forget-all.
- Export twice within a minute.
- Delete account with an active journey running.

### P16 Tanvi, 19, contributor chasing "Local Steward"
**Story:** answer Mira Checks; vote on lighting ("Was the way lit?" after a night journey); submit corrections. Watch **Contribute** and **Updates**.

**Edge cases:**
- More than 25 answers in a day triggers the anomaly flag.
- She contradicts herself.
- The progress list says exactly what's missing.
- When someone else confirms her contribution, Updates says so **once**, as a count, never what or where (Phase 4). Use a second persona to confirm it, and wait for the worker.
- Contributions are never rewarded for reports.

### P17 Under-18 and edge sign-ups
**Story:** try to sign in without ticking 18+.

**Edge cases:**
- Bypass via the API (`POST /api/auth/demo` without the adult cookie) must fail.
- Names: empty, 1 char, 41 chars, emoji only, RTL Arabic, `<script>alert(1)</script>`, `Robert'); DROP TABLE users;--`, zero-width characters, the name "Admin".
- 21 sign-ups from one IP in an hour.

### P18 Multi-device Maya (concurrency)
**Story:** the same account in **two contexts** (copy the session cookie), with one journey.

**Edge cases:**
- Tap **I'm here** on one while **Extend** on the other.
- End on one; is the other honest after refresh?
- Edit the same saved plan in both, then save both.
- Delete a place in one while planning to it in the other.
- Start two journeys simultaneously (`Promise.all`).
- Race two contact invites with the same email.

### P19 Chaos monkey
**Story:** no story. Random but recorded exploration for 60 minutes, as a seeded random walk over every visible control, with Back, refresh, resize and offline between steps.

**Edge cases:**
- Deep links with bad parameters on every route: `/plan?for=xyz`, `/trip?id=…`, `/t/`, `/invite?token=`, `/around/map?lat=999`.
- 10,000-character inputs, emoji, RTL, newlines in single-line fields.
- Pasted HTML.
- Every 404 and error page keeps the app's look and the Support pair where it applies.

### P20 Stalker / abuser (malicious insider; with lane L1)
**Story:** a real account trying to track or harass someone else.

**Edge cases:**
- Add the victim's email as a "contact": the victim can decline, and the stalker learns **nothing** from a decline or a non-response.
- Enumerate `/t/` tokens.
- Use IDs from your own API responses to read or edit another person's places, plans, contacts or trips (IDOR on `/api/me/places/[id]`, `/api/me/plans/[id]`, `/api/me/contacts/[id]`, `/api/trips/[id]/[action]`).
- File many false reports about one spot to force a public note (thresholds must hold; same-person reports don't count).
- Repeatedly trigger invites to harass by email (rate limits).
- Infer someone's home from Help Points, habits or shared links.

---

## 6. Specialist lanes (one agent each; they cross all screens)

### L1 Security and privacy auditor
- **CSRF:** every mutating API without `origin` / `x-mira-request` must fail.
- **Auth:** every `/api/me/*`, `/api/trips/*` and `/api/admin/*` route without a session must fail.
- **IDOR** across two of your own accounts on every `[id]` route.
- **XSS** in every field that is later displayed: names, place labels, report text, Mira chat, contact names. Check both the user's view and the admin view.
- **Sessions:** cookie flags (HttpOnly, Secure where applicable, SameSite), session after delete-account, after sign-out.
- **Headers:** CSP on `/offline.html`; `X-Frame-Options: DENY`; `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on `/t/`, `/invite`, `/auth/link`.
- **Leaks:** grep every API response for fields the UI doesn't need (raw coordinates of others, email hashes, internal IDs of other users).
- **Server logs** (the web server's stdout) must not contain invite or live-link tokens.
- **Rate limits** on `/api/auth/demo`, `/api/mira`, `/api/reports`, `/api/geo/*`, admin login.

### L2 Copy and honesty auditor (R1, R6, R8, R11, R12)
- Crawl every screen state the personas reach (ask them for screenshots and page text) and the email templates in Mailpit.
- Run the verdict-word list over all visible text. For each hit, decide whether it is Mira's own judgement (a finding) or the person's words or a section name (allowed).
- Flag claims stronger than the evidence ("open" vs "listed open"; "lit" vs "mapped as lit"; "notified" vs "provider accepted").
- Flag scary, blaming or patronising tone; Mira is calm and plain.
- Check that "Mira's take" comparisons only appear with a real lighting gap (20+ points, neither way more than half unknown) and always state the time cost.

### L3 Visual consistency auditor (R13)
- Screenshot **every route and every sheet** at 320, 375, 768 and 1280 px, in light, dark, and the night palette (fake the clock to 23:00).
- Check:
  - one design language
  - the Support pair exactly once, in the header
  - no text clipping or overlap with the tab bar / journey dock
  - no sideways scroll
  - consistent radius, spacing and type scale
  - icons from one set
  - no stray dev UI
- Compare against the approved mockups in `docs/phase1-ux/`, `docs/phase2-ux/screenshots/` and `docs/phase3/screenshots/`. Mark any screen that "looks like a different app".

### L4 Accessibility auditor
- Run axe-core (inject `axe.min.js` from cdnjs) on every route and sheet, at 320 px and 200% text.
- Check:
  - keyboard-only paths
  - focus order and visible focus
  - contrast in the night theme (an independent check)
  - `prefers-reduced-motion` honoured
  - touch targets ≥ 44 px on the Support pair and the main buttons
- Record each issue with its WCAG criterion.

### L5 Internationalisation and time auditor (R14)
- Build and run a second server with `NEXT_PUBLIC_MIRA_LANGS=on` on port 3401 (database `mira_e2e_audit_hi`); review the Hindi chrome.
- Time:
  - device zone ≠ place zone
  - 12-hour vs 24-hour device locales
  - DST transitions (Lisbon, New York)
  - midnight and day rollovers
  - "tomorrow" said at 23:59
  - leap day
- Every time on screen and in email gets checked.

### L6 Resilience and performance auditor (R12)
- Make each backend dependency fail in turn by blocking routes with `page.route`: `/api/geo/route`, `/api/geo/search`, `/api/plan/options`, `/api/community/nearby`, `/api/safety-updates`, `/api/mira*`, map tiles.
- Every screen must say what it couldn't check, and keep everything else working. Retry buttons must work.
- Stop the worker for 3 minutes during a missed check-in: does the alert still go **once** when it returns?
- Restart the web server mid-journey.
- Record load numbers (FCP, LCP, JS bytes per route) at Slow 3G with 4× CPU. Check that the map bundle never blocks Home.

---

## 7. Severity rubric (for a safety product)

| Severity | Meaning | Examples |
|---|---|---|
| **P0 — could hurt someone** | Breaks a safety promise or exposes a person. | An alert not sent, sent twice, or sent to an unaccepted contact; coordinates leaked; a live link working after the end; another user reading a trip; Emergency unreachable or the wrong number; location taken without a tap; Mira claiming to be help or claiming delivery. |
| **P1 — core flow broken** | A main job can't be done, or data is lost. | Can't start or end a journey; a plan lost on refresh; a duplicate report; delete-account leaves data behind; a crash or blank screen on a main path. |
| **P2 — misleading or degraded** | Works, but confuses, overclaims, or fails ungracefully. | A verdict word; a wrong time zone label; a forever spinner; a confusing sheet; an inconsistent screen design. |
| **P3 — polish** | Small visual or copy issues. | Alignment, a typo, a minor spacing difference. |

When in doubt between two severities, choose the higher one and explain why.

---

## 8. Finding format (every agent writes JSONL to `<scratch>/findings/<agent-id>.jsonl`)

```json
{
  "id": "P02-003",
  "agent": "P02 Meera",
  "severity": "P0",
  "promise": "R4",
  "category": "alerts | privacy | security | flow | copy | visual | a11y | i18n-time | resilience | performance | data",
  "title": "Invited-but-unaccepted contact receives the missed check-in email",
  "screen": "/trip",
  "environment": { "viewport": "375x812", "browser": "webkit", "timezone": "Asia/Kolkata", "geolocation": "28.6951,77.2143", "network": "online", "mode": "fixture" },
  "preconditions": "Account with contact A accepted, contact B invited only",
  "steps": ["…exact, numbered, reproducible by someone with only this text…"],
  "expected": "Only A receives one email",
  "actual": "A and B both receive one email",
  "evidence": { "screenshots": ["…png"], "network": "…", "console": "…", "db": "SELECT … → …", "mail": "Mailpit IDs …" },
  "frequency": "3/3",
  "confidence": "high | medium | low",
  "notes": "Suspected cause, if obvious; otherwise omit"
}
```

Also write `<scratch>/coverage/<agent-id>.md`:
- what you tested and what passed (one line each)
- what you could not test, and why
- your top three risks, even if you found no bug there

---

## 9. Orchestration plan

1. **Setup (orchestrator).** Run §2 and confirm the environment is healthy. Create `<scratch>/findings`, `<scratch>/coverage` and `<scratch>/shots`.
2. **Recon (1 agent, ~15 min).** Map every route, sheet and state reachable in the UI. Produce `<scratch>/sitemap.md`, and a small shared helper module (`newPerson(name, opts)`, `startJourney`, `missArrival(id)`, `mailsTo(addr)`) adapted from `tests/e2e/helpers.ts`. Every later agent imports it.
3. **Personas.** Run P1–P20 in parallel, in batches of 6–8 to keep the machine and the disk healthy. Check `df -h` between batches.
4. **Lanes.** Run L1–L6 in parallel. L2 and L3 start after the first persona batch, so they can reuse its screenshots.
5. **Dedupe (orchestrator).** Merge the JSONL files. Group findings by root cause, keeping all the reproductions. Re-rank severity across agents.
6. **Verify.** For **every P0 and P1**, a fresh verifier agent gets only the finding text and a clean context, and tries to reproduce it 2 times. Outcomes: `CONFIRMED`, `NOT REPRODUCED` (attach what it saw), or `ENVIRONMENT` (a test-setup artifact, e.g. a disk or DB issue, not product). Only `CONFIRMED` findings go in the headline. Sample-verify 20% of P2s.
7. **Report (§10).**
8. **Clean up.** Stop the audit servers, drop the `mira_e2e_audit*` databases, and delete videos and traces. Keep screenshots referenced by findings.

---

## 10. Final report (orchestrator → `docs/audit/AUDIT_REPORT_<date>.md`)

1. **Verdict, in one paragraph:** could this go to real people tomorrow? If not, the exact blockers.
2. **Scorecard:** for each promise R1–R15, ✅ held / ⚠️ issues / ❌ broken, with links to findings.
3. **Confirmed P0s**, then P1s: steps, evidence, and the suspected area of code.
4. **P2/P3, grouped by screen.**
5. **Persona journeys:** one line per persona saying how their story went, in their voice. Examples: "Priya: got home; sister saw the live link die on arrival ✅" or "Sunita: report sent twice after reconnecting ❌".
6. **Not tested, and why.** Live providers, real devices, real WhatsApp, real push on iOS, etc.
7. **Top 10 fixes in order**, each with effort (S/M/L) and the promise it restores.
8. **Numbers:** agents run, flows walked, findings by severity, verified vs not reproduced, run time.

Keep the report plain. No hype, no verdict words about the product itself. Evidence first.

---

## 11. Hard rules (all agents)

- **No real messages to real people.** All email goes to Mailpit; WhatsApp stops at the opened link; push stays off.
- **No writes to the developer's database (`mira`)**, the dev server (:3210), git, or the repo's source.
- **Only touch data you created** (your agent prefix).
- **No real credentials typed anywhere.** Test names and `@example.test` emails only.
- **Report honestly.** "Not tested" is a valid result. Never mark a promise as held because you didn't see it break.
- If something looks like a real security hole, stop exploiting it once it is proven. Record the minimal reproduction and move on.
