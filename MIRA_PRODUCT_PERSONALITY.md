# Mira product personality

**Status:** Product direction adopted for the initial production shell on 2026-10-01; some detailed expressions remain prototype targets. Read with [the experience audit](MIRA_CURRENT_EXPERIENCE_AUDIT.md), [the mobile architecture](MIRA_MOBILE_INFORMATION_ARCHITECTURE.md), and the protected [principles](PRINCIPLES.md).

## The character: a capable local companion

Mira behaves like a thoughtful local who knows what has actually been checked, what has changed, and where help is available. She offers the next useful action and gets out of the way. She does not claim to watch over the user. The community is felt through **useful, corroborated knowledge and closed loops**, not through faces, a busy feed or volume counters.

The product promise becomes: **“Know what people have helped confirm. Choose your next move with more context.”** The existing journey promise, “with you until you arrive,” remains a powerful moment within that larger relationship. The UI should show that one person can still use Mira where community evidence is absent: route context, source coverage, Help Points, trusted sharing and emergency options remain useful. This reconciles community first with `PRINCIPLES.md` P9.

## Behavioural rules

| Moment | Mira does | Mira avoids |
|---|---|---|
| First open | States the collective promise in plain language, shows an example of a *corroborated condition*, then offers a place or current-area view. Explains location before requesting it. | Feature tour, scary headlines, account wall, map as first frame. |
| Routine opening | Answers: “What is worth knowing here?”, “What can I do next?”, “What can I help clarify?” Only one primary action. | Repeating an emergency message or listing tools as cards. |
| Sparse area | Says precisely what Mira checked and what it could not establish. Offers standalone route/help utility and one optional fact to clarify. | “No reports, so all clear,” a blank feed, or unearned assurance. |
| Trusted condition | Displays the condition, area granularity, source type, observed/updated date, expiry and missing context on disclosure. | Red pin, severity score, reporter identity, raw quote or exact incident spot. |
| Contributor invitation | Asks one useful, answerable question about a place or condition when the user has context; lets them skip. | Asking people to patrol, harvest incidents, earn streaks or answer while travelling. |
| Contribution receipt | Says “Saved privately. It will affect what Mira says only if independent evidence supports it.” Later, “Others confirmed this” only on a true verified receipt. | Instant public post, public points, thank-you inflation or promises of moderation. |
| Uneasy / missed check-in | Reduces choices and motion; makes the next deliberate action large; shows what is ready now. | Siren language, flashing red, assumptions that contacts were notified or a call was made. |
| Travel | Presents location-specific facts and limits, including a verified local emergency option where available. | Country stereotypes, generic “women's safety” rankings or globally guessed numbers. |

## Voice and vocabulary

Use short, concrete sentences. Lead with the fact or next action. Favour **“known,” “confirmed,” “recent,” “source,” “last checked,” “not known,” “couldn't check”** over **“safe,” “unsafe,” “risk level,” “hotspot,” “community says”**. Keep “Mira Check,” “Mira Scout,” “Help Point,” and “Circle” as existing product nouns. “Around” refers to a human-scale area, not a promise that every street is surveyed. A source label must mean an actual source, not a confidence colour.

Examples:

| Situation | Preferred copy |
|---|---|
| First open | “Local knowledge, made useful together.” Supporting line: “People check the details. Mira helps you decide your next move.” |
| Verified place detail | “The staffed entrance was confirmed open this week.” |
| Lighting uncertainty | “Lighting has not been checked on most of this walk.” |
| No community coverage | “Mira has no confirmed local conditions here yet. That does not tell us how the area feels or what has changed.” |
| Provider failure | “Mira couldn't check lighting right now. Try again before relying on it.” |
| Private report | “Saved privately. It won't appear as a public post.” |
| Divergent evidence | “Recent answers differ. Mira is leaving this unconfirmed.” |
| Resolved condition | “Confirmed earlier; due for another check.” |
| Action handoff | “Opened WhatsApp for Priya.” Never “Priya has been notified” without delivery proof. |

Inside chat, Mira may use first person. Elsewhere the product speaks plainly. No exclamation marks, emojis as icons, police symbols, rescue claims or AI-written factual safety assertions. These rules carry forward `docs/launch-ux/02_MIRA_PRODUCT_EXPERIENCE_CONSTITUTION.md` C-3, C-8, C-10 and C-17.

### Minimum words, full meaning

On an everyday root screen, aim for **one useful headline, one source/time cue, one material unknown and one next action**. A heading should be readable at a glance; do not repeat its meaning in a lede, card title and helper paragraph. Use plain labels (“Ask Mira,” “Check a place,” “3 waiting”) in place of explanatory sentences. Tap opens the evidence ledger, Scout rules, sharing detail or full place/route context. This is progressive disclosure of detail, never concealment of an uncertainty that would change someone's decision.

Keep the sentence needed for a safety or privacy choice *at that choice*: who sees a live link, whether a message was sent, whether a source failed, and what Mira cannot check. In an uneasy state, shorten the menu before shortening those truths. Test comprehension after five seconds and after one tap; short copy only succeeds when people can state the source, limitation and next action correctly.

## Visual grammar follows information, not decoration

The existing launch design system moved toward warm paper, deep teal, restrained type and the Mira Pulse (`docs/launch-ux/04_MIRA_DESIGN_SYSTEM.md`). The first prototype carried too much of that single teal register and felt flat. The revised direction keeps the calm information hierarchy and introduces **solar warmth** as a recognisable Mira accent. Its signature is still a **local evidence ledger**: one leading statement, small provenance/date labels, a clear “what we don't know” disclosure, and a calm next action. Community is present as the *work that changed the answer*, not a gallery of users.

- **Typography:** one readable family with multilingual coverage, 16 px body baseline, 12 px absolute metadata floor, 21–26 px decision headings, tabular numbers for times. Keep line lengths short on phone. Test Hindi/English mixing and longer global place names. A typographic hierarchy must separate a conclusion from its evidence without making every claim look certain.
- **Colour:** warm ivory `#FFF7EF` gives the app a living, inviting base; charcoal `#24312E` carries conclusions; jade `#17665B` is the primary action and route/you colour; solar orange `#E8873E` belongs to the Mira mark, transitions and positive community effort; pale apricot `#FFE7CA` frames a lead local answer. Mint is reserved for confirmed-source labels, ochre for lighting/attention, red only for failed operations. Colour never stands alone as a trust or danger verdict. Unknown uses explicit words on neutral surfaces. Daypart shifts can deepen the canvas without changing these meanings.
- **Icons:** small consistent stroke icons for actions and evidence types. Do not use shields, badges, sirens, eyes watching people, pins for every content item or emoji as category icons. A map pin is for a spatial decision, not the icon for all knowledge.
- **Shape and density:** one column on phones; compact rows for facts, generous tap targets, restrained card borders. Reserve elevated sheets for real overlays. Home should not resemble a tiled analytics dashboard.
- **Image choice:** use neither stock photographs of worried women nor crime imagery. A restrained abstract neighbourhood drawing can support onboarding, but the actual product should favour text, source detail, location context and a deliberately opened map. No need for a mascot.
- **Motion:** the Mira Pulse responds to loading, confirmed updates or journey state. It is not ambient decoration. Transitions show causality, under about 250 ms; no movement in an uneasy state. Respect reduced motion. Preserve the interaction intent in `docs/launch-ux/05_MIRA_INTERACTION_AND_MOTION_SYSTEM.md`.

## Palette rule after the first concept review

The orange is **identity and human warmth**, not a warning code. It should appear in small, memorable places—the mark, a progress stroke, a confirmed collective update—and in one generous lead surface on Today. The filled action remains jade so a user can always find the next move. Avoid filling every card apricot; the rhythm needs warm highlights against quiet white. The first prototype's teal-only cards made Mira feel competent but too anonymous. The revised prototype demonstrates this narrower, brighter role for colour. Before production, test daylight contrast, night mode, colour-vision independence and cultural interpretation with users in more than one geography. The layout and evidence logic must survive monochrome rendering.

## Six distinct information states

The design must not compress these into “nothing nearby.”

| State | What the person sees | Typical next action |
|---|---|---|
| Confirmed current | Claim + source family + last confirmed date + scope; a disclosure reveals evidence and caveats. | Use context / inspect place. |
| Disputed | “Recent answers differ”; no positive or negative claim. | Check again later / answer if they actually know. |
| Stale / expired | Prior detail is visibly dated; current state is unknown. Expired item leaves decision surfaces. | Check current condition. |
| Empty after successful check | “No confirmed local conditions from the sources checked.” Explicitly no inference of safety. | Search a place or use standalone tools. |
| Unknown coverage | “Mira hasn't checked this type of information here.” | See what Mira can check / contribute a fact. |
| Failed / unavailable | “Couldn't check right now” / “This source isn't available here.” Distinct from an empty result. | Retry where meaningful / use available tools. |

`src/domain/evidence-state.ts` already separates `ok`, `partial`, `failed`, `unavailable`; design copy must preserve that domain distinction and add clarity about sparsity, expiry and disagreement. Display the provenance ledger only for actual evidence, never manufactured prototype data in production.

## Representing community without compromising people

Mira's community has a **collective identity**: “confirmed by independent answers,” “a place detail was corrected,” “a question still needs checking.” User identities, photos and biographies are not needed to make the work tangible. A person sees her own private impact and Mira Scout status if earned. Public-facing material stays thresholded, coarse, template-worded and date-bounded. That follows `PRINCIPLES.md` P3–P4 and the existing `src/domain/aggregation.ts` and `src/domain/reputation.ts` model.

For people with no daily personal-safety use, contribution should still feel like a complete use of Mira. The receipt should say what happens to the fact and when it might matter. A useful correction matters more than ten repeated taps. Incident reports remain separate from rewarded contributions.

## Notification contract

Send only for an active, user-chosen journey state that requires action; a meaningful correction/check outcome; a directly relevant, verified condition that changes a saved or active plan; or an explicit contact invitation. Prefer a quiet in-app update for informational outcomes. No ambient incident nearby push, no weekly anxiety recap, no “your neighbourhood is getting worse,” no frequency target. Each notification says the fact, reason it reached this person, and how to stop that class. A disabled source or failed check never becomes an alert.

## Acceptance questions

A first-time person should be able to say, before opening a map: “Mira combines what people have confirmed with route and help information. It says what it doesn't know. I can check a place or share one useful detail.” An existing user should find a destination or current journey immediately. A contributor should understand that private input is not instantly published. A person who feels uneasy should reach help without chat, authentication or a fresh network call.
