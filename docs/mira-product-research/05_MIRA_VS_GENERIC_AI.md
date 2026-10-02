# Mira versus general AI: the substitution test

Research date: 2026-10-02. **Finding:** a safety tuned chat persona is not a moat. General assistants already search the web; ChatGPT can use optional device location and show local map results, Claude can search current web sources, and Gemini can use Google Maps places, hours and directions. Gemini also operates *inside Google Maps navigation* for route questions, places along the way, stops and some actions, and can use connected personal data in eligible contexts. Mira must assume these products will keep improving. [ChatGPT Search](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt), [Claude web search](https://support.anthropic.com/en/articles/10684626-enabling-and-using-web-search), [Gemini Maps](https://support.google.com/gemini/answer/16622866?co=GENIE.Platform%3DDesktop), [Gemini inside Maps](https://support.google.com/maps/answer/6041199?hl=EN), [Gemini personalisation](https://support.google.com/gemini/answer/16836988?hl=en-232)

## What gets substituted now

| Proposed capability | ChatGPT/Claude/Gemini + Maps can cover ~80%? | Mira decision |
|---|---|---|
| General travel tips, emergency numbers, cultural norms | Yes, with source checking | Commodity context, not a headline feature. |
| Nearby hotels/pharmacies and listed opening hours | Often yes | Only valuable when Mira verifies **suitability now**, access and a usable route; do not claim exclusivity. |
| Generic “is this area safe?” chat | They can answer, but none can guarantee it | Reject yes/no verdict. Give evidence, gaps and options. |
| Mapping a route and sharing ETA | Maps and messaging already do it | Integrate or hand off; avoid building a navigation clone. |
| A prior user's experience on a particular segment at 5 AM | Usually no reliable structured data | Potential Mira asset, subject to coverage, consent and verification. |
| A known open, staffed, accessible refuge for this situation | Partly, but listed hours are not staffing or access | Potential differentiation if independently checked and fresh. |
| Compare two concrete options using intent, time, mode, local conditions and user preference | General assistants can reason, but lack Mira's eventual observation graph | Strong candidate when inputs have provenance and the output executes an action. |
| A quiet, consent based journey memory and timely prompt | General assistants have memory; map apps have location history | Differentiate through narrowly scoped movement context, explicit controls and non-surveillance defaults, not memory alone. |

## The honest current answer

Today Mira already has a conversational provider, route/help point tools, some place hours, mapped lighting, journey sharing and country context. Yet its own September evaluation records that safety judgement prompts generally return “not enough verified information,” and destination planning beyond current location can be thin. The evaluation used stubbed tools and one model run per case, so it does not prove real-world performance. [Internal evaluation](../MIRA_EVAL.md), [companion provider](../../src/server/providers/companion/index.ts). The early runner's experience is consistent with this gap. **At present, Mira is not demonstrably more useful than a general assistant plus Maps for many planning questions.** That is a product finding, not a criticism of the model.

## Defensible advantage to build and validate

Mira's candidate advantage is a **decision system for movement**:

1. Understand intent, mode, time and constraints with few questions.
2. Retrieve a provenance marked, time sensitive view of places, segments, services, official guidance and community observations.
3. Compare feasible options and explain the basis and missing evidence.
4. Convert the chosen option into a usable plan: map handoff, check in, trusted contact share, or a verified place to enter.
5. Learn from optional corrections at the point of use, with privacy controls.

No single item is a moat. Even the workflow and action handoff are **UX hypotheses**, because Gemini already operates within Maps navigation. The candidate compounding advantage is a *provenance-rich, recently verified, situation-specific observation and correction history* that changes a real movement choice. A general assistant can imitate the prose; it cannot simply invent that local history. Google Maps could develop much of it, so the competitive claim should be **better focus and data quality in women's mobility situations**, not permanent exclusivity. Building and verifying sufficient density may be too expensive for a startup; pilot economics must be tested before claiming a network moat.

Third-party place data are not automatically a proprietary database. Google Places terms restrict caching and storing most Places content; source licensing must be checked before designing a durable fused dataset or training asset. [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

## Proof threshold

Run blinded crossover tasks with women, comparing Mira with **Gemini inside Maps** and ChatGPT plus Maps on the same phone and situation. Stratify by city, time, mode and sparse versus rich coverage. Measure verified operational fact accuracy, critical false claims and omissions with independent adjudication, user understanding of unknowns, usable-option rate and time, and whether a *Mira-only* observation changes a choice. A possible pre-registered go/no-go threshold is a 20 percentage-point gain in usable-option rate with no worse critical-error rate; sample size must be powered, and zero observed errors is not proof of safety. If no lift appears, defer the capability regardless of demo appeal.

## AI's correct role

Conversation is a flexible *intent and explanation surface*. Retrieval and rules must determine which facts are eligible, how fresh they are, and whether an action is possible. AI can ask a clarifying question, synthesize tradeoffs, translate and explain. It must not manufacture conditions, infer a crime probability from sparse observations, or claim to have called, booked, warned or shared when it has only proposed an action. NIST flags the need for validity, monitoring, transparency and management of automation bias in AI systems. [NIST AI RMF](https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/), [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
