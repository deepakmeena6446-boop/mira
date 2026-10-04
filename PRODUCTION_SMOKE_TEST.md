# MIRA — production smoke test (~15 minutes)

Run on staging before production is approved, then after every production deploy, using **two real phones**: an iPhone Safari *traveller* (guest first, then signed in with Google) and an Android or any-browser *follower* (never signed in). Record the date, exact commit, phones and every result in `docs/deploy/STAGING_RESULT_<date>.md` or `docs/deploy/PRODUCTION_RESULT_<date>.md`. Any ✗ means stop and roll back or fix before inviting anyone. Missing evidence remains pending.

Never paste live links or screenshots with coordinates into shared channels.

## Before you start (1 min)

- [ ] `curl -s https://<domain>/api/health/ready` → `{"status":"ready"}`.
- [ ] The follower phone has WhatsApp (and, if email is configured, an inbox you can see).

## 1. Landing (1 min) — traveller phone, private window

- [ ] `/` opens Home, signed out. The first open shows **"Let Mira use your location?"**, with **Allow location** and **Not now** in Home's flow.
- [ ] Nothing on screen says a place or route is safe, and there's no score.
- [ ] **Allow location** → allow the phone permission → Home stays usable while signed out, and Emergency shows the reviewed local number (India: **112**).
- [ ] With location on, Report starts at **"Around where you are now"**. With location off, it asks **"Where did it happen?"** and allows a named place. A denied permission is explained; no location is invented.
- [ ] Optional compatibility check: `/welcome` shows **"Your plans. In motion."** and **Start my plan** returns to Home.

## 2. Country context (1 min)

- [ ] The greeting shows your area name. The Emergency pill shows the reviewed local number (India: **112**, UK: **999**, US: **911**), or "Emergency options" with an explanation where the country isn't reviewed.
- [ ] Tap it: the number opens the phone's dialler (don't place the call); service-specific numbers are labelled.

## 3. Route context (2 min) — signed out

- [ ] Search a place 1–2 km away and pick it. The sheet shows walking time and distance.
- [ ] **Above Start with MIRA:** a Lighting line with its "not known" share, a lighting bar, a Help line, and "Sources and freshness" that names sources and their age.
- [ ] Switch to **Ride / car**: lighting says it's shown for walks and why; Help Points are "near where you arrive" (or "couldn't check", never a false "none").
- [ ] "Safety updates near there" shows sourced items with publisher and age, "no recent updates found", or "couldn't check" — never a rating.

## 4. Help Point (1 min)

- [ ] "Help Points near me" lists places with a class, walking minutes and hours as listed ("hours not known" otherwise). Tapping one routes to it.

## 5. Sign in (1 min)

- [ ] Tap **Sign in** → Continue with Google → back on Home signed in with your first name. No first-name-only option is offered.

## 6. Circle (2 min)

- [ ] Me → Your circle → **+ Add** → name + the follower's WhatsApp number typed the local way (e.g. `98765 43210` in India) → **Save**. The list shows "WhatsApp +91 •••• ••3210" and a WhatsApp badge.
- [ ] Optional (email configured): add an email too → the invite arrives (check spam) → accept on the follower phone → the contact shows "Trusted".

## 7. Start with MIRA + share link (2 min)

- [ ] Pick the destination again → the line under Start says you'll send your contact the live link on WhatsApp in one tap (and, with email, that MIRA *attempts* an email that can fail).
- [ ] **Start with MIRA** → journey screen: ETA "with time to spare" and **Send to <name>**. Tap it → WhatsApp opens with "I'm walking to … Follow along live on MIRA until I arrive: <link>" → press Send. Back in MIRA it says "Opened WhatsApp for <name> ✓" (never "sent").
- [ ] With email configured: the contact's inbox also receives the live link. **Send my live link** still opens the share sheet.

## 8. Active trip — follower view (2 min)

- [ ] Follower phone, **not signed in**, opens the link from WhatsApp: first name, destination, "Expected by … <time zone>", "updated just now", one dot. No history trail.
- [ ] Walk 50–100 m: the dot moves within ~30 s.
- [ ] A saved Home destination is shown only roughly (~100 m), without exposing the saved doorstep.

## 9. Arrival (1 min)

- [ ] Walk to (or near) the destination and wait ~1 minute, or tap **I'm here**.
- [ ] Traveller: "You made it 🎉"; after-arrival shows one question or "Nothing needed from you this time".
- [ ] Follower (refresh): "<name> arrived 🎉" — no map, no location. Within ~30 minutes the link says it has ended.

## 10. I feel unsafe (1 min) — during a second short trip, or from Home

- [ ] Opens instantly, even in airplane mode after the page has loaded: the best Help Point, the reviewed emergency number, helplines where reviewed, "your location in words" with a Copy button.
- [ ] **Tell my people now**: shows **Send to <name> on WhatsApp** with a "Can you check on me?" message (and, with email, who was emailed). Send it; the follower receives it.
- [ ] End the trip.
- [ ] In Mira, typing **"help me pls"** or **"bachaoo"** opens the **I feel unsafe** sheet immediately.

## 11. Emergency (30 s)

- [ ] The Emergency pill on Home and on the journey screen opens the dialler with the same reviewed number. MIRA says it doesn't call anyone for you.

## 12. Mira (1 min)

- [ ] Before signing in, ask an everyday question: Mira gives a live Claude reply. Guests have a 25-reply daily limit per network and contribute to the shared spend ceiling.
- [ ] "What's the emergency number here?" → the reviewed number (or "not known" for an unreviewed country).
- [ ] "Take me home" (with Home saved) → a trip card; nothing starts until you tap it.
- [ ] "Is this area safe?" → no verdict; points to what's known (lighting, Help Points, updates).
- [ ] If the admin readiness view shows `mira: "claude"`, replies are live; with the key removed on staging, the scripted Mira still answers these.

## 13. Contribute (30 s)

- [ ] Contribute shows the MIRA Check (if one was prepared after a night walk) or explains when one may appear. Your impact counts only confirmed answers; no points or streaks.

## 14. Missed check-in (optional, 25 min — run on staging if time is short)

- [ ] Email configured only: start a ride with a 10-minute ETA and don't arrive. ~10 minutes after the ETA (the grace period, plus up to 20 s for the worker) the traveller sees "Are you okay?" and the contact receives **exactly one** "hasn't checked in" email with the live link.
- [ ] Whether email is configured or not, open the follower link when the trip is overdue: it clearly says the traveller didn't check in. After the journey ends and the link expires, it shows **"This live link has stopped working"**, rather than a generic 404.

## 15. Sign out (30 s)

- [ ] Me → Sign out → Home signed out. Signing in again with Google returns the same account, saved places and Circle.
- [ ] `railway logs --service web` shows no `request.failed` or `config.warning` you didn't expect; logs contain no coordinates, emails or tokens.

## 16. Offline call buttons (1 min)

- [ ] Visit online with a reviewed country selected, then turn on airplane mode and tap a tab. The offline page appears with call buttons for the remembered country. Tapping a call button opens the dialler; do not place a real emergency call.
- [ ] `/offline.js` is served successfully; a stale or incomplete offline cache must not remove the call buttons.
