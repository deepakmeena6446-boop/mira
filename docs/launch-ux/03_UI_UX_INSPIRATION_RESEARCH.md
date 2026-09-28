# 03 — UI/UX Inspiration Research

**Date:** 2026-09-28. **Scope:** products, open-source systems, motion and visual systems, and real user feedback. Research only: **nothing was installed**.

**How to read this document:**
- **Part 0**, synthesis: what Mira takes, what it rejects, and how the research was reconciled with Mira's existing principles. **Read this first.**
- **Part 1**, consumer, safety, maps/location and community products (25 references). Each has a source URL, the screen studied, the principle, relevance, what not to copy, and the Mira interpretation.
- **Part 2**, AI-first products.
- **Part 3**, open-source projects, design systems, motion and visual systems, including a dependency verdict for each candidate.
- **Part 4**, real user feedback, strictly tagged `USER_SIGNAL` (what people said or experienced, with a source) versus `DESIGN_INTERPRETATION` (what it implies for Mira).

**Source hygiene:**
- URLs were opened ("fetched") or found through search snippets ("*search*"). Blocked pages are named in each part.
- Paraphrase is the rule. There is at most one short quote per source.

---

## Part 0 — Synthesis

### 0.1 Principles Mira adopts

Mira's own words follow each principle, and the products it was learned from are in brackets.

1. **Guardian, not watcher.** Share events, and share live location only for the length of a journey. Every share has a visible end and a visible audience ("who can see me, until when"). *(Apple Check In, Find My "Notifications About You", Life360 Bubbles)*
2. **Arrival is the normal ending.** Design success as carefully as alarm: automatic, warm and brief. *(Check In, Live Activities)*
3. **One live object, three densities.** A journey is one capsule: compact on other screens, expanded on the journey screen, and "attention" only when something needs the user. *(Dynamic Island / Live Activities; reinterpreted, not imitated)*
4. **Map first, one detented sheet.** The map never disappears. The sheet is non-modal. *(Apple Maps, HIG sheets, Ionic `backdropBreakpoint`)*
5. **Conclusion, then evidence.** A decision-shaped line ("4 min longer, mostly mapped as lit") with the sources one tap away. *(Google Immersive Navigation trade-offs; Safetipin condition parameters)*
6. **Conditions, not danger.** Show observable facts per stretch (lit / not mapped, Help Points, open now). Never a grade. *(Safetipin)*
7. **Design the recipient's view as its own product.** The contact who opens a WhatsApp link sees name, destination, ETA, freshness, and what to do if worried. *(Uber Share Trip recipient redesign)*
8. **Corroborate with one tap, in context.** One question, about something the person passed, at a calm moment. *(Waze "Still there / Not there", StreetComplete quest guidelines)*
9. **Truth decays.** Every signal has a validity window, and freshness is shown. *(Waze, Arc auto-archive; already Mira [P11])*
10. **Reputation rewards being right, privately.** *(Community Notes "bridging" impact vs Google Local Guides' volume points)*
11. **Put friction where harm enters.** Structured, behaviour-first, person-free reporting. *(Nextdoor's anti-profiling flow: about 75% fewer profiling posts)*
12. **Give value before asking.** Ask for permission in context. *(Headspace onboarding, Notion)*
13. **Calm through restraint and speed.** Neutral chrome, colour that means something, optimistic feedback, nothing on screen that isn't needed now. *(Linear 2024 UI refresh)*
14. **Close the loop.** Tell contributors what happened, honestly. *(FixMyStreet: a fixed first report was associated with a 54% higher chance of reporting again)*
15. **Motion carries state, under 300 ms for UI.** Ease-out for enter, transform and opacity only, never start from `scale(0)`, and reduced motion is a first-class path. *(Emil Kowalski, Impeccable, Material 3, Apple springs)*

### 0.2 Patterns Mira explicitly rejects
1. Incident push alerts and crime feeds (Citizen).
2. Safety scores, grades, red zones and heatmaps.
3. "Suspicious person/activity" reports and any person-description field (Nextdoor pre-2016, Citizen's 2021 misidentification).
4. Comment threads, likes or replies on reports.
5. Points, levels, badges, streaks, leaderboards and public contributor ranks (Local Guides, Strava crowns).
6. Always-on tracking, location history and driving scores (Life360).
7. Monetising fear (Citizen "Protect").
8. Police, siren and SOS aesthetics, and direct police dispatch as the default (Noonlight, bSafe).
9. An SOS-heavy home screen, or a giant red panic button as the hero.
10. Auto-recording or streaming audio and video (bSafe).
11. Dashboards, tile grids, promo carousels and "For you" rails (Revolut density, Google feeds).
12. Chatbot-first UI: a chat window over the map, or un-dismissable AI entry points (the Meta AI in WhatsApp backlash).
13. Reports that never expire.
14. Mascots, 3D playful icons and confetti in safety moments.
15. Faux-native iOS chrome in a PWA (a fake Dynamic Island).
16. The "AI slop" look: purple gradients, glass on everything, glowing orbs, emoji as icons, identical rounded cards, eyebrow all-caps labels. **Mira's current skin sits squarely in this cluster** (01 §3).

### 0.3 Reconciliation: research ideas versus Mira's existing principles

Several good-sounding research interpretations **conflict with `PRINCIPLES.md` or owner decisions**. Execution agents MUST NOT implement the left-hand column.

| Research suggestion (Parts 1 and 4) | Status for Mira | Why |
|---|---|---|
| "Trusted reporters' reports can shape routes immediately" (§24) | **REJECTED** | Local Steward / Mira Scout "grants no power over truth" (`reputation.ts`); every voice needs corroboration [P4, P10]. |
| Show individual reports as map pins with "confirmed by 3 people, 2h ago" (§21) | **REJECTED for incidents; POST-LAUNCH research for conditions** | No single person's input is ever shown [P4]. Incidents surface only as aggregate notes [P12]. Condition claims (lighting, place status) already surface as *corroborated facts*, not reports. |
| One-tap "Still out? [Still out] [Fixed]" prompts to passers-by (§21) | **POST-LAUNCH, `REQUIRES_OWNER_APPROVAL`** | Needs new server capability (location-triggered questions outside a journey). Today's equivalent is MIRA Checks after a journey. |
| Mira screens report free text with an AI rewrite suggestion (§25, Part 4 §6) | **REJECTED for launch** | AI must not sit in the evidence path [P10]. The existing deterministic PII detector stays. |
| "Heightened watch" with shorter check-in intervals after I feel unsafe (§12) | **POST-LAUNCH, `REQUIRES_OWNER_APPROVAL`** | Changes escalation behaviour (C-6.5) and the worker. |
| Optional "reason" chip on the WhatsApp share ("Walking home late") (§11) | **POST-LAUNCH candidate** | Changes the shared-view payload. Harmless, but it's a data change. |
| Discreet mode: neutral icon, quick-exit (Part 4 §5) | **POST-LAUNCH, `REQUIRES_OWNER_APPROVAL`** | Manifest and brand change. A strong candidate. |
| Offer aggregated condition data to city authorities (§15) | **OUT OF SCOPE** | Governance and moderation decision. |
| Private "you keep your streets honest" recognition (§8) | **ADOPTED** as Mira Scout (02 §7) | Uses the existing Local Steward engine. |
| Arrival events to contacts by default (§18) | **ALREADY TRUE** (live link says "arrived", then dies) | |
| Per-type report expiry (§21) | **ALREADY TRUE** (reports ≤30 d; notes 35 d; checks per-claim windows; lighting 90 d) | Just show freshness better. |
| Map clustering / `symbol-sort-key` (Part 3 §7) | **ADOPT when pins exceed 6** | The current max is 20 nearby pins on Home. The launch spec caps visible pins instead (06 §3.2). |
| Google basemap `styles` to hide business POIs (Part 3 §7) | **POST-LAUNCH, owner OK** | Touches the server tile-session provider (`src/server/providers/geo/tiles.ts`). |
| `map.easeTo({padding})` per sheet snap (Part 3 follow-up #1) | **MODIFIED** | Repo gotcha: `easeTo({padding})` persists and `fitBounds({padding})` adds to it. Use `map.setPadding()` once per snap change, and never pass padding per call. |

---

## Part 2 — AI-first products

*(Part 1 follows this part in the file order below, for reading convenience.)*

### 2.1 Google Maps "Ask Maps" (2026) — the AI answers in the map
- **Source:** https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/ (fetched; details in Part 1 §19).
- **Studied:** conversational questions answered with a *custom map plus actionable places*, handing off to directions and save.
- **Principle:** An AI answer's medium should be where the user acts: the map and an action, not a transcript.
- **Relevance:** **High.** It is the precedent for "not a chatbot wrapped around a map".
- **Don't copy:** opaque personalisation, sponsored places.
- **Mira interpretation:**
  - Keep chat. Mira cards already open places on Home (`MiraChat.tsx` `goTo`).
  - At launch, strengthen this: a places or help-points card opens the place on the map with its route sheet (already true) and shows "From Mira" in the route sheet header. That is presentation only.
  - A map-overlay answer mode is post-launch.

### 2.2 Meta AI in WhatsApp — the un-removable AI entry point
- **Source:** https://www.techradar.com/computing/websites-apps/whatsapp-users-fume-over-new-meta-ai-button-that-you-cant-remove-heres-what-it-does (Part 4 §15).
- **Principle (negative):** Forcing an AI surface onto people who came for something else erodes trust.
- **Mira interpretation:**
  - Mira's chat is a tab the user chooses to open. Home never auto-opens chat or shows a floating AI button.
  - The Mira line is deterministic text, not "AI" branding.
  - No sparkle icon on non-AI features.

### 2.3 Linear — AI and speed without chrome
- **Source:** https://linear.app/now/how-we-redesigned-the-linear-ui (fetched; Part 1 §3).
- **Principle:** Intelligence reads as calm when it's fast and quiet. Optimistic UI and no spinner theatre.
- **Mira interpretation:** The Mira Pulse "thinking" state appears only while real work is pending (route lookup, a Mira stream). The typing dots reflect the real stream, as today.

### 2.4 Apple Intelligence / Siri "glow" — the counter-example
- **Principle (negative):** An edge-glow or rainbow shimmer signals "AI is here" but carries no information. The thesis explicitly rejects glowing blobs and rainbow effects.
- **Mira interpretation:** The Mira Pulse (04 §12, 05 §3) carries *state* (observing, thinking, noticed, attention, with you). It never exists only to say "AI".

### 2.5 Gartner / Pew signals on company chatbots
- **Sources:** https://www.cmswire.com/customer-experience/gartner-genai-findings-suggest-customers-dont-care-about-your-ai/ · https://www.pewresearch.org/science/2025/09/17/ai-in-americans-lives-awareness-experiences-and-attitudes/ (Part 4 §15).
- **USER_SIGNAL:**
  - Customers are about three times more likely to use third-party GenAI than a company's own chatbot.
  - 50% of US adults are more concerned than excited about AI, and most want more control.
- **DESIGN_INTERPRETATION:** Mira's value must not depend on people choosing to chat. The companion earns its place through context (the Mira line, cards). Chat stays optional.

---
### Section map (required categories → where they are)
| Category | Location |
|---|---|
| Consumer products | Part 1 §A (Apple Live Activities, Airbnb, Linear, Arc, Notion, Revolut, Headspace, Strava, Uber) |
| Safety products | Part 1 §B (Apple Check In, Google Personal Safety, Noonlight, Citizen, Life360, Safetipin, bSafe) |
| Maps / location products | Part 1 §C (Apple Maps, Find My, Google Maps, Local Guides, Waze, StreetComplete) and Part 3 §7 (map UX, open-source map apps) |
| AI-first products | Part 2 (above) |
| Community / crowdsourcing systems | Part 1 §D (Community Notes, Stack Overflow/Wikipedia, Nextdoor), Part 1 §20–22, Part 4 §7–10 |
| Open-source projects | Part 3 §1–2, §6–8 (Anthropic frontend-design, Impeccable, Base UI, React Aria, Organic Maps, CoMaps, StreetComplete, Headway) |
| Motion / microinteraction inspiration | Part 3 §3, §4, §8 (Motion vs modern CSS, Vaul/Sonner/Emil Kowalski, Material 3 and Apple springs) |
| Visual systems | Part 3 §1, §2, §5, §9 (anti-slop guidance, Impeccable quality floor, Magic UI/Aceternity verdicts, typography) |
| Principles to adopt / reject | Part 0 above (the canonical lists), plus Part 1's closing lists |

---

# Part 1 — Consumer, safety, maps and community products


### A. Consumer / AI / craft references

#### 1. Apple: Live Activities & Dynamic Island
- **Source URLs:** https://developer.apple.com/design/human-interface-guidelines/live-activities (*search* snippets; page is JS-rendered) · https://developer.apple.com/videos/play/wwdc2023/10194/ ("Design dynamic Live Activities", fetched)
- **Screen/interaction:** A bounded, time-limited task (a delivery, a ride, a game) is shown in three sizes: **compact** (leading and trailing of the camera), **minimal** (when several activities are running at once) and **expanded** (long-press). The same activity also appears on the Lock Screen.
- **Principle learned:** Show state at a glance, sized to how much attention it deserves. Alert only on a change that matters, and put that change first. Clear the view shortly after the task ends.
- **Why it works:** The WWDC talk says to alert "when there's an update that requires the user's attention" and to "emphasize the information that caused the alert". It says to remove the activity "after a short duration… it can be annoying if it sticks around". The HIG treats the Island as a "canvas of foreground view elements" without a background. Because it leaves out anything that isn't needed, a person can check it in a peripheral glance.
- **Relevance to Mira:** **Yes, very high.** An active journey is exactly this kind of bounded, live task.
- **What NOT to copy:** Mira is a PWA and has no Dynamic Island, so don't fake one with a pill that looks like an iOS system element. Don't add alert updates for minor progress.
- **Mira interpretation:** A **journey capsule** gets three densities. Collapsed shows the destination, ETA and a small "Priya can see you" dot. Expanded adds the route, the lighting note and "I'm here". Arrival shows a brief "Arrived, Priya was told" and then dismisses itself. Only three things raise its prominence: a stall, going off-route, or a timer ending. Where the platform allows it, mirror the capsule into a persistent notification.

#### 2. Airbnb: search → listing → booking, motion
- **Source URLs:** https://design.google/library/airbnb-invites-you-in (fetched) · https://medium.com/airbnb-engineering/motion-engineering-at-scale-5ffabfc878 (*search*) · https://medium.com/design-bootcamp/airbnb-summer-2025-update-heres-what-s-new-and-why-it-matters-0ced2338b921 (*search*)
- **Screen/interaction:** Shared-element transitions carry a tapped listing photo into the detail view. The primary booking action sits on a raised button. The 2025 redesign added the animated 3D "Lava" icons.
- **Principle learned:** Motion should show where something went. It is there for continuity, not decoration. The one primary action is elevated so it is always obvious.
- **Why it works:** Google Design describes the app's aim to feel "welcoming and helpful as a gracious host". Photography leads, which keeps the UI "bold and uncluttered". Shared-element transitions keep people oriented when the screen changes.
- **Relevance to Mira:** **Partial.** The motion continuity and the gracious-host tone carry over. Photo-led browsing does not.
- **What NOT to copy:** The playful 3D icon mascots, which would read as frivolous at night on a dark street. Don't use booking-funnel urgency cues like "Only 1 left".
- **Mira interpretation:** When you tap "Where are you going?", the search field should morph into the destination card, and the chosen route should grow into the journey capsule. Every screen gets exactly one primary action ("Start journey", "I'm here"). Mira's voice is a host's, not a guard's.

#### 3. Linear: speed, calm chrome
- **Source URLs:** https://linear.app/now/how-we-redesigned-the-linear-ui (fetched) · https://linear.app/method (fetched; index only)
- **Screen/interaction:** The 2024 UI refresh reduced chrome color and dimmed navigation so content leads. The product is known for sub-100ms interactions, optimistic updates and a global command menu.
- **Principle learned:** Calm comes from restraint (less chrome, neutral color, careful alignment) and from speed. An app that never makes you wait feels trustworthy.
- **Why it works:** The Linear team set out to "reduce visual noise", limit "how much chrome (blue…) was used", and reach "a more neutral and timeless appearance". Precise alignment is something "you'll feel after a few minutes".
- **Relevance to Mira:** **Yes**, for the visual system and perceived performance. Keyboard shortcuts don't apply to a mobile PWA.
- **What NOT to copy:** Density and power-user shortcuts. Mira users are walking and often using one hand.
- **Mira interpretation:** Keep the map neutral and let color mean something: one accent for "you / your journey" and one for "needs attention". Share, report and "I'm here" should respond optimistically, showing a sent state immediately and reconciling in the background. Make Mira's input a single entry point that also accepts plain intents such as "home, lit route".

#### 4. Arc browser
- **Source URLs:** https://blakecrosley.com/guides/design/arc (*search*) · https://refine.dev/blog/arc-browser/ (*search*) · https://medium.com/design-bootcamp/arc-browser-rethinking-the-web-through-a-designers-lens-f3922ef2133e (*search*)
- **Screen/interaction:** Vertical sidebar, **Spaces** (separate contexts for work and personal use), a Command Bar, and auto-archiving of stale tabs.
- **Principle learned:** Reduce the mental load of too many open things by separating contexts and letting stale items expire on their own.
- **Why it works:** It treats "tab chaos" as the core problem and expires what you haven't touched, so the workspace stays calm without manual cleanup.
- **Relevance to Mira:** **Partial**, as a concept rather than UI.
- **What NOT to copy:** Custom theming and gradient personalization. Arc's shutdown and move to Dia is a warning against novelty-driven UI that is hard to learn.
- **Mira interpretation:** Community reports should **auto-expire**, with nothing to clean up. Mira has natural modes: at rest (explore), on a journey, and needing help. Each mode's surface should show only what that context needs.

#### 5. Notion
- **Source URLs:** https://www.notion.com/help/guides/using-slash-commands (*search*) · https://goodux.appcues.com/blog/notions-lightweight-onboarding (*search*) · https://blakecrosley.com/guides/design/notion (*search*)
- **Screen/interaction:** The "/" command reveals block types in context. Onboarding is a checklist inside a real, working page.
- **Principle learned:** Progressive disclosure. Keep the surface simple by default and show power features where and when you need them. Teach inside the real product rather than in a separate tour.
- **Why it works:** Beginners see a blank calm page while experts find depth, and the onboarding content is itself usable.
- **Relevance to Mira:** **Partial.**
- **What NOT to copy:** The blank canvas. A safety app must never open on emptiness or make you build your own setup.
- **Mira interpretation:** Onboarding happens during the first real journey: "Want Priya to see this walk? Add her once." Advanced options (Check-in timer, full vs limited data, route preferences) live behind a "More options" disclosure on the journey card.

#### 6. Revolut: home & contextual widgets
- **Source URLs:** https://www.revolut.com/news/revolut_launches_revolut_10_as_it_targets_primary_accounts_and_passes_35m_customers_worldwide/ (*search*; 403 on fetch) · https://mobbin.com/explore/screens/910f74d0-6f70-431a-975f-e84bd07d49af (*search*)
- **Screen/interaction:** The Revolut 10 home screen has user-chosen widgets (favorite recipients, cards) for single-tap actions, with the most important number up top.
- **Principle learned:** The home screen shows one current truth plus shortcuts to the user's own frequent actions.
- **Why it works:** Personal shortcuts ("send to Mum") beat generic feature grids. The single top number anchors the screen.
- **Relevance to Mira:** **Partial.** The pattern of frequent contacts and frequent destinations fits well.
- **What NOT to copy:** Promo carousels, cross-sell cards, and a tile for every feature. Mira's home is the map, not a card feed. Revolut's density is exactly the "dashboard" Mira must avoid.
- **Mira interpretation:** Under "Where are you going?", show two or three **personal chips** such as "Home · usual route" and "Priya's place". Allow at most **one** contextual card, and only when it is earned, for example "Your usual route home has 2 unlit stretches tonight". No feed.

#### 7. Headspace: calm tone & onboarding
- **Source URLs:** https://growth.design/case-studies/headspace-user-onboarding (fetched) · https://raw.studio/blog/how-headspace-designs-for-mindfulness/ (*search*) · https://blakecrosley.com/guides/design/headspace (*search*)
- **Screen/interaction:** The app opens with a guided "breathe in, breathe out" moment and then asks about goals. Illustration rules call for rounded forms and warm neutrals, with no pure black or white.
- **Principle learned:** Give value before you ask for anything. Calm is a whole-system property (color, shape, pacing, copy), not a single screen.
- **Why it works:** Growth.Design's lesson is "make sure you've given value before" asking for permissions. The case study also shows that a paywall or permission request placed before any value causes drop-off.
- **Relevance to Mira:** **Yes**, for the permission sequence and tone.
- **What NOT to copy:** Cartoon mascots and saturated orange. Mira has to feel credible in a real risk moment, not like a wellness product.
- **Mira interpretation:** Request location only when the user taps "Where are you going?", and contacts only when they choose to share. Use warm near-black at night rather than #000. Copy should be short and steady ("You're on your way. Priya can see you."). No streaks and no gamified calm.

#### 8. Strava: recording + Local Legends
- **Source URLs:** https://www.dcrainmaker.com/2020/06/strava-legends-feature.html (fetched) · https://support.strava.com/hc/en-us/articles/360043099552-Local-Legends (*search*) · https://medium.com/strava-engineering/building-local-legends-290879265c83 (*search*; 403)
- **Screen/interaction:** The segment page shows a laurel "Local Legend" for whoever completed the segment **most often in a rolling 90 days, regardless of pace**. It sits above the KOM (fastest time) leaderboard.
- **Principle learned:** Recognition based on consistency and presence gives ordinary people a way to be recognized. A rolling window keeps status earned rather than permanent.
- **Why it works:** Most people will never be fastest (KOM), so rewarding "iterative participation" makes the space feel like it belongs to them.
- **Relevance to Mira:** **Partial, but important.** The "local steward" idea helps. Recognition by count alone does not, because Mira needs **accuracy**, not volume.
- **What NOT to copy:** Leaderboards, crowns, competition, or public display of where someone walks often. Publishing routines is a stalking vector (Strava's heatmap leaks are the canonical example).
- **Mira interpretation:** A **private** "You keep your streets honest" recognition, based on confirmed-accurate reports and confirmations on streets you regularly use, over a rolling window. Show it only to you. Never show it on a public map, and never tie it to a route.

#### 9. Uber: trip status sheet, Safety Toolkit, Share Trip
- **Source URLs:** https://www.uber.com/us/en/newsroom/ubers-new-safety-toolkit/ (fetched) · https://www.chloefan.com/uber-trip-tracker (Share Trip recipient case study, fetched) · https://www.uber.com/us/en/ride/safety/ (*search*)
- **Screen/interaction:** A persistent **shield** icon on the trip sheet opens "large tiles" (emergency, share trip, report, Live Help). The Share Trip recipient page leads with **route and ETA**, and puts driver details **last** "for emergencies". RideCheck proactively asks "Are you OK?" when a trip goes off-course or stops unusually long.
- **Principle learned:** Keep safety always present but quiet (a small icon on the main status surface). Design the recipient's view as seriously as the sender's, with ETA first. Check in proactively when something is anomalous, not continuously.
- **Why it works:** Share Trip is Uber's "most-used safety feature". Recipients mainly want "is she on track, when will she arrive", not surveillance detail. The Share Trip redesign chose route and ETA over exact location, balancing "transparency with privacy".
- **Relevance to Mira:** **Yes, very high.** It maps directly onto WhatsApp live-link recipients and the "I feel unsafe" sheet.
- **What NOT to copy:** The ADT/911 private-security framing, which reads as police-like. Don't use a tile grid as Mira's main safety UI.
- **Mira interpretation:** The **recipient page** (opened from WhatsApp) shows the name, destination, ETA and "on track / arrived", plus a map. Last-known detail and battery appear only on escalation. The journey capsule carries a quiet help glyph. A Mira check-in ("You've stopped for 6 min, all good?") appears **only** on stall or deviation.

---

### B. Safety products

#### 10. Apple Check In (Messages)
- **Source URLs:** https://support.apple.com/guide/personal-safety/use-check-in-for-messages-ips56b5bc469/web (fetched) · https://support.apple.com/guide/iphone/use-check-in-iphc143bb7e9/ios (*search*)
- **Screen/interaction:** There are two modes, "When I arrive" (destination, travel mode, arrival radius, extra time) and "After a timer". If progress stalls, **you** get a prompt first and have **15 minutes** to respond before your contact is alerted. The contact learns the destination and ETA at the start, but only "receives a link to view the information" **if Check In doesn't complete**. Data sharing is Limited (location, battery, signal) or Full (adds the route and the last unlock location). On arrival it ends automatically and tells the contact.
- **Principle learned:** **Escalate to your circle only after asking you first.** Share the minimum by default and more only on failure. Treat automatic success ("arrived") as the normal outcome.
- **Why it works:** It removes the social cost of being tracked. The contact gets reassurance ("she arrived"), not a live feed. The self-prompt prevents false alarms. End-to-end encryption and the Limited/Full choice make the privacy trade-off explicit.
- **Relevance to Mira:** **Yes. This is the closest single reference to "Mira has me".**
- **What NOT to copy:** Being buried inside a messaging app, and Apple-only reach. Mira goes over WhatsApp and has to work on any phone.
- **Mira interpretation:** A **journey** is Check In by default. The contact gets "Deepa is walking home, ETA 22:40" plus a link. Mira asks the user before telling anyone ("You've paused a while, still OK? [I'm fine] [Add 10 min]"). The WhatsApp message on arrival is automatic. Settings copy states plainly what is shared normally versus if you don't answer.

#### 11. Google Personal Safety (Safety check, Emergency sharing, Crisis alerts)
- **Source URLs:** https://support.google.com/android/answer/9319337?hl=en (fetched) · https://play.google.com/store/apps/details?id=com.google.android.apps.safetyhub (*search*) · https://www.androidpolice.com/pixel-personal-safety-app-explainer/ (*search*)
- **Screen/interaction:** **Safety check** takes a *reason* (for example "walking alone", "first date"), a *duration* of up to 24h, and contacts. Contacts receive a text with the name, duration and reason. At expiry there is a **60-second** alert with "I'm OK / Start sharing now / Call 911". Emergency sharing sends a Maps live link plus battery and **auto-ends after 24h**. Crisis alerts cover natural disasters and public emergencies, and are on by default.
- **Principle learned:** Giving a **reason** makes the ask human and legible to contacts. Every sharing state needs a hard end. Three clear choices at the decision moment. Crisis alerts are limited to *official, large-scale* events.
- **Why it works:** The reason stops contacts from panicking. Bounded sharing removes the fear of forever-tracking. The three buttons match the three real intents.
- **Relevance to Mira:** **Yes.**
- **What NOT to copy:** The 60-second window is right for a phone alarm but harsh for a walk. Apple's 15 minutes is kinder, so choose the timeout per context. Don't copy the system-settings look.
- **Mira interpretation:** Offer an optional reason chip when starting a journey ("Walking home late", "Meeting someone new"), which appears in the WhatsApp message. Every live share shows its end time. The prompt at expiry is **[I'm OK] [Share now] [Call for help]**. The "Safety updates" layer stays official-source and large-scale only (for example GDELT or government alerts), never raw crime chatter.

#### 12. Noonlight: hold-to-be-safe button
- **Source URLs:** https://help.noonlight.com/en/articles/2114600-how-does-the-button-work (fetched) · https://www.whistleout.com/CellPhones/Apps/noonlight-panic-button-for-solo-travel-safety (*search*)
- **Screen/interaction:** You **hold** the button while uneasy and release it when safe. Releasing without entering a 4-digit PIN triggers dispatch contact by text, then a call, then help. The PIN means "I'm safe".
- **Principle learned:** An uncertain-threat mode: you stay armed without committing to a call. The user's inaction is the escalation signal, but it goes through a human check (text, then call) before dispatch.
- **Why it works:** It fits the most common real state, "I'm not sure", which binary SOS buttons ignore.
- **Relevance to Mira:** **Partial.** The idea of an "uneasy mode" matters a lot. The mechanics (a hold-down finger and a paid dispatch centre) don't suit Mira.
- **What NOT to copy:** Direct police dispatch, the PIN-under-stress burden, and a finger-on-glass requirement while walking.
- **Mira interpretation:** "I feel unsafe" puts Mira into a **heightened watch** (shorter check-in intervals, nearest open Help Point surfaced, one-tap "Call Priya"), with no commitment to escalate. Leaving that state is a calm "I'm OK now", not a PIN.

#### 13. Citizen (anti-reference)
- **Source URLs:** https://newrepublic.com/article/162747/citizen-app-crime-stats-private-security (fetched) · https://www.vice.com/en/article/inside-crime-app-citizen-vigilante/ (*search*) · https://www.motherjones.com/politics/2019/08/it-creates-a-culture-of-fear-how-crime-tracking-apps-incite-unnecessary-panic/ (*search*; fetch blocked)
- **Screen/interaction:** A push-alert feed of transcribed 911/police-scanner incidents, with livestreams and comments, sold alongside the paid "Protect" add-on.
- **Principle learned:** Fear drives engagement and revenue, and destroys trust. Unverified alerts pushed at volume raise anxiety without making anyone safer. Critics called Citizen "an anxiety sweatshop" and "a platform for rumors" (New Republic). It started life as "Vigilante" and was pulled from the App Store for promoting vigilantism.
- **Why it "works":** It works for engagement, not for users. Every alert is an intermittent, variable fear reward.
- **Relevance to Mira:** **No. This is what Mira must not become.**
- **What NOT to copy:** Incident push alerts, a red siren palette, livestreams, comment threads under incidents, and upselling at moments of fear.
- **Mira interpretation:** Mira speaks about conditions ("this stretch is unlit") and routes ("this way is brighter"), never about incidents as spectacle. It pushes nothing about incidents that don't affect your current journey. No safety feature is ever behind a paywall.

#### 14. Life360 (anti-reference, partial)
- **Source URLs:** https://wesleyanargus.com/2022/10/06/life360-lack-of-privacy-and-excessive-location-sharing/ (*search*) · https://techcrunch.com/2020/10/12/family-tracking-app-life360-launches-bubbles-a-location-sharing-feature-inspired-by-teens-on-tiktok (*search*) · https://www.techjuice.pk/life360-child-surveillance-debate/ (*search*)
- **Screen/interaction:** An always-on family map, with place arrival and departure alerts, driving reports, and **Bubbles** (added after teen backlash). A Bubble shares only a fuzzy area for a set time and alerts guardians only on crash or SOS.
- **Principle learned:** Always-on tracking erodes trust. Teens force-stop the app or leave phones behind. The fix Life360 shipped (Bubbles) is **coarse and time-limited sharing**, which is exactly the right direction. Selling precise location data (reported in 2021) destroyed credibility.
- **Why it matters:** It shows that the **sharer's** dignity decides adoption.
- **Relevance to Mira:** **Partial.** It is a warning, plus the Bubbles pattern.
- **What NOT to copy:** Persistent location, a history timeline, driving scores, and any data-broker model.
- **Mira interpretation:** Sharing is **per journey** and ends on arrival. There is no background location history. A "Nearby, not exact" option exists. The user can always see who can see them right now.

#### 15. Safetipin / My Safetipin
- **Source URLs:** https://safetipin.com/our-apps/ (fetched) · https://safetipin.com/what-is-a-safety-audit/ (*search*) · https://www.researchgate.net/figure/The-SafetiPin-Safety-Audit-Rubric-A-Safety-Score-is-calculated-from-the-combination-of_tbl1_369493880 (*search*)
- **Screen/interaction:** A **safety audit** scores nine parameters from 0 to 3: Lighting, Openness, Visibility ("eyes on the street"), People, Security, Walk Path, Public Transport, Gender Usage and Feeling. Scores are aggregated into a pin score. **Safetipin Nite** photographs streets from vehicles every 30m at night to fill coverage gaps. The data goes to city governments as shapefiles.
- **Principle learned:** Safety is decomposed into **observable environmental conditions**, not crime. That makes it actionable (fix the light) and less stigmatizing (it rates places, not people).
- **Why it works:** Grounded in feminist urban-planning research (the Jagori/women's safety audit lineage). "Feeling" is one parameter among several, not the whole score.
- **Relevance to Mira:** **Yes, high.** It is directly aligned with Mira's lighting and conditions model.
- **What NOT to copy:** A single numeric "safety score" on a neighbourhood. That stigmatizes areas and invites redlining. Don't copy the long nine-question form for casual users either.
- **Mira interpretation:** Model conditions as separate facts (lit / unlit, footpath / no footpath, busy / quiet now, open places nearby) and show them on route segments. Never roll them into one "safe / unsafe" grade for an area. The audit becomes one-tap StreetComplete-style questions (see #22). Offer to share aggregated condition data with city authorities as civic output.

#### 16. bSafe
- **Source URLs:** https://getbsafe.com/ (*search*) · https://apps.apple.com/us/app/bsafe-never-walk-alone/id459709106 (*search*)
- **Screen/interaction:** "Follow Me" (guardians watch you walk home and get an arrival message), voice-activated SOS, automatic audio and video recording sent to guardians, and Fake Call.
- **Principle learned:** "Never walk alone" (company-with-you framing) is emotionally right. Stacking many alarm features makes the product feel like a panic kit.
- **Relevance to Mira:** **Partial.** Follow Me validates Mira's journey model. Fake Call is a real, discreet need.
- **What NOT to copy:** Auto-recording and streaming to guardians by default, which is heavy on privacy and consent in public space. Don't copy the red SOS-heavy home screen.
- **Mira interpretation:** Offer a discreet "Get me out of this" action inside the unsafe sheet (a Mira-initiated call-like interruption or a pre-written WhatsApp to a contact) rather than a Fake Call gimmick on the home screen.

---

### C. Maps / location

#### 17. Apple Maps: sheet detents, place cards, Guides
- **Source URLs:** https://developers.apple.com/design/human-interface-guidelines/components/presentation/sheets/ (*search* snippets) · https://developer.apple.com/videos/play/wwdc2021/10063/ (*search*) · https://developer.apple.com/videos/play/wwdc2024/10097/ (Place Card API, *search*) · https://support.apple.com/guide/iphone/organize-places-with-custom-guides-iph0a53d4d7f/ios (*search*)
- **Screen/interaction:** A **non-modal resizable sheet** over the map with small, medium (about half) and large detents and a grabber that cycles detents on tap. The map behind stays interactive (no dimming). Place cards come in full, compact or link-only forms. Guides are curated place lists.
- **Principle learned:** The map is the primary surface and the sheet is secondary and adjustable. The HIG says to "support the medium detent to allow progressive disclosure". Show the most relevant items without resizing.
- **Why it works:** The user controls how much information versus map they see, and the spatial context is never lost.
- **Relevance to Mira:** **Yes, high.** This is Mira's core layout.
- **What NOT to copy:** Mira shouldn't copy iOS sheet chrome pixel-for-pixel in a PWA. The expectation is to feel native, not to impersonate the system. A stacked sheet-on-sheet navigation hierarchy also gets confusing on the web.
- **Mira interpretation:** One sheet. Small shows "Where are you going?" plus personal chips. Medium shows route options with lighting notes. Large shows details and contacts. During a journey the sheet shrinks to the capsule. The map stays live under every detent. A Help Point or report opens a compact card, not a new page.

#### 18. Apple Find My (People; location-change notifications)
- **Source URLs:** https://support.apple.com/guide/iphone/notify-a-friend-when-your-location-changes-iph9bfec93b1/ios (*search*) · https://support.apple.com/guide/iphone/get-notified-if-you-leave-a-device-behind-iph5f53aeae0/ios (*search*)
- **Screen/interaction:** "Add Location Alert" notifies a friend when you arrive at or leave a place, "only once or every time", with an adjustable radius. **"Notifications About You"** lists everyone who is notified about your movements.
- **Principle learned:** Share **events** (arrived, left) rather than streams. Make visibility **auditable** by the person being located.
- **Why it works:** Event-based sharing gives reassurance without surveillance. The "about you" list keeps the power balance honest.
- **Relevance to Mira:** **Yes.**
- **What NOT to copy:** Permanent always-on sharing as the default relationship.
- **Mira interpretation:** A "Who can see me" line shows on the capsule and in the Circle screen. Circle contacts get **arrival events** by default and the live link only during a journey.

#### 19. Google Maps: Area Busyness, Explore / Ask Maps, Live View
- **Source URLs:** https://blog.google/products-and-platforms/products/maps/keep-it-chill-holiday-new-tools-google-maps/ (Area Busyness, fetched) · https://support.google.com/maps/answer/11323117?hl=en (*search*) · https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/ (Ask Maps, fetched) · https://www.dezeen.com/2019/08/13/google-maps-ar-live-view-tech/ (Live View, *search*)
- **Screen/interaction:**
  - **Area Busyness:** a "Busy area" label over a neighbourhood. Tapping it shows an hourly chart plus places inside the area. It is aggregated from place-level live busyness.
  - **Ask Maps (2026):** conversational questions ("My phone is dying — where can I charge it…") answered with a **custom map** plus actionable places. It is personalized from saved and searched places, and hands off to book, save, share or directions.
  - **Live View:** raise the phone for AR arrows, which fixes orientation at the start of a walk.
  - **Immersive Navigation:** shows route trade-offs explicitly ("a longer trip with less traffic or a faster one with a toll").
- **Principle learned:** (a) Show ambient crowd density at area level, as a neutral fact, not a warning. (b) An AI answer should be **a map plus actions**, not a chat transcript. (c) State route trade-offs in plain language. (d) Solve the most anxious moment of walking, "which way do I face?".
- **Why it works:** Ask Maps grounds the model in real place data and returns the answer in the medium where the user will act on it.
- **Relevance to Mira:** **Yes, high.** Ask Maps is the strongest precedent for "AI companion, not a chatbot wrapped around a map".
- **What NOT to copy:** Recommendation and ad surfaces ("For you" feeds). Opaque personalization. Promising "busy = safe", because Google itself frames busyness as crowd avoidance.
- **Mira interpretation:** Mira's answers render **on the map**: highlighted segments, pins and one sentence, with "Start this route" as the action. Route cards state trade-offs as "4 min longer · lit the whole way · passes 2 open places". "Busy now" is one input, labelled as a proxy. A heading or "face this way" hint appears at journey start.

#### 20. Google Maps Local Guides (volume-based levels, cautionary)
- **Source URLs:** https://support.google.com/maps/answer/6225851?hl=en (fetched) · https://cloutly.com/blog/what-is-google-local-guides/ (*search*) · https://seono.co.uk/2018/01/17/google-reviews-are-broken/ (*search*)
- **Screen/interaction:** Points per contribution: review 10 (+10 for 200+ characters), photo 5, rating 1, "fact checked" 1, place added 15. Levels run from 1 (0 points) to 10 (100,000). The badge starts at Level 4 (250). **No part of the scoring rewards accuracy or helpfulness.** Points are only deducted after the fact for policy violations.
- **Principle learned:** Volume-based reputation rewards volume. Critics note that a "Level 8 guide with 20,000 points has proved they post a lot, but not that they visited". It invites farming and fake reviews.
- **Relevance to Mira:** **Yes, as a warning.**
- **What NOT to copy:** Points per report, levels, public badges, or any counter that goes up just because you submitted.
- **Mira interpretation:** Reporter trust (internal only) rises when **other people later confirm** your report, or when official or lighting data agrees with it. It falls when your reports get "not there" responses. Submitting earns nothing by itself.

#### 21. Waze: community reports, "Thumbs up / Not there"
- **Source URLs:** https://support.google.com/waze/answer/13739290?hl=en (Report road hazards, fetched) · https://support.google.com/waze/partners/answer/13458165?hl=en (Data Feed spec, fetched) · https://www.phonearena.com/news/google-maps-and-waze-enhance-safety-and-information-on-the-road-with-new-features_id161004 (*search*)
- **Screen/interaction:** A big report button leads to a category (hazard, pothole, broken traffic light, object). **Talk to report** accepts natural language. Drivers passing a report tap **Thumbs up** (still there) or **Not there**, which "will decrease the amount of time during which the report is displayed". Each alert carries **confidence** (−1 to 5, from reactions) and **reliability** (0 to 10, from reactions plus reporter level). Reports expire faster on busy roads and after about 30–60 minutes on quiet ones.
- **Principle learned:** **Confirmation from people who pass by** keeps the map fresh. Confidence and decay are the core, with separate scores for "is it still true" (confidence) and "who said it" (reliability).
- **Why it works:** Each passer-by is asked only a one-tap question about something right in front of them, when they are near it. Stale items decay by default.
- **Relevance to Mira:** **Yes, the highest relevance for corroboration.**
- **What NOT to copy:** Police-location reporting. Car-speed decay times; pedestrian conditions like broken lights persist for days, while harassment is transient. Visible reporter levels.
- **Mira interpretation:** Each report type has its own half-life (streetlight out: days; flooding: hours; harassment: short and not pinned precisely). When a user **walks past** a report, and only when not mid-crisis, a gentle one-tap prompt asks "Streetlight still out here? [Still out] [Fixed] [Not sure]". Confidence comes from recent independent confirmations and is shown as freshness ("confirmed by 3 people, 2h ago"), never as a score.

#### 22. OpenStreetMap StreetComplete: quests
- **Source URLs:** https://github.com/streetcomplete/StreetComplete/blob/master/QUEST_GUIDELINES.md (fetched) · https://wiki.openstreetmap.org/wiki/StreetComplete (*search*)
- **Screen/interaction:** The app finds nearby places where data is missing and shows **quest markers**. Each one is a single simple question answered on site (for example "Is this street lit?"), with pictures as answers. Edge cases sit behind an **"Uh…"** menu.
- **Principle learned:** From the guidelines: "Only one thing should need to be answered". Answers must be "easily accessible from the outside by pedestrians". "No knowledge about OpenStreetMap… must be necessary". Avoid "spam", meaning questions whose answer is the same 99% of the time. "Design the main form clutter-free".
- **Why it works:** Contribution becomes a moment of noticing, not a form. It can be done in five seconds while you are there.
- **Relevance to Mira:** **Yes, very high.** This is the template for low-friction, accurate contribution.
- **What NOT to copy:** Map-wide quest clutter and the "clear all pins" game loop. Mira users are travelling, not mapping for fun.
- **Mira interpretation:** **Micro-questions**, at most one per journey and only after arrival or while stationary: "On your walk, was the underpass on X Rd lit?" Answers are visual chips, with an "Not sure" escape hatch. Only ask where Mira's data is missing or stale. Contributions can feed OSM `lit=*` where licensing allows.

---

### D. Community / trust

#### 23. X Community Notes: bridging-based "helpful"
- **Source URLs:** https://github.com/twitter/communitynotes/blob/main/documentation/contributing/writing-and-rating-impact.md (fetched) · https://arxiv.org/html/2510.09585v4 (*search*) · https://www.pnas.org/doi/10.1073/pnas.2524004122 (*search*)
- **Screen/interaction:** A note shows publicly only when it is "rated helpful by people from diverse perspectives". Matrix factorization finds agreement across raters who usually disagree. **Writing Impact** rises when your notes reach Helpful and falls when they reach Not Helpful. **Rating Impact** rises when you rated *early* and your rating *matched* the final outcome. Both can go negative.
- **Principle learned:** **Reputation that rewards being right, not being active.** Consensus has to come from independent sources, not from a single cluster.
- **Why it works:** Coordinated brigading can't push a note through, and early accurate raters are rewarded. Known limits: it is slow, and most notes never reach a status (see the "sustainability" papers).
- **Relevance to Mira:** **Yes**, for the logic of trust and corroboration (not for the UI).
- **What NOT to copy:** Public contributor scores, political-perspective modelling, and slow consensus for time-critical safety facts.
- **Mira interpretation:** "Independent" means confirmations from **different people, on different days or at different times**, not linked by device or social tie. The report reaches "confirmed" when it has independent agreement, or when an objective source (city lighting data, Mapillary imagery) agrees. Reporter accuracy is private and asymmetric: it takes many accurate reports to gain weight and few bad ones to lose it.

#### 24. Stack Overflow / Wikipedia: earned privileges
- **Source URLs:** https://stackoverflow.blog/2010/10/07/membership-has-its-privileges/ (fetched) · https://internal.stackoverflow.help/en/articles/8775594-reputation-and-voting (*search*) · https://stackoverflow.com/help/privileges (fetch blocked)
- **Screen/interaction:** Capabilities (comment, downvote, edit, close) unlock at reputation thresholds earned from **peer votes**. When a privilege unlocks, the user is congratulated and pointed to the guidelines for it. There is a daily cap on reputation gains. Wikipedia similarly gates semi-protected pages to "autoconfirmed" accounts.
- **Principle learned:** Gate **higher-impact actions** behind demonstrated reliability, and teach the norms at the moment of unlocking. The blog noted that new power-holders, "usually with good intentions", did discouraged things until they were guided.
- **Relevance to Mira:** **Partial.** Capability gating is useful. The visible reputation culture is not.
- **What NOT to copy:** Public reputation numbers, badges, or a hierarchy of users.
- **Mira interpretation:** A brand-new account's report appears as "unconfirmed" and needs one independent confirmation before it affects routing. Trusted reporters' reports can shape routes immediately. High-sensitivity report types (harassment) always need corroboration and never show exact points. When someone first becomes trusted, a one-line in-context note explains what that means.

#### 25. Nextdoor: anti-profiling posting flow + Kindness Reminder
- **Source URLs:** https://techandsocialcohesion.substack.com/p/how-nextdoor-reduced-racial-bias (fetched) · https://blog.nextdoor.com/2019/09/18/announcing-our-new-feature-to-promote-kindness-in-neighborhoods (*search*) · https://www.inc.com/tess-townsend/nextdoor-addresses-issue-of-racial-profiling.html (*search*) · https://blog.nextdoor.com/2016/04/12/improvements-to-how-our-members-post-about-crime-and-safety/ (404 now; cited widely)
- **Screen/interaction:** The crime and safety posting flow added: (1) a pause interstitial, (2) **behaviour first**, where you describe what happened before describing any person, (3) if a person is described, race alone is blocked and hair, top, bottom and shoes are required, and (4) the guidelines appear inline. Result: **about 75% fewer racial-profiling posts**. The Kindness Reminder is a pre-post prompt on likely-offensive replies. One in five edited in early tests, and a later version saw 36% edit or withhold.
- **Principle learned:** "Design is way more important than moderation. Moderation is really a failure case." **Friction in the right place**, specifically at the point where bias enters, works better than moderating afterwards.
- **Why it works:** Users "weren't aware of their own biases". Structuring the input changes what gets said.
- **Relevance to Mira:** **Yes, high**, because harassment and "suspicious" reports are Mira's biggest harm vector.
- **What NOT to copy:** A "suspicious person" category at all. Posts in a free-text feed. Neighbourhood-wide broadcast.
- **Mira interpretation:** Mira's report types describe **conditions and events**, not people: "streetlight out", "flooding", "blocked footpath", "I was harassed here". The harassment flow asks what happened and when. It **never asks for, or accepts, a description of a person**. Free text is optional and screened by Mira with a gentle rewrite suggestion. There is no public comment thread on any report.

---

### Principles Mira should adopt

1. **Guardian, not watcher.** Share events (started, arrived) by default and the live location only for the length of a journey. Every share has a visible end. (Apple Check In, Find My, Life360 Bubbles)
2. **Ask me before you tell them.** Before escalating to contacts, Mira checks with the user with a kind, context-sized timeout. (Check In 15 min, Safety check 60 s)
3. **Arrival is the default outcome.** Design the successful ending as carefully as the alarm: automatic, warm, and immediately dismissed. (Check In, Live Activities)
4. **Design the recipient's view as a first-class product.** It shows name, destination, ETA and "on track", with detail only on escalation. (Uber Share Trip)
5. **One live object, three densities.** A journey is a single capsule that is collapsed, expanded or alerting. It raises its prominence only for a stall, a deviation or an expired timer. (Dynamic Island)
6. **Map first, sheet second.** Use one non-modal, detented sheet, and never lose the map. (Apple Maps / HIG sheets)
7. **The AI answers in the map.** Mira's replies are highlighted segments, pins, one sentence and one action, not chat bubbles. (Ask Maps)
8. **Describe conditions, not danger.** Show observable facts (lit, footpath, open places, busy now) per segment. Never publish a single safety grade for a place. (Safetipin)
9. **State trade-offs, don't command.** Say "4 min longer, lit the whole way". Leave the choice to the user. (Google Immersive Navigation)
10. **Truth decays.** Every report has a type-specific half-life and a visible freshness, so stale reports fade on their own. (Waze, Arc auto-archive)
11. **Corroborate with one tap, in context.** Ask passers-by one question about what is in front of them, at a calm moment. (Waze "Not there", StreetComplete)
12. **Reputation rewards accuracy, privately.** Trust comes from independent later confirmation. Volume earns nothing, and scores are never shown publicly. (Community Notes, versus Local Guides)
13. **Put friction where harm enters.** Report flows are behaviour-only and person-free, with a gentle pause for free text. (Nextdoor)
14. **Give value before asking.** Request permissions in context, at the first moment they help. (Headspace, Notion)
15. **Calm through restraint and speed.** Use a neutral map, colour that carries meaning, optimistic UI, and nothing on screen that isn't needed now. (Linear)

### Patterns Mira should explicitly reject

1. **Incident push alerts / crime feeds.** Citizen-style "incident near you" notifications and scanner transcriptions.
2. **Single safety scores or red zones for neighbourhoods.** They stigmatize places and the people who live there.
3. **"Suspicious person" reporting** and any field describing a person's appearance.
4. **Comment threads under reports.** They become rumour, pile-ons and vigilantism.
5. **Points, levels, badges and leaderboards for contributing**, and public contributor ranks of any kind. (Local Guides, Strava crowns)
6. **Always-on location tracking and movement history.** Also driving and behaviour scores. (Life360)
7. **Monetizing fear.** No paywalled safety features, no upsell on the unsafe sheet, and no "Protect"-style subscriptions tied to anxiety.
8. **Police and security aesthetics.** No sirens, flashing red, shield-and-badge iconography, or direct police dispatch as the default escalation.
9. **SOS-heavy home screen.** A giant red panic button as the hero element. (bSafe-style)
10. **Auto-recording or streaming audio and video by default** in public space.
11. **Dashboards and feeds.** Tile grids, promo carousels and "For you" recommendation rails on the home screen. (Revolut / Google feed density)
12. **Chatbot-first UI.** A chat window laid over the map, or long AI paragraphs where a highlighted route would do.
13. **Stale-forever pins.** Reports that don't expire or can't be marked "gone".
14. **Mascots, gamified streaks and playful 3D icons** in safety-critical moments. (Headspace and Airbnb playfulness applied in the wrong context)
15. **Faux-native iOS chrome** in a PWA, such as a fake Dynamic Island or a copied system sheet, which breaks trust on Android and web.

---

# Part 3 — Open-source, design systems, motion and visual systems


*Researched 2026-09-28. Candidates are documented only. Nothing has been installed, and `/Users/jarvis/Developer/MIRA` was only read, never changed.*

**Context.** Mira is a mobile-first PWA built on Next.js 16.3.6 (App Router), React 19.2.8, Tailwind CSS 4 and MapLibre GL 6.11.2 with Google Map Tiles. It has no component library. From reading the repo:

- **`src/components/app/BottomSheet.tsx`.** A non-modal sheet with three snaps: peek 40dvh, half 55dvh and full 88dvh.
  - It uses pointer events with `setPointerCapture` and handles `pointercancel`.
  - It animates **`height`** with `300ms cubic-bezier(0.2,0.9,0.3,1)`.
  - The drag position goes through React state, so React re-renders on every pointermove.
  - The snap is chosen by position ratio only (0.72 / 0.42). Velocity is not used.
  - The handle is a `<button>`, so keyboard users can cycle the snaps.
- **`src/components/ui/Toast.tsx`.** Uses `role="status"` with `aria-live="polite"`.
- **`src/app/globals.css`.** Already has two `prefers-reduced-motion` blocks.
- **Font.** `Plus_Jakarta_Sans({ subsets: ["latin"] })` via `next/font/google` in `src/app/layout.tsx`. It has **no Devanagari** coverage.

**Team default:** reuse what exists and add no dependencies. Verdicts below are **ADOPT**, **CONSIDER LATER** or **REJECT**. "ADOPT" is only ever used for zero-dependency techniques, guidance, or fonts, which are static assets and not JS dependencies.

---

### TL;DR

| Candidate | Verdict | One-line reason |
|---|---|---|
| Anthropic `frontend-design` skill (guidance) | ADOPT (as guidance) | Free and zero-dep. Its anti-"generic AI look" list matches Mira's "calm premium" goal |
| Impeccable (pbakaus) (guidance and `npx impeccable detect`) | ADOPT guidance; detector CONSIDER LATER as a dev-only check | Concrete quality floor (contrast, measure, motion durations). Apache-2.0 |
| Emil Kowalski's animation principles | ADOPT (as guidance) | <300 ms, ease-out, no `scale(0)`, transform/opacity only, drag via direct style writes |
| Modern CSS (`@starting-style`, `transition-behavior`, `linear()`, View Transitions, React `<ViewTransition>`) | ADOPT | Baseline in Chrome/Safari/Firefox. Covers ~90% of what a motion lib would do here |
| `motion` (full `motion` component) | REJECT | ~34 kB gz (vendor figure) for things CSS already does |
| `motion` mini `animate()` / `LazyMotion`+`m` | CONSIDER LATER | 2.3 kB / ~4.6 kB+15 kB. Only if JS springs with gesture velocity become essential |
| Vaul | REJECT | Repo marked **unmaintained**. 18.5 kB gz incl. Radix Dialog. Modal-first, but Mira's sheet is non-modal over a map |
| Sonner | REJECT | 9.4 kB gz. Mira already has an aria-live Toast. Borrow the ideas instead |
| Magic UI / Aceternity UI | REJECT | Showcase effects that are now a recognised "AI slop" tell. They pull in `motion` |
| shadcn/ui | REJECT | A code distribution on top of Radix/Base UI plus class utilities. Solves a problem Mira doesn't have |
| Radix Dialog / Toast | REJECT | 12.6 / 11.2 kB gz. Slower cadence since the WorkOS acquisition. shadcn has moved its default away |
| Base UI (`@base-ui/react`) | CONSIDER LATER (first choice if a primitive is ever needed) | Stable since Dec 2025, v1.8.0 (Sep 2026). Drawer has snap points, velocity snap skipping and a non-modal mode |
| React Aria Components | CONSIDER LATER (for complex i18n widgets only) | Best-in-class a11y and i18n, but heavy. Toast is still `UNSTABLE_` |
| `@use-gesture/react` | REJECT | 8.9 kB gz. Last release Mar 2025. Pointer Events already cover it |
| deck.gl | REJECT | `@deck.gl/core` ~217 kB gz. Overkill for pins and routes |
| Native `<dialog>` + `inert` + `popover` | ADOPT | Zero-dep focus trap and top layer. Note `closedby` is **not** in Safari yet |
| Fonts: Latin variable face + Noto Sans Devanagari / Anek / Mukta via `next/font` | ADOPT (pairing) | Static assets, self-hosted by `next/font`. Devanagari loads only when used |
| Haptics: `navigator.vibrate` (Android), iOS switch trick | ADOPT vibrate as a progressive enhancement; iOS trick CONSIDER LATER | iOS Safari has no Vibration API. The switch hack was restricted in iOS 26.5 |

---

### 1. Anthropic "frontend-design" skill

**Sources:**
- https://github.com/anthropics/skills/tree/main/skills/frontend-design (raw: https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design

What the **current** revision says (fetched 2026-09-28):

**Typography**
- Pick typefaces deliberately, not "the default families you would reach for on any other project".
- Use at most one or two families. If two, make them clearly distinct.
- Keep line length under ~80 characters.
- Serif body text needs more leading.
- Typographic tells to avoid:
  - accenting a single word in a headline
  - ALL-CAPS labels
  - needless labels above content

**Color**
- Build a compact token system of 4–6 named hex values.
- Palettes it calls out as generic defaults:
  - warm cream (~`#F4F1EA`) with terracotta (~`#D97757`)
  - near-black with acid-green or vermilion accents
  - tinted near-blacks standing in for black

**Motion**
- Use non-user-triggered motion sparingly, with "one orchestrated moment".
- Fade-and-slide-up on every section and hover effects on every card are the generic default to avoid.
- Motion that answers a user action (opening, expanding, confirming) is welcome.

**Structure.** It names five clusters of generic AI output:
1. cream + serif + terracotta
2. dark + acid accent
3. broadsheet hairlines with zero radius
4. identical rounded cards with soft shadows
5. tracked all-caps labels, middot meta strings, monospace data and appended arrows

It also warns against numbered 01/02/03 markers unless the content really is sequential.

**Note.** Earlier (2025) revisions named specific overused fonts, such as Inter, Roboto, Arial and system fonts, and warned against converging on Space Grotesk. That is recalled from memory and **not re-verified**. The current text no longer names fonts.

**Relevance to Mira.** Mira uses a `glass` sheet, large radii (`rounded-t-[2rem]`) and a purple-tinted shadow (`rgb(50 25 120 / .35)`). Audit these against the "identical rounded cards / soft shadows" and "purple gradient" tells (see §2).

**Verdict:** ADOPT as guidance (no dependency).

### 2. Impeccable (pbakaus/impeccable)

**Sources:**
- Repo: https://github.com/pbakaus/impeccable (Apache-2.0)
- Skill: https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/SKILL.md
- References: `reference/craft-floor.md` and `reference/animate.md`

**What it is.** One agent skill with about two dozen commands:
- `init`, `shape`, `craft`, `critique`, `audit`, `polish`
- `bolder`, `quieter`, `distill`, `harden`
- `animate`, `typeset`, `layout`, `colorize`, `adapt`, `optimize`
- `live`, and others

It also ships a deterministic detector (`npx impeccable detect`). The README says 61 rules and runs without an LLM. Third-party pages cite 41, so the count varies by version. `init` writes a `PRODUCT.md` of confirmed product truths.

**Anti-patterns (README/SKILL):**
- Overused fonts (Arial, Inter, system defaults)
- Purple-to-blue gradients
- Gray text on colored backgrounds
- Pure black or gray (tint neutrals instead)
- Cards everywhere and nested cards
- Bounce or elastic easing ("feels dated")
- Side-tab borders and dark glows

**`craft-floor.md` quality floor (concrete numbers):**
- **Type:**
  - body measure 65–75 characters
  - display capped at 6rem
  - tracking no tighter than −0.04em (−0.02 to −0.03em usually better)
  - obvious scale and weight steps
- **Contrast:** body and placeholder text ≥4.5:1, large text ≥3:1. On colored surfaces, tint secondary text from the hue and never use gray.
- **Layout:**
  - tight groups with generous separation, and more space above a heading than below
  - card radii 12–16px, with pills only for small controls
  - borders of 1px at most
- **Depth:** declare elevation once, as a border *or* a shadow.
- **Bans:**
  - eyebrows/kickers
  - gradient text
  - doodle-style illustrations
  - fake-photo illustration
- **States:** cover hover, disabled, loading, error and empty. Errors name the problem and the recovery.

**`animate.md`:**
- **Durations:**
  - 100–150 ms for feedback
  - 150–300 ms for state changes
  - 300–500 ms for overlays and view transitions
  - 500–800 ms only for an authored focal entrance
- **Easing:** prefer `cubic-bezier(0.16, 1, 0.3, 1)`. Exits run faster than entrances.
- **Reduced motion:** "fewer and gentler animations, not disabling all motion". Keep opacity and color feedback.
- **Stagger:** only for real lists, with a capped total delay.

**Relevance to Mira.** Mira's sheet radius (2rem = 32px) is well above the 12–16px card guidance. Sheets are not cards, and iOS sheets use large radii, so this is a judgement call. Its purple-tinted shadow and glass would be flagged by the detector as possible tells.

**Verdict:** ADOPT the guidance. CONSIDER LATER running `npx impeccable detect` as a one-off, dev-only audit (not a dependency).

### 3. Motion (motion.dev) vs modern CSS

**Sources:**
- https://motion.dev/docs/react-reduce-bundle-size
- https://motion.dev/docs/animate
- https://motion.dev/docs/react-accessibility
- https://bundlephobia.com/package/motion

**Vendor-stated sizes (min+gz):**

| API | Size (min+gz) |
|---|---|
| Full `<motion.div>` | ~34 kB |
| `LazyMotion` + `m` | ~4.6 kB initial |
| `domAnimation` feature pack (animations, variants, exit, tap/hover/focus gestures) | +15 kB |
| `domMax` feature pack (adds drag, pan and **layout animations**) | +25 kB |
| `useAnimate` / `animate()` mini (WAAPI-based) | **2.3 kB** |
| `useAnimate` / `animate()` hybrid | ~17–18 kB (page says 17, the `animate` doc says 18) |

Bundlephobia reports the whole `motion` package (v13.4.4) at 47.7 kB gz. That is not tree-shaken, so it is not representative.

**Capabilities:**
- **Springs:** physics springs with velocity carry-over. Mini `animate` needs `spring` imported separately.
- **Layout animations:** FLIP-based `layout` / `layoutId`, which needs `domMax`.
- **Reduced motion:** `<MotionConfig reducedMotion="user">` disables transform and layout animations but keeps opacity and color. `useReducedMotion()` is a hook.
- **Hardware acceleration:** Emil notes that rAF-driven animation (such as Framer Motion's `x`) is not hardware-accelerated when the main thread is busy, whereas CSS and WAAPI are. Motion's hybrid engine uses WAAPI where it can.

**What modern CSS already replaces (Chrome + Safari + Firefox, 2026):**

| Need | CSS/platform feature | Support |
|---|---|---|
| Enter animation from `display:none`, including `<dialog>` and `popover` | `@starting-style` + `transition-behavior: allow-discrete` | Baseline 2024-08-06: Chrome 117, Firefox 129, Safari 17.5 (allow-discrete 17.4). https://web.dev/blog/baseline-entry-animations |
| Spring or bounce feel without JS | `linear()` easing (generate points from a spring) | Chrome 113, Firefox 112, Safari 17.2. Baseline 2023, Widely Available ~Jun 2026. https://web-platform-dx.github.io/web-features-explorer/features/linear-easing/ |
| Shared-element and route transitions | Same-document View Transitions (`document.startViewTransition`, `view-transition-name`, `view-transition-class`) | Baseline Newly Available 2025-10-14 (Firefox 144). https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available |
| Declarative in React/Next | `import { ViewTransition } from 'react'` | Works in Next 16 App Router with no config (bundled React canary). See `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` |
| Reduced motion | `@media (prefers-reduced-motion)`, Tailwind `motion-safe:` / `motion-reduce:` | Universal |
| Tailwind sugar | `starting:` variant (Tailwind v4) for `@starting-style` | Tailwind 4 |

**What CSS does not do natively:**
- Velocity-aware, interruptible physics that continues from a finger flick.
- FLIP layout animation of arbitrary reflows. View Transitions cover most of this.

For a bottom sheet you can:
- compute release velocity yourself (a few lines),
- pick a target snap,
- then run a CSS `transform` transition with a `linear()` spring curve, or a tiny hand-written rAF spring (~30 lines).

**Verdict:** REJECT the full `motion`. CONSIDER LATER mini `animate` (2.3 kB) only if hand-rolled velocity springs prove insufficient.

### 4. Vaul, Sonner, and Emil Kowalski's principles

**Vaul** (https://github.com/emilkowalski/vaul, docs https://vaul.emilkowal.ski/snap-points)

- **Status:** the README says "This repo is unmaintained. I might come back to it at some point…" It has 8.6k stars and ~136 open issues.
- **Size:** v1.1.2 is **18.5 kB gz** including ~25 transitive deps (the full `@radix-ui/react-dialog` stack, `react-remove-scroll`, `aria-hidden`). https://bundlephobia.com/package/vaul
- **Techniques worth copying** (source `src/constants.ts` and https://emilkowal.ski/ui/building-a-drawer-component):
  - `transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)`, which approximates the iOS sheet curve (derived from Ionic).
  - `VELOCITY_THRESHOLD = 0.4` (distance/ms), `CLOSE_THRESHOLD = 0.25`, `SCROLL_LOCK_TIMEOUT = 100` ms.
  - `snapToSequentialPoint` turns off velocity skipping of snaps.
  - During drag, write `transform` **directly to the element's style**. Neither a CSS variable (which triggers inherited style recalculation on all children) nor React state.
  - Ignore extra touches after the first.
  - After content scrolls back to top, block drag for 100 ms so momentum doesn't close the sheet.
  - Use the Visual Viewport API for keyboard height.
- **Mira gap:** Mira's sheet animates `height` (layout on every frame) and pushes drag through `setState` (re-render per move), with no velocity. Moving to `translateY` with direct style writes and velocity projection copies Vaul's best ideas at zero dependency cost.
  - **Trade-off:** with transform, give the sheet a fixed max height and translate it, so the inner scroll area is sized by the snap, not the animated height.
- **Verdict:** REJECT. It is unmaintained, modal-oriented, and pulls in Radix.

**Sonner** (https://github.com/emilkowalski/sonner, MIT, ~13k stars)

- **Size:** v2.0.8 is **9.4 kB gz**, no deps. https://bundlephobia.com/package/sonner
- **Maintenance:** active.
- **Ideas to borrow:**
  - stacked toasts that expand on hover or focus
  - swipe to dismiss
  - pause the timer while the document is hidden or the toast is hovered
  - promise toasts
- **Verdict:** REJECT. Mira's Toast already has `role=status` and `aria-live=polite`. Add swipe-dismiss and pause-on-hidden by hand if wanted.

**Emil's principles**

Sources:
- https://emilkowal.ski/ui/7-practical-animation-tips
- https://emilkowal.ski/ui/great-animations
- https://emilkowal.ski/ui/you-dont-need-animations
- Course: https://animations.dev/

The principles:
- UI animations stay **under 300 ms**. 180 ms feels snappier than 400 ms.
- **Ease-out** for entering and exiting, with custom curves because built-ins are weak.
- **Never animate from `scale(0)`**; start around 0.93–0.95. Button press `:active { scale(0.97) }`.
- **Origin-aware** popovers (`transform-origin` at the trigger).
- **No animation for high-frequency or keyboard-initiated actions**, and the second tooltip in a sequence appears instantly.
- Animate only `transform` and `opacity` (compositor). CSS transitions are interruptible, keyframes are not.
- A ~2px blur can mask imperfect crossfades.
- Respect `prefers-reduced-motion`.

**Note:** sheets are the explicit exception to the 300 ms rule. Vaul uses 500 ms to match iOS.

**Verdict:** ADOPT as guidance.

### 5. Magic UI and Aceternity UI

**Magic UI**
- **Links:** https://magicui.design, https://github.com/magicuidesign/magicui (~22k stars)
- **What it is:** copy-paste components distributed through the shadcn registry, plus a paid "Pro".
- **Example:** `NumberTicker` imports `useInView`, `useMotionValue` and `useSpring` from `motion/react` (spring `damping: 60, stiffness: 100`) and formats with `Intl.NumberFormat`. Source: https://raw.githubusercontent.com/magicuidesign/magicui/main/apps/www/registry/magicui/number-ticker.tsx

**Aceternity UI**
- **Links:** https://ui.aceternity.com (200+ components, React + Tailwind + Motion, paid Pro)
- **License:** free-tier license not verified.

**Why they risk the slop look.** Stock Aceternity and Magic UI effects are now explicitly listed as tells of AI-generated frontends. See https://github.com/funboy322/avoid-ai-design. Typical examples:
- beams, spotlights, meteor showers
- shimmer and border-beam buttons
- bento grids, marquee logos
- gradient text

These are marketing-page "component showcase" effects. They clash with a calm safety companion, and nearly all of them depend on `motion`.

**What is tasteful to borrow (re-implemented, zero dep):**
- **Number ticker** for a single hero metric, such as an ETA or a distance countdown. Use rAF with `Intl.NumberFormat`, or CSS `@property --n` with `counter()` for integers. Use `font-variant-numeric: tabular-nums` so digits don't jitter. Show the final value instantly under reduced motion.
- A subtle skeleton shimmer for loading states, under reduced-motion guard.

**What to reject:** everything decorative (beams, particles, 3D cards, sparkles, animated gradients).

**Verdict:** REJECT both libraries. Borrow the number-ticker idea only.

### 6. Accessibility primitives: shadcn/ui, Radix, Base UI, React Aria

| | Dialog/Drawer | Toast | Size (min+gz) | 2026 status |
|---|---|---|---|---|
| **shadcn/ui** (https://ui.shadcn.com) | Wraps Radix or Base UI (Drawer = Vaul) | Sonner | Sum of underlying libs plus utils (cva, clsx, tailwind-merge) | Base UI became the **default for new projects on 2026-07-03**. Radix is "not being deprecated". https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default |
| **Radix Primitives** (https://www.radix-ui.com) | `@radix-ui/react-dialog` 1.1.23: **12.6 kB gz**, 15 deps | `@radix-ui/react-toast` 1.2.23: **11.2 kB gz** | per-package | Maintained by WorkOS with a small team. Cadence slowed after acquisition, and shadcn's default moved away |
| **Base UI** (https://base-ui.com, `@base-ui/react`) | `Dialog`; `Drawer` stable since v1.3.0 (2026-03-12) with `snapPoints` (fractions/px), **velocity-aware snap skipping**, swipe dismiss in 4 directions, `modal: true / false / 'trap-focus'`, `initialFocus` / `finalFocus`, `VirtualKeyboardProvider`, CSS vars `--drawer-swipe-progress` | `Toast` with swipe dismiss | per-component size **unverified** (per-export entry points, tree-shakable; bundlephobia API returned no data) | 1.0 stable Dec 2025, **v1.8.0 on 2026-09-04**. MUI full-time team (ex-Radix / Floating UI) |
| **React Aria Components** (https://react-aria.adobe.com) | `Modal` / `Dialog` (there is a Motion-based sheet example: https://react-spectrum.adobe.com/react-aria/examples/framer-modal-sheet.html) | `UNSTABLE_Toast*`: landmark region, F6 / Shift+F6 navigation, focus restore, uses View Transitions | Whole package v1.21.1 is 274 kB gz (not tree-shaken). Real per-component cost is lower but notable (approx, unverified) | Adobe-maintained, very active. Strongest i18n (RTL, locale-aware) |

**Zero-dep platform alternative (ADOPT):**
- `<dialog>.showModal()` gives you:
  - the top layer
  - a native focus trap (the rest of the page is inert)
  - Esc to close
  - `::backdrop`
- Animate it with `@starting-style` and `transition-behavior: allow-discrete`, as in §3.
- `popover` gives light-dismiss menus.
- `inert` covers the parts of the page behind a custom modal.
- **Caveat:** `<dialog closedby="any">` (light dismiss) ships in Chrome/Edge 134 and Firefox 141 but **not Safari (incl. iOS)** as of Sep 2026. Keep a manual backdrop-click handler. https://web-platform-dx.github.io/web-features-explorer/features/dialog-closedby/

**Where Mira stands:**
- Its main sheet is **non-modal** (the map stays interactive), which is the Material "standard bottom sheet". That is correct and needs no focus trap. Use `<section aria-label>` (already done) plus a resize button (already done). Optionally expose the snap state via `aria-expanded` or visible text.
- Real modals (confirmations, SOS confirm) should use native `<dialog>`.

**Verdict:**
- shadcn/ui: REJECT
- Radix: REJECT
- Base UI: CONSIDER LATER. It is the first pick if a hand-rolled modal or drawer ever fails an a11y audit, since Drawer covers snap points, velocity and non-modal in one maintained package.
- React Aria: CONSIDER LATER, only for complex widgets (combobox, date picker) where its i18n earns the weight.

### 7. Map UX

**Styling a Google raster basemap.**
- Mira's basemap is Google Map Tiles 2D, which are **raster** tiles in MapLibre. MapLibre style expressions cannot restyle it. Declutter it at session creation with Google's JSON `styles`, which is **roadmap map type only**.
- Examples:
  - `{featureType:"poi.business", stylers:[{visibility:"off"}]}`
  - hide `transit` icons
  - reduce `road.local` label density
  - `visibility: "simplified"`
- Google advises absolute `color` values over relative hue or lightness. An over-long style array is silently ignored.
- Sources: https://developers.google.com/maps/documentation/tile/style-reference and https://developers.google.com/maps/documentation/tile/2d-tiles-overview
- **Attribution:** keep the Google attribution visible, and never let the sheet cover it at peek.

**Declutter overlays in MapLibre** (Style Spec: https://maplibre.org/maplibre-style-spec/layers/):
- **Clustering:** GeoJSON `cluster: true`, `clusterRadius`, `clusterMaxZoom`. Example: https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/
- **Placement priority:** `symbol-sort-key` decides which symbol wins a collision. Keep `icon-allow-overlap: false` for secondary pins.
- **Labels:** `text-variable-anchor` lets labels shift instead of disappearing. `text-optional` / `icon-optional` let the icon survive when its label can't fit.
- **Zoom:** use per-layer `minzoom`/`maxzoom` and zoom-interpolated `icon-size` / `text-size`.
- **Selection:** use `feature-state` for selected or hovered pins, which avoids re-setting data.
- **Large data:** https://maplibre.org/maplibre-gl-js/docs/guides/large-data/ covers trimming properties, reducing precision to ~6 decimals, clustering, and lower `maxzoom` on point sources.
- **Principle:** one primary pin type visible at a time. Everything else is a cluster or appears only on zoom or selection.

**Sheet + map pattern:**
- **Apple HIG sheets:** medium (~half) and large detents, a grabber (tap to cycle detents), and a progressive-disclosure rationale. https://developer.apple.com/design/human-interface-guidelines/sheets
- **Ionic sheet modal:** `breakpoints`, `initialBreakpoint`, `handleBehavior="cycle"` (keyboard/AT), `expandToScroll`. **`backdropBreakpoint`** keeps the map interactive until the sheet passes a threshold, which is exactly Mira's case. https://ionicframework.com/docs/api/modal
- **Material 3:**
  - *standard* sheet: coexists with content
  - *modal* sheet: scrim, blocks content
  - drag handle has a 48dp hit target
  - https://m3.material.io/components/bottom-sheets/overview and https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md
- **Map padding:** when the sheet snaps, call `map.easeTo({ padding: { bottom: sheetPx } })` so the focused point and route are centred in the visible area, not hidden under the sheet. This is a built-in MapLibre camera option.

**Open-source map apps worth studying:**
- Organic Maps: https://github.com/organicmaps/organicmaps
- CoMaps, the 2025 community fork, now in stores: https://codeberg.org/comaps/comaps (mirror https://github.com/comaps/comaps)
- OsmAnd: https://github.com/osmandapp/OsmAnd
- StreetComplete, a well-regarded minimal quest-pin UI with strong clutter discipline: https://github.com/streetcomplete/StreetComplete
- Headway / maps.earth, the closest analogue as a **web** MapLibre frontend: https://github.com/headwaymaps/headway

These are native apps, except Headway. Study the interaction patterns, not the code.

**deck.gl** (https://deck.gl/docs/api-reference/maplibre/overview)
- `@deck.gl/core` 9.4.0 is **~217 kB gz**. It supports MapLibre v6 interleaved rendering.
- **Verdict:** REJECT. It is built for 100k+ point or 3D analytic layers, and Mira draws pins, a route and heatmap-ish zones.

### 8. Gestures and motion specs

**`@use-gesture/react`** (https://github.com/pmndrs/use-gesture)
- v10.3.1 is **8.9 kB gz**. Its last release was 2025-03-21, a type-only fix, so it is low-activity.
- It adds velocity, direction, rubber-banding and axis locking.
- Mira already uses Pointer Events + `setPointerCapture`. Add a ring buffer of the last ~3–5 `(y, t)` samples to get velocity.
- **Verdict:** REJECT.

**Material 3 motion tokens**
- Sources: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs and https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md
- **Easing:**
  - standard `cubic-bezier(0.2, 0, 0, 1)`
  - standard-decelerate `(0, 0, 0, 1)`
  - standard-accelerate `(0.3, 0, 1, 1)`
  - **emphasized-decelerate `(0.05, 0.7, 0.1, 1)`**, for entering
  - **emphasized-accelerate `(0.3, 0, 0.8, 0.15)`**, for exiting
  - emphasized is a two-segment path, which you can approximate with `linear()`
- **Durations:**
  - short1–4: 50 / 100 / 150 / 200 ms
  - medium1–4: 250 / 300 / 350 / 400 ms
  - long1–4: 450–600 ms
  - extra-long: 700–1000 ms
- **M3 Expressive spring tokens:**

| Token | Damping ratio | Stiffness |
|---|---|---|
| fast spatial | 0.9 | 1400 |
| fast effects | 1.0 | 3800 |
| default spatial | 0.9 | 700 |
| default effects | 1.0 | 1600 |
| slow spatial | 0.9 | 300 |
| slow effects | 1.0 | 800 |

- Spatial springs may overshoot; effects springs (color, opacity) never do.

**Apple WWDC23 "Animate with springs"**
- Sources: https://developer.apple.com/videos/play/wwdc2023/10158/ and notes at https://wwdcnotes.com/documentation/wwdc23-10158-animate-with-springs/
- Springs are parameterised by **duration** (perceptual settle time) and **bounce**, which replace mass, stiffness and damping.
- Presets: `.smooth`, `.snappy`, `.bouncy`.
- Bounce ~0.15 barely reads as bouncy, and ~0.30 is noticeable. Keep it below ~0.4. Default to 0 when unsure.
- Springs preserve velocity when retargeted, which is why they are SwiftUI's default.

**Suggested Mira motion tokens (CSS custom properties, zero-dep):**

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Impeccable / expo-out |
| `--ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | M3 emphasized-decelerate |
| `--ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | M3 emphasized-accelerate |
| `--ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | Vaul / iOS |
| `--dur-1` | 120 ms | press feedback |
| `--dur-2` | 200 ms | state change |
| `--dur-3` | 300 ms | overlay |
| `--dur-sheet` | 450–500 ms | sheet |

Optionally add one `--spring-sheet: linear(...)`, generated offline from duration ≈ 0.5 s and bounce ≈ 0.1 (Apple-style parameters). Any `linear()` generator works, e.g. https://linear-easing-css-generator.netlify.app/, which is a build-time tool, not a dep.

### 9. Typography for a calm, premium, global product (Latin + Devanagari + more)

**Key fact.** Mira's current Plus Jakarta Sans, and every popular Latin UI face listed below, have **no Devanagari**. A Devanagari (and later other Indic, Arabic and CJK) companion is required regardless of which Latin face is chosen.

| Face | Scripts | Variable axes | Notes |
|---|---|---|---|
| **Inter** v4 (https://rsms.me/inter/) | Latin, Greek, Cyrillic, Vietnamese | wght + **opsz 14–32** (Inter Display merged in) | Excellent UI legibility and tabular numerals. Flagged as *the* generic AI default by Impeccable |
| **Geist** (https://vercel.com/font) | Latin, Greek, Cyrillic (redesigned in 1.7.0) | wght | Strongly associated with the Vercel/dev-tool look |
| **Google Sans Flex** (https://github.com/googlefonts/googlesans-flex) | Latin only (per reports) | wght, wdth, slnt, opsz, GRAD, ROND | OFL since 2025-11-18. Distinctive but Google-branded in feel |
| **Instrument Sans** (https://fonts.google.com/specimen/Instrument+Sans) | Latin | wght + wdth | Precise with slight warmth. A good calm-premium candidate |
| **Figtree** (https://fonts.google.com/specimen/Figtree) | Latin (280+ languages) | wght | Friendly geometric, close in feel to Jakarta |
| **Onest** | Latin + Cyrillic | wght 100–900 | Neutral screen sans |
| **Hanken Grotesk** (https://fonts.google.com/specimen/Hanken+Grotesk) | Latin (Cyrillic unverified) | wght | Classic grotesque, quiet |
| **Mona Sans** (https://fonts.google.com/specimen/Mona+Sans) | Latin (+ more, unverified) | wght + wdth (+ italic) | GitHub's face. Strong character |
| **Noto Sans Devanagari** (https://fonts.google.com/noto/specimen/Noto+Sans+Devanagari) | Devanagari (+ basic Latin) | wght 100–900 + wdth | The safe, neutral fallback. Noto covers nearly every script for future locales |
| **Anek Devanagari** (https://github.com/EkType/Anek) | Devanagari; the Anek family covers 9 Indic scripts + Latin | wght + wdth | Harmonised multi-script superfamily by Ek Type. Best if Mira expands to more Indian scripts |
| **Mukta** (https://github.com/EkType/Mukta) | Devanagari, Gujarati, Gurmukhi, Tamil, Latin | **static**, 7 weights | Humanist and mono-linear. Pairs calmly with humanist or geometric Latin |
| **Tiro Devanagari Hindi** (https://fonts.google.com/specimen/Tiro+Devanagari+Hindi) | Devanagari + Latin transliteration | static, Regular + Italic only | Literary serif. Editorial accents only, not UI |

**`next/font` implications** (read from `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`):
- `next/font/google` downloads at build time and **self-hosts**, so no request goes to Google at runtime. That is good for privacy.
- `subsets` controls which subsets get `<link rel=preload>`. `preload` defaults to true. Each subset is emitted as its own `@font-face` with a `unicode-range`, so the browser fetches the Devanagari file **only when Devanagari glyphs render**.
- Recommended setup:
  - Latin face: `subsets: ["latin"]`, preloaded, `display: "swap"`, `variable: "--font-sans"`.
  - Devanagari face: `Noto_Sans_Devanagari({ subsets: ["devanagari"], preload: false, variable: "--font-deva" })`.
  - Stack: `font-family: var(--font-sans), var(--font-deva), system-ui, sans-serif`.
- `adjustFontFallback` (default true for google fonts) generates a metric-matched fallback to cut CLS.
- Only the `wght` axis is included by default. Extra axes such as `opsz` or `wdth` must be requested via `axes`, which makes the file larger.
- Also set `<html lang>` per locale so Devanagari shaping and hyphenation work.

**Sizes:** a Latin-subset variable woff2 (wght only) is typically ~25–50 kB. A Devanagari variable woff2 is larger, approximately 80–150 kB (approx, **unverified**, check the build output). This is why `preload: false` matters for the Devanagari face.

**Recommendation (ADOPT, static assets not JS deps):**
- Keep one Latin variable face. Either keep Plus Jakarta Sans, or move to **Instrument Sans** or **Figtree** for a calmer, less over-used look. Avoid Inter and Geist as they read as default.
- Add **Noto Sans Devanagari** as the lazy companion. Consider **Anek** if more Indic scripts are planned (one designer's hand across scripts).
- Use `tabular-nums` for ETAs, distances and times.

### 10. Haptics on the web

**`navigator.vibrate()`**
- **Supported:** Chromium on Android (Chrome, Edge, Samsung, Opera).
- **Not supported on Safari iOS** at any version. caniuse (Sep 2026) lists Safari iOS 3.2–27.2 as unsupported, and WebKit has never shipped it.
- **Firefox desktop removed it in v129** (Aug 2024). Firefox Android shows "partial" on caniuse.
- It needs **sticky user activation** (a prior user gesture) and does nothing in silent or DND on some devices.
- A 2026 issue claims it works on iOS Safari (https://github.com/mdn/browser-compat-data/issues/29166). It is untriaged, and the test page likely uses the switch polyfill below, so treat it as **unverified**.
- Sources:
  - https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
  - https://caniuse.com/mdn-api_navigator_vibrate

**The iOS `<input type="checkbox" switch>` trick**
- **Where it comes from:** WebKit shipped the native switch control in Safari **17.4**. Toggling a real switch plays the system haptic.
  - Libraries such as https://github.com/tijnjh/ios-haptics overlay a transparent `<label>` over the tapped element, wired to a hidden switch, so the user's tap toggles it.
  - This is not the iOS 18 feature it is sometimes called. The switch arrived in 17.4. iOS 18 is simply where it became widely noticed.
- **iOS 26.5 restriction:** WebKit change fc1ef83 (bug 309082) makes a *programmatic* `label.click()` reach the switch as **untrusted**, and untrusted clicks produce no haptic.
  - Scripted, "fire haptic from JS anytime" usage worked on iOS 17.4–26.4 and **no longer works on 26.5+**.
  - Only a haptic riding directly on a real user tap still works, and multi-tick patterns degrade to a single tick. https://haptics.kushagragolash.dev/
- **Risks:**
  - It is a hack that depends on undocumented behaviour that Apple has already narrowed once.
  - The invisible overlays can interfere with hit-testing, scrolling and screen readers.
  - It must be hidden from AT (`aria-hidden`, `tabindex=-1`), and the switch still exists in the DOM.

**Guidance for Mira:**
- Use `navigator.vibrate?.(10)` for confirmations on Android (e.g. SOS armed, arrival confirmed), behind feature detection and a user setting.
- **Never make haptics the only signal** for a safety-critical state. Pair it with visual and text feedback, and with `aria-live` where relevant.
- For iOS, if you want it, use a *real* visible `<input type=checkbox switch>` for genuine toggles (e.g. "share live location"). You get native haptics legitimately, without overlay hacks.

**Verdicts:**
- `navigator.vibrate`: ADOPT, as zero-dep progressive enhancement.
- iOS overlay libraries: REJECT.
- Native switch for real toggles: ADOPT.
- DIY overlay trick: CONSIDER LATER at most.

---

### Concrete zero-dependency follow-ups suggested by this research (not done; for the team to decide)

1. **BottomSheet:**
   - Animate `transform: translateY` instead of `height`.
   - Write the drag offset straight to `ref.current.style` during pointermove, not `setState`.
   - Track release velocity; above ~0.4 px/ms, project to the next snap in the flick direction (Vaul constant).
   - Use `--ease-sheet` at ~450–500 ms.
   - Call `map.easeTo({ padding.bottom })` on snap change.
   - Under `prefers-reduced-motion`, snap instantly or use opacity only.
2. **Motion tokens:** add them as CSS custom properties in `globals.css` (§8), and use the Tailwind `starting:` variant for toast and dialog entry.
3. **Modals:** use native `<dialog>`, with a manual backdrop click because Safari lacks `closedby`.
4. **Toast:** add swipe-dismiss and pause-while-hidden (Sonner ideas). Keep `role=status`, and use `role=alert` only for safety-critical messages.
5. **Basemap:** add Google `styles` to hide `poi.business` and transit icons. Cluster and sort-key Mira's own pins.
6. **Fonts:** add the Devanagari companion via `next/font` with `preload: false`. Consider a less-generic Latin face.
7. **Design audit:** do a one-off pass against the frontend-design and Impeccable anti-pattern lists (glass, purple shadow, 2rem radii, all-caps labels).

---

# Part 4 — Real user feedback (USER_SIGNAL vs DESIGN_INTERPRETATION)


Researched 2026-09-28 for MIRA. MIRA is a calm personal-safety and real-world intelligence PWA. It covers journeys, live location sharing to trusted contacts over WhatsApp, community reports, an AI companion, Help Points and emergency access.

**Method.** I ran web searches and fetched press pieces, peer-reviewed or conference papers, vendor help pages and review aggregators. Everything below is paraphrased. Each topic has at most one short quote. Where a source could not be fetched (the ACM DL returned 403), the claim comes from the abstract or search snippet, and the entry says so.

**Confidence scale.**
- **High:** the complaint recurs across many independent sources, or is documented by press or research.
- **Medium:** a few sources, or mostly one type of source.
- **Low:** anecdotal, or I could not find it directly.

---

### 1. Life360 (surveillance feel, teen/family tension, battery, data selling)

**USER_SIGNAL (high):** The Markup found that Life360 sold precise location data on its users, including kids and families, to about a dozen data brokers (Cuebiq, X-Mode, SafeGraph, Arity and others). The company then said it would stop selling precise data to most of them, but kept Arity and aggregated sales to Placer.ai. A lawsuit followed in 2023.
- https://themarkup.org/privacy/2021/12/06/the-popular-family-safety-app-life360-is-selling-precise-location-data-on-its-tens-of-millions-of-user
- https://appleinsider.com/articles/22/01/28/life360-to-stop-selling-precise-location-data-of-users
- https://themarkup.org/privacy/2023/06/01/life360-sued-for-selling-location-data

**USER_SIGNAL (high):** Teens hated being tracked so much that mocking and evading Life360 became a TikTok meme, and CBS covered teens teaching each other to beat it. Life360 responded with "Bubbles", which shows a fuzzy radius for a set time instead of an exact point. That feature was co-designed after the CEO talked with teens on TikTok.
- https://techcrunch.com/2020/10/12/family-tracking-app-life360-launches-bubbles-a-location-sharing-feature-inspired-by-teens-on-tiktok
- https://cbsnews.com/amp/losangeles/news/teens-hacking-tracking-app-life360

**USER_SIGNAL (high):** Reviews repeatedly report wrong locations and phantom trips that cause family fights. Examples include "arrived home" while still half a mile away, three people in the same car shown in three places, and a 123 mph "speeding" alert on a train. Ratings split sharply: about 4.8 on the App Store but 1.6 on Trustpilot, where 70% of reviews are one star. Battery drain from constant background tracking is a common complaint, and dead phones then turn into arguments.
- https://www.trustpilot.com/review/life360.com
- https://unstar.app/blog/life360-location-not-updating-accuracy-app-reviews-2026
- https://findmykids.org/blog/en/why-life360-is-bad

**DESIGN_INTERPRETATION:**
- Sharing should be time-boxed and tied to a journey. It should end itself and never be "always-on".
- The person sharing is the one who starts and stops it. Viewers cannot demand it.
- Offer coarse or "area" precision as a first-class option, like Bubbles.
- Never infer or broadcast judgemental events such as speeding or "arrived" unless confidence is high. Show accuracy and staleness honestly, for example "last seen 4 min ago, ±80 m", so a GPS glitch does not become a family accusation.
- State plainly on-screen that location is never sold or shared with brokers. Keep retention short.
- Battery: prefer event-driven or adaptive update rates, and show the battery cost while sharing is on.

---

### 2. Citizen (fear-mongering, anxiety, vigilante incident, notification fatigue)

**USER_SIGNAL (high):** In May 2021 Citizen pushed a photo of an innocent man to about 860,000 LA users as the suspected Palisades fire arsonist, with a $30k bounty. He was not the suspect, and Citizen publicly admitted the mistake. Vice's reporting and leaked internal messages described leadership chasing vigilante engagement. The app had launched in 2016 as "Vigilante" and Apple removed it from the App Store.
- https://www.sfgate.com/california-wildfires/article/citizen-app-california-palisades-wildfire-reward-16185996.php
- https://www.vice.com/en/article/inside-crime-app-citizen-vigilante/
- https://www.vice.com/en/article/lapd-emails-citizen-palisades-wildfire-manhunt/
- https://en.wikipedia.org/wiki/Citizen_(app)

**USER_SIGNAL (high):** A CHI 2023 case study (Atlanta interviews plus UI analysis) found that Citizen raises users' safety anxiety and then steers them toward paid security features such as Protect. The authors proposed adding "emotional load" and "social injustice" to the taxonomy of deceptive-design harms. Participants described alerts about fires, helicopters and "gunshots" that turned out to be backfires, and compared it to crying wolf. Press accounts describe the same anxiety loop, and a NYC council member argued the app makes a safer city feel like a hellscape.
- https://dl.acm.org/doi/10.1145/3544548.3581258 (abstract; full text returned 403)
- https://www.mic.com/life/the-citizen-app-is-a-relentless-anxiety-trigger-18790347
- https://www.buzzfeednews.com/article/justinbrannan/nyc-brooklyn-safe-citizen-app-freakout
- https://abc7news.com/post/citizen-app-notifies-users-of-nearby-danger/5302454/

**DESIGN_INTERPRETATION:**
- MIRA's calm positioning is directly validated. Avoid a real-time crime feed, red pulsing alerts and push notifications for incidents that do not affect the user's route or place.
- Never publish identifiable people (faces, names, descriptions of suspects) in community reports.
- Do not monetise fear. No "upgrade to feel safe" upsells next to incident content.
- Put context next to any risk signal, such as base rate, recency and "this is unverified".
- Alerts should be opt-in, route- or place-scoped and rate-limited.

---

### 3. Noonlight (hold-button UX, false alarms)

**USER_SIGNAL (medium):**
- *How it works:* You hold an on-screen button. On release you have 10 seconds to enter a PIN, or dispatch treats it as an emergency. Dispatchers call and text first to verify.
- *What people like:* It is low-effort and works even if the phone is knocked away.
- *Reviews describe false alarms:* a toddler pressing it twice, and a phone falling off a charger overnight, both leading to calls and police.
- *SafeWise's criticisms:* toddlers can trigger it, the PIN can be viewed in settings by someone holding the phone, Android lags iOS, it is US-only, and municipalities may charge for false alarms.
- https://www.safewise.com/noonlight-review/
- https://help.noonlight.com/en/articles/2114600-how-does-the-button-work
- https://apps.apple.com/us/app/noonlight-feel-protected-24-7/id716262008

**DESIGN_INTERPRETATION:**
- Dead-man switches work, but they need a forgiving, verified cancel path. Use a human- or contact-verification step before anything escalates to authorities.
- MIRA escalates to trusted contacts over WhatsApp, not to police. That is a lower-cost false alarm, so a false alarm should cost a quick "I'm fine" rather than a police visit.
- Never auto-call emergency services from the app.
- Show a clear countdown with a large cancel target.
- Keep the cancel PIN or secret out of readable settings.

---

### 4. Google Personal Safety and Apple Check In (what users like; complaints)

**USER_SIGNAL (medium): what people like.**
- *Apple Check In:* It auto-detects arrival and quietly tells the chosen contact. If progress stalls, it prompts you first, then escalates after 15 minutes of no response. You choose Limited sharing (location, battery, signal) or Full (adds route and last unlock).
- *Google Safety Check:* You set an activity and a duration from 15 minutes to 8 hours, and it auto-starts Emergency Sharing if you do not respond.
- Reviewers repeatedly praise how little effort both take and the peace of mind they give.
- https://tomsguide.com/news/ios-17-check-in-explained-heres-how-the-new-safety-feature-works
- https://support.apple.com/guide/iphone/use-check-in-iphc143bb7e9/ios
- https://www.androidpolice.com/pixel-personal-safety-app-explainer/

**USER_SIGNAL (low–medium): complaints.**
- Check In needs both people on iOS 17+ in iMessage.
- A lost phone mid-Check-In looks exactly like "not responding" to the contact.
- Reddit users reported iOS suggesting a Check In with an ex, including someone they had been no-contact with.
- Android users reported the Personal Safety app auto-calling 911 after an OS update.
- https://www.aol.com/iphones-suggesting-people-check-exes-223053601.html
- https://support.google.com/android/answer/9319337?hl=en

**DESIGN_INTERPRETATION:**
- This is the model to copy. Automatic arrival, a silent success path, and a nudge to the user before anything reaches contacts.
- Use tiered data-sharing levels chosen per journey.
- MIRA's WhatsApp route solves the platform lock-in that limits Check In to iOS-to-iOS. Make that a headline benefit.
- Never auto-suggest contacts from behavioural signals. Only use contacts the user has explicitly added to their Circle.
- Tell contacts what "no response" means and what it does not mean, for example "phone may be dead or lost".

---

### 5. Safetipin and women's safety apps generally

**USER_SIGNAL (high): research critique.**
- A CHI 2025 extended abstract ("The Safest Woman Alive") critiques solutionist HCI that puts the work of avoiding violence on women: buy the app, learn it, reorganise your life around it.
- A scoping review found:
  - violence-support practitioners are largely sceptical of panic-alarm apps and worry they reinforce victim-blaming;
  - some women found such apps unnecessary compared with ordinary calling or texting;
  - abusive partners checking phones is a barrier, so women asked for disguised icons and quick-exit;
  - what women valued was discreetness, having information in one place, and concrete guidance on what to say or do.
- Fiona Vera-Gray's work on "safety work" describes the invisible, tiring strategies women already perform, such as rerouting, avoiding night travel and changing seats. These cost time and energy and cannot actually guarantee safety.
- Karusala and Kumar (CHI 2017) studied India's mandated phone panic buttons. They found women's sense of safety depends on personal, social, public and technological factors lining up, and that a button alone does not supply that.
- https://dl.acm.org/doi/10.1145/3706599.3716240
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8719390/
- https://bristoluniversitypress.co.uk/the-right-amount-of-panic
- https://www.sciencedirect.com/science/article/pii/S1077291X26000238
- https://www.researchgate.net/publication/316653594_Women's_Safety_in_Public_Spaces_Examining_the_Efficacy_of_Panic_Buttons_in_New_Delhi

**USER_SIGNAL (medium): Safetipin as the positive model.**
- Safetipin's structured audits (lighting, openness, visibility, crowd, security, walkway, transport, gender mix, feeling) produced city data that councils acted on.
- About 7,000 dark spots in Delhi were identified in 2016, and several were fixed within a year.
- Bogotá used the data to shape lighting work.
- https://safetipin.com/what-is-a-safety-audit/
- https://blogs.adb.org/blog/using-data-improve-womens-safety-cities-transport
- https://www.researchgate.net/publication/274265668_SafetiPin_an_innovative_mobile_app_to_collect_data_on_women's_safety_in_Indian_cities

**DESIGN_INTERPRETATION:**
- Do not build around a panic button. Frame MIRA as reducing the "safety work" users already do (planning, checking in, getting home) rather than adding tasks.
- Frame around environmental conditions (lighting, footfall, flooding), not dangerous people. That shifts responsibility toward places and institutions, following the Safetipin model, and away from blaming individuals.
- Add a discreet mode: a neutral app name and icon, quick-exit, and no lock-screen content.
- Expect low sustained use of emergency features. Value comes from everyday utility, such as journeys and conditions.

---

### 6. Nextdoor (racial profiling; friction redesign)

**USER_SIGNAL (high):**
- Crime and Safety posts often described "suspicious" Black men doing nothing more than walking.
- In 2016 Nextdoor redesigned the posting flow:
  - users describe the behaviour first;
  - if race is mentioned, at least two other physical descriptors are required;
  - an algorithm checks for racially charged terms, and profiling guidance is embedded in the flow.
- Nextdoor reported a 75% reduction in racial-profiling posts. Some engineers had pushed back, preferring suggestions over requirements.
- The later "Kindness Reminder" prompt led about 1 in 5 early viewers to edit their comment (about 20% fewer negative comments). Later versions reached 36% editing or withholding and a 15% reduction in guideline violations.
- https://www.npr.org/sections/alltechconsidered/2016/08/23/490950267/social-network-nextdoor-moves-to-block-racial-profiling-online
- https://techandsocialcohesion.substack.com/p/how-nextdoor-reduced-racial-bias
- https://engblog.nextdoor.com/the-kindness-reminder-868252995140
- https://about.nextdoor.com/press-releases/nextdoor-announces-new-feature-to-promote-kindness-in-neighborhoods

**DESIGN_INTERPRETATION:**
- Community reports should use structured categories about conditions and events (lighting out, flooding, harassment occurred here at this time), not free-text descriptions of people.
- If harassment reports allow free text, add friction: behaviour-first fields, no appearance or ethnicity fields, and an AI check that prompts a rewrite before posting.
- Good friction is a feature. It measurably improves quality.

---

### 7. Waze (report accuracy, "still there?", police-report controversy)

**USER_SIGNAL (medium–high):**
- *Report decay and confirmation:* Hazard reports decay over time, roughly an hour by default. Passing drivers can confirm with "Still there / thumbs up" or remove with "Not there", which shortens the report's lifetime.
- *Frustrations:* Users complain both about stale reports and about having to re-report real hazards after they expire.
- *Police reporting:* In 2019 the NYPD sent Google a cease-and-desist over DWI-checkpoint reporting. Google kept the feature, and commentators treated it as protected speech.
- *Signal manipulation:* Simon Weckert's 99-phone wagon created a fake traffic jam on Google Maps in Berlin in 2020. It showed how easily crowdsourced signals can be spoofed.
- https://support.google.com/waze/answer/13739290?hl=en
- https://www.waze.com/discuss/t/newbie-how-long-do-reported-hazards-remain-on-map/64592
- https://support.google.com/waze/thread/317412530/reported-a-hazard-and-it-was-still-there-on-my-next-trip-but-i-had-to-report-it-again-24-hrs-later?hl=en
- https://slate.com/technology/2019/02/nypd-waze-dwi-checkpoints-lawsuit-first-amendment.html
- https://www.washingtonpost.com/technology/2020/02/04/google-maps-simon-weckert/

**DESIGN_INTERPRETATION:**
- Every MIRA report needs a category-specific TTL. A harassment incident fades within hours, flooding lasts a day or so, a broken streetlight lasts until it is fixed.
- Offer one-tap "still there / gone" confirmation to people passing nearby, and show "confirmed by N · last confirmed 20 min ago".
- Let persistent infrastructure issues survive, so they are not repeatedly re-reported.
- Do not treat co-located device clusters as independent confirmations. Rate-limit per account and device.
- Avoid a "report police/enforcement" category. It is legally and ethically fraught and off-mission.

---

### 8. Crowdsourced civic reporting (SeeClickFix, FixMyStreet)

**USER_SIGNAL (high):**
- mySociety's 11-year FixMyStreet study with Stirling and Sheffield found that a successful first report (the issue got fixed) was associated with a 54% higher chance of the person submitting a second report. Ignored reports risk permanently alienating first-time reporters.
- Participation is unequal. Higher-income areas report more and get faster responses (Brussels study, 2025 neighbourhood-equity study). Visible case histories and staff updates are the core "close the loop" mechanism.
- https://research.mysociety.org/publications/fixmystreet-geography-neighbourhood-issues
- https://www.researchgate.net/publication/386674193_FixMyStreet_Brussels_Socio-Demographic_Inequality_in_Crowdsourced_Civic_Participation
- https://www.sciencedirect.com/science/article/abs/pii/S0264275125000162
- https://thecityfix.com/blog/see-click-fix-repeat/

**DESIGN_INTERPRETATION:**
- The most important retention lever for community reports is telling reporters what happened: "3 people confirmed", "sent to council", "marked fixed", "helped 41 people reroute".
- Build a visible report lifecycle: submitted → confirmed → forwarded → resolved/expired.
- Account for reporting bias. Absence of reports is not safety, so say "few reports here", never "safe area". Do not let report density alone drive a place's score.

---

### 9. Google Maps Local Guides (gamification, spam, points farming)

**USER_SIGNAL (medium–high):**
- Points and levels reward volume. SEO practitioners and Local Guides members report point-farming accounts posting low-effort or fake reviews and photos, including high-level guides.
- Some local-SEO experts treat a Local Guide badge as a spam signal.
- Search Engine Land and others call gamification a root cause of review-quality problems.
- The program had about 150 million members by 2023.
- https://searchengineland.com/guide/google-local-guides-program-wins-woes-what-next
- https://www.localguidesconnect.com/t/moderator-assistance-needed-to-report-a-level-7-point-farming-spammer/577340
- https://seono.co.uk/2018/01/17/google-reviews-are-broken/
- https://www.cucocreative.co.uk/articles/google-local-guides-and-fake-reviews-left-for-your-business

**DESIGN_INTERPRETATION:**
- No points, levels, streaks or leaderboards for safety reports. Volume incentives in a safety context produce fabricated or exaggerated danger.
- Recognition should be based on impact and qualitative ("your report was confirmed by others"), and private by default.

---

### 10. Trust and reputation systems (volume gaming vs. bridging)

**USER_SIGNAL (medium):**
- Volume-based leaderboards are well documented to have mixed effects on quality in crowdsourcing research.
- X/Twitter Community Notes uses a "bridging" matrix-factorisation algorithm. A note is shown only if raters who usually disagree both rate it helpful. Studies (PNAS 2025) find displayed notes reduce engagement with and diffusion of false posts.
- The main limitation: most notes never reach consensus, and help often arrives slowly.
- https://arxiv.org/html/2510.09585v4
- https://www.pnas.org/doi/10.1073/pnas.2503413122
- https://www.pnas.org/doi/10.1073/pnas.2524004122
- https://arxiv.org/pdf/1707.03704 (leaderboard effects)

**DESIGN_INTERPRETATION:**
- Report trust should come from independent confirmations: different people, devices, times, and ideally different neighbourhoods or usage patterns. Not from how many reports someone has filed.
- Weight a reporter's past accuracy (confirmed vs. "not there"), not their volume.
- Accept that some reports stay "unverified", and label them honestly rather than hiding or promoting them.

---

### 11. Map clutter / too many pins

**USER_SIGNAL (medium):**
- NN/g documents that dense pins on mobile maps can't be tapped accurately. Aggregation into numbered clusters is the standard fix.
- Google itself tested smaller, icon-less pins at low zoom to reduce clutter.
- Users pushed back on promoted and sponsored pins appearing in navigation, including one appearing unprompted, which Google called unexpected behaviour.
- https://www.nngroup.com/articles/mobile-maps-locations/
- https://www.phonearena.com/news/change-to-google-maps-pins-makes-the-app-look-less-cluttered_id167433
- https://www.tomsguide.com/computing/mobile-apps/pop-up-ads-in-google-maps-that-shouldnt-be-happening-says-google
- https://www.researchgate.net/publication/334472260_Rethinking_the_usage_and_experience_of_clustering_markers_in_web_mapping

**DESIGN_INTERPRETATION:**
- Default the map to the user's route or place context, with minimal layers.
- Cluster reports, and render conditions as soft area or segment shading (for example, a dim street segment for poor lighting) rather than pin storms.
- Show more detail as the user zooms in.
- No commercial pins in a safety product.
- A map full of red markers is itself a fear pattern (see Citizen).

---

### 12. Emergency interfaces (accidental SOS triggers)

**USER_SIGNAL (high):**
- *Android:* Android 12+ Emergency SOS (press power 5 times) caused a record surge of silent accidental 999 calls in the UK in 2023. Police nationally asked users to check their settings. Google later added a press-and-hold confirmation.
- *iPhone:* iPhone 14 Crash Detection auto-dialled 911 on roller coasters (Kings Island had six false calls) and ski slopes. In Japan's Hida Mountains, 134 false calls made up more than 14% of volume over about five weeks. Summit County, Colorado saw up to 20 a day.
- https://www.northwales.police.uk/news/north-wales/news/news/2023/june/police-forces-nationally-encourage-android-users-to-check-emergency-settings
- https://thenextweb.com/news/uk-police-report-epidemic-android-false-emergency-calls
- https://tomsguide.com/news/google-just-made-an-important-android-phone-change-to-avoid-accidental-911-calls-what-you-need-to-know
- https://www.abc4.com/news/iphones-crash-detection-feature-triggered-by-some-roller-coasters-dialing-911/
- https://amp.cbc.ca/news/canada/edmonton/hello-what-s-your-emergency-iphone-14-wrongly-dialling-911-on-alberta-ski-hills-1.6734782

**DESIGN_INTERPRETATION:**
- Emergency access must be reachable in 1–2 deliberate actions, but never by a pocket-able gesture.
- Use press-and-hold with visible progress plus a cancel countdown.
- Never auto-dial authorities from sensor inference.
- Hand off to the native dialer (tel:) with local numbers, so the OS and the user stay in control.
- Put Help Points and "call local emergency number" on one calm screen, not behind a big red floating button that gets hit accidentally.

---

### 13. Privacy and location sharing (stalkerware, AirTag misuse, consent)

**USER_SIGNAL (high):**
- Freed, Dell, Ristenpart and others (CHI 2018, "A Stalker's Paradise"; IEEE S&P 2018 spyware study) show intimate-partner abusers exploit ordinary location-sharing features and spyware. Survivors often cannot tell they are being tracked.
- AirTag lawsuits (2022–2026) allege delayed or missing unwanted-tracking alerts, weak Android protection, and that victims had to physically find the tag. Apple's own records reportedly show more than 40,000 stalking-related reports between 2021 and 2024.
- https://dl.acm.org/doi/10.1145/3173574.3174241
- https://www.researchgate.net/publication/326646794_The_Spyware_Used_in_Intimate_Partner_Violence
- https://dl.acm.org/doi/fullHtml/10.1145/3491102.3502038
- https://www.aboutlawsuits.com/apple-airtag-lawsuit/
- https://www.gadgetreview.com/airtag-stalking-victim-says-her-iphone-never-warned-her-now-shes-suing-apple

**DESIGN_INTERPRETATION:**
- Design the share feature against its abusive use. A partner with the unlocked phone should not be able to set up silent, indefinite sharing to themselves.
- Every share should be visible to the sharer: a persistent in-app banner, auto-expiry, and a list of who can see and until when.
- Only the sharer can revoke or stop, and must be able to do it instantly.
- Periodically ask "still want X to see your journeys?" for recurring shares.
- WhatsApp tap-to-send, where the user explicitly sends a link, is structurally safer than silent background sharing. Keep it that way.

---

### 14. AI-generated UI complaints ("AI slop" design)

**USER_SIGNAL (high among designers and developers, 2024–2026):**
- Designers and developers widely mock a recognisable "vibe-coded" look:
  - purple-to-blue gradients and untouched shadcn violet/grey;
  - Inter or Poppins, Lucide icons, and emoji inside coloured boxes;
  - centred hero with three feature cards;
  - glassmorphism and rounded corners on everything.
- There are now open-source audit tools and design "skills" built specifically to strip these tells out.
- https://github.com/funboy322/avoid-ai-design
- https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
- https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
- https://www.925studios.co/blog/ai-slop-design-tells

**USER_SIGNAL (high): trust in AI output is falling.**
- Stack Overflow 2025: only 29% of developers trust AI output, down 11 points.
- The top frustration (66%) is answers that are "almost right, but not quite".
- https://survey.stackoverflow.co/2025/ai

**DESIGN_INTERPRETATION:**
- A safety product that looks templated reads as untrustworthy. Give MIRA a distinct, restrained visual identity.
- Use a considered palette tied to meaning: night, lighting and calm, with no default violet.
- No emoji as UI icons, and a real type choice.
- Keep density and information design ahead of decoration.
- AI output must show confidence and sources, because "almost right" is dangerous in safety contexts.

---

### 15. AI chatbots bolted onto apps

**USER_SIGNAL (high):**
- *Meta AI in WhatsApp:* Users were angry at the Meta AI button and "Ask Meta AI or Search" bar that could not be removed. WhatsApp called it optional yet it was un-removable, and an MEP raised it with the EU Commission.
- *Gartner:* Customers are about three times more likely to use third-party GenAI than a company's own chatbot, and company chatbot use has been flat since 2022.
- *Pew (June 2025):* 50% of US adults are more concerned than excited about AI in daily life, up from 37% in 2021. A majority want more control over how AI is used in their lives.
- *CNBC (2026)* reports continuing "I hate customer-service chatbots" sentiment.
- https://www.techradar.com/computing/websites-apps/whatsapp-users-fume-over-new-meta-ai-button-that-you-cant-remove-heres-what-it-does
- https://www.cmswire.com/customer-experience/gartner-genai-findings-suggest-customers-dont-care-about-your-ai/
- https://www.pewresearch.org/science/2025/09/17/ai-in-americans-lives-awareness-experiences-and-attitudes/
- https://www.cnbc.com/2026/04/01/ai-chatbot-customer-service-complaints-refunds.html
- https://pushyourpixels.com/articles/so-many-chatbots-so-little-point

**DESIGN_INTERPRETATION:**
- MIRA's AI companion should mostly be invisible, surfacing answers and actions in context. For example:
  - "This route has 2 poorly lit segments; the alternative adds 3 min";
  - "Share this journey with Priya?";
  - a one-line summary of a place.
- Chat should be a secondary, optional surface, not the home screen and not a floating bubble that can't be dismissed.
- Let users turn AI features off.
- Never let the AI fabricate safety facts. When data is thin, say so.

---

### Top 12 recurring complaints MIRA must design against

1. **Fear-feed anxiety** (Citizen, Nextdoor, map pin storms). Incident streams and red alerts make safe places feel dangerous and drive compulsive checking. *High.*
2. **Always-on surveillance feel** (Life360, stalkerware). Indefinite, precise tracking that the tracked person does not control damages relationships and enables abuse. *High.*
3. **Selling or leaking location data** (Life360 and brokers, AirTag). Trust is destroyed by the discovery, not the policy. *High.*
4. **Inaccurate location or events causing real-world conflict** (Life360 phantom trips, false "arrived", false speeding). *High.*
5. **Accidental emergency triggers** (Android 5-press, crash detection, Noonlight toddler or charger). Easy gestures plus auto-escalation create false calls. *High.*
6. **Vigilantism and profiling in community content** (Citizen bounty, Nextdoor "suspicious person"). Reports about people rather than conditions cause harm. *High.*
7. **Stale or unverified reports** (Waze expiry and re-report frustration, spoofable signals). *Medium–high.*
8. **Reporting into a void** (FixMyStreet). With no feedback on outcomes, first-time reporters never return. *High.*
9. **Gamified volume leading to spam and fabricated reports** (Local Guides point farming). *Medium–high.*
10. **Safety burden and panic-button framing** (women's safety app research). Apps add "safety work" and imply victims are responsible, and panic buttons go unused. *High in research, medium in user reviews.*
11. **Battery drain and background resource use** (Life360). *Medium–high.*
12. **Unwanted AI chat and generic AI-slop UI** (Meta AI in WhatsApp, Gartner, Pew, designer backlash). This reads as low-effort and untrustworthy, and people want answers and control. *High.*

### Top 6 things users actually value

1. **Low-effort, automatic reassurance.** Apple Check In and Google Safety Check style: set a destination, it notices arrival and quietly tells the right person, and only escalates after asking you first.
2. **Control over what is shared, with whom, and for how long.** Time-boxed sharing, precision levels (Bubbles, Limited vs Full) and instant stop.
3. **Accurate, fresh, honest information.** Confirmed or recent reports with visible age and confidence, rather than volume.
4. **Seeing that contributing mattered.** Closed-loop feedback (fixed, confirmed, helped others) drives repeat participation (+54% in the FixMyStreet study).
5. **Discretion and privacy.** Discreet UI, no data selling, quick-exit, sharing through channels people already use (WhatsApp).
6. **Concrete, actionable guidance over generic alarm.** "What to do or say next", nearby help, better-lit alternatives. This is valued more than a chatbot or a panic button.

---

#### Gaps and caveats
- The full CHI 2023 Citizen paper and the CHI 2019 "Personal Safety App Effectiveness" paper were behind 403s. Claims about them come from the abstracts and secondary summaries.
- Direct Reddit threads were not fetched. Reddit-sourced signals (Life360, Check In) come from press or aggregators that quote them. Positive user sentiment for Apple Check In is inferred from press reviews, not first-hand forums. *Low–medium.*
- I found no specific Verge article on Citizen notification fatigue. That signal rests on the CHI paper, Mic, BuzzFeed and ABC7.
