# MIRA — Future Research

*2026-09-26 · long-term research only. **None of this is in the current implementation plan**, and no part of the product should imply these capabilities exist. External facts are cited at the end and must be re-checked before any decision: laws and programmes change.*

## Contents
- [R1 — Emergency-service integration](#r1--emergency-service-integration)
- [R2 — AI calling / emergency agent](#r2--ai-calling--emergency-agent)
- [R3 — Women's Mobility / Safety Index](#r3--womens-mobility--safety-index)
- [R4 — Global datasets](#r4--global-datasets)
- [R5 — Public policy & research opportunities](#r5--public-policy--research-opportunities)
- [Open questions register](#open-questions-register)
- [Sources](#sources)

---

# R1 — Emergency-service integration

### The question
Can MIRA get **her location and journey context** to emergency services faster and more accurately than a voice call alone?

### What already happens without MIRA
- **Handset location on emergency calls.** Android's Emergency Location Service (ELS) sends a precise handset location to the emergency service when an emergency number is dialled, where the public-safety system has integrated it. In India, Uttar Pradesh went live with 112 in December 2025, and more states may follow. Europe has Advanced Mobile Location (AML) on both platforms.
- **This is why MIRA's Emergency pill must use the native dialler (`tel:`).** A call placed by the phone's dialler can carry ELS/AML location. A VoIP or app-placed call generally doesn't.

### Existing integration models

| Model | Where | How it works | What it would mean for MIRA |
|---|---|---|---|
| **National ERSS-112 (India)** | India | The state/UT PSAPs take distress requests over multiple channels. The official description lists voice, SMS, SOS, email, web, chatbot, IoT signals, WhatsApp and **"external signals"**. The government's *112 India* app sends an alert with location to the emergency response centre | An integration would be a **partnership with MHA / C-DAC / state ERSS**. It is not an API MIRA can simply call. Research: which channel (external signals?), onboarding requirements, per-state variation, liability, false-alert handling |
| **PEMEA** (ETSI TS 103 478) | Europe (and designed for beyond) | A standard architecture so an emergency *app* can route location + context (and multimedia / real-time text) to the right PSAP across borders, via an app service provider and PSAP service provider | The standards-based route for Europe. MIRA would join as an application service provider through an existing PEMEA network provider |
| **RapidSOS-style clearinghouse** | US (and expanding) | Apps (Uber, device makers) push location + context into a clearinghouse; 911 call-takers see it when the matching call arrives or through their portal | The precedent for "human call + context packet". Uber's in-app 911 button shares trip details with dispatchers this way |
| **Professional monitoring (alarm-receiving) centres** | US (e.g. Noonlight), UK/EU ARCs | A human dispatcher receives the app alarm, contacts the user (text/call) to verify, and escalates to the PSAP with location and details | A **human-in-the-loop** escalation option for users who can't call. Costs money per user or incident; availability varies by country |

### Recommended direction (research hypothesis)
```
Near term (P0–P1, not built yet):
           She calls via the Emergency pill (native dialler, gets ELS/AML location where available)
           + MIRA shows her location in words to read out (P1)
           + MIRA tells her people now (P1; trusted contacts, live link)

Next:      Emergency context packet (blueprint §5D) available to contacts in a consented view

Later:     Standards-based data push where a partnership exists
           (ERSS-112 external signal in India · PEMEA in Europe · clearinghouse in the US)
           → call-taker sees destination, recent trail, nearest Help Point
           Optional: human monitoring partner for "I can't talk" cases
```

### Research tasks
1. Interview 3–5 PSAP / ERSS operators (India first): what data do they want from third-party apps; what do they refuse; what causes false-alert burden?
2. Map the ERSS "external signals" onboarding process and state variation.
3. Assess a monitoring-partner pilot in one country: cost, verification flow, response-time evidence, liability.
4. Define the **packet schema** against the receiving standards (PEMEA data model; clearinghouse schemas).
5. False-alert economics: how would MIRA avoid adding load to public services? (Verification step, and never auto-escalating on a missed arrival alone.)

### Hard lines
- **Never** imply that MIRA dispatches police, ambulances or anyone else until a certified integration exists in that place.
- **Never** auto-escalate to public services on inferred signals (a missed arrival, a deviation). Those go to her chosen contacts.

---

# R2 — AI calling / emergency agent

### The question
Could MIRA's AI place or assist an emergency call on her behalf?

### 1. Technically possible?
**Yes.** Telephony APIs plus a voice agent can dial a number, speak, listen and respond.

### 2. Legally and operationally acceptable?
**Unclear at best. In some places, likely not without explicit approval.**
- **United States:** the TCPA, 47 U.S.C. § 227(b)(1)(A)(i), prohibits calls using an autodialer or an **artificial or prerecorded voice** to any emergency telephone line, with exceptions for calls "made for emergency purposes" or with the called party's prior consent. In 2024 the FCC ruled that AI-generated voices are "artificial" under the TCPA. Whether an AI calling 911 for a user fits the "emergency purposes" exception is a legal question, not a product one, and PSAP policy matters as much as the statute.
- **Elsewhere:** many jurisdictions treat nuisance, automated or false calls to emergency numbers as offences, and PSAPs defend against telephony denial-of-service. Requires legal review per country.
- **Location:** an AI/VoIP call generally loses handset ELS/AML location (R1), which is the **most valuable data an emergency call carries**.
- **Operationally:** a synthetic voice speaking "for" a person can't answer "Are you safe to talk?", can't be asked to press a key, and may be treated as a prank or robocall.

### 3. Reliable enough for safety-critical use?
**No, not as a primary path.** Voice agents can misunderstand operators, accents, IVRs, interruptions and background noise. They can also hallucinate details. The failure costs are asymmetric: a mistaken statement to emergency services is worse than no statement.

### 4. Preferred architecture
| Option | Verdict |
|---|---|
| AI pretends to be her / speaks for her on a 112/911 call | **Reject** |
| **Human emergency call (native dialler) + MIRA context packet** (location in words on screen; contacts informed; data push where integrated) | **Preferred now** |
| **Authenticated digital integration** (R1) | **Preferred long-term** |
| Human monitoring partner who calls the PSAP (R1) | **Worth piloting** for "can't talk" situations |
| Accessibility assist: text she types is read aloud *on a call she placed*, like relay services | **Research only**, with PSAP consultation; the precedents are real-time text and relay services, not AI agents |
| AI calls a **trusted contact** (not emergency services) with a scripted, factual message when she triggers it | **Possible later**. Contacts are people she chose. Still needs consent, clear identification as automated, and local robocall rules. Low priority vs WhatsApp/SMS/push |

**Conclusion:** MIRA should not build AI emergency calling. The value lies in **getting accurate context to humans faster**, whether that's her people, a monitoring centre or the PSAP.

---

# R3 — Women's Mobility / Safety Index

### Framing
This is a **measurement-science problem**, not a marketing score. A careless "safety index" can reinforce socioeconomic, racial, caste, religious, migrant and neighbourhood biases. It can also depress investment in the places that need it most, and teach women to avoid their own cities.

### Position (owner's decision, 2026-09-26)
MIRA **will never build**:
- simplistic neighbourhood safety scores;
- unexplained 0–100 safety ratings;
- rankings driven by raw community sentiment;
- ratings of people or demographic groups;
- fear-based red/green maps.

However, MIRA **may eventually develop a Women's Mobility / Safety Index**, but only if rigorous research and a transparent methodology support it. Such an index must expose: **dimensions measured · source coverage · methodology · geography · data age · uncertainty · confidence · missing data.** It stays **P3 / research only**. Nothing in the product implies it exists.

**Research starting point:** begin with dimensions that are measurable, change with public action, and don't label people. Mobility conditions and access to help come first. Safety-outcome dimensions (e.g. official incident statistics) join only where they are methodologically sound and comparable:

| Dimension | Candidate indicators | Data | Bias risk |
|---|---|---|---|
| Mobility infrastructure | Share of pedestrian network with known lighting; share mapped lit; footpath presence | OSM, Mapillary, MIRA lighting | Mapping coverage is itself unequal (richer areas get mapped first). Must report coverage, not just values |
| Late-night transit | Share of population within X min of a stop served after 22:00; last-service times | GTFS | Low; factual |
| Access to help | Walking time to the nearest 24 h hospital emergency department / staffed station at 23:00 | Places + hours, GTFS | Moderate (hours data quality) |
| Journey context | Reliability of transit (GTFS-RT adherence) | GTFS-RT | Low |
| Verified public information | Official incident statistics **only where methodologically comparable**, at official granularity, never re-gridded | Government datasets | **High**: under-reporting varies by place and group; reporting ≠ incidence |
| MIRA network signals | Corroborated infrastructure observations only | MIRA | Skewed by who uses MIRA |

### Requirements before anything is published
- **Dimensions measured**, each named and defined, with how each is computed.
- A public **methodology**, pre-registered before results are seen.
- **Source coverage** and **source mix** per value.
- **Geography**: the unit each value describes.
- **Data age** per value.
- **Uncertainty** and **confidence** alongside every value.
- **Missing data** shown explicitly; "insufficient data" as a first-class result.
- **Geographic granularity** no finer than the least precise input supports. Never street-level for incident-derived data.
- **External review:** academic partners, women's organisations, statisticians. An advisory group with the power to block publication.
- **Bias audit:** correlation of index values with income, caste/ethnic composition, informal settlements. Publish the audit.
- **No unexplained composite number.** A composite is allowed only if research shows it doesn't mislead, and it always ships with its dimensions, coverage and uncertainty. Default to a dashboard of dimensions.
- **Use restrictions:** licence terms against using the index for housing, lending, insurance or policing decisions about neighbourhoods.

### Research tasks
1. Literature review: women's safety audits (e.g. participatory safety audit methods), transport-and-gender research, critiques of crime-mapping.
2. Pilot: one city, infrastructure-only dimensions, with a university partner.
3. Decide from evidence whether an index adds value beyond open data releases (R4), and which safety dimensions, if any, meet the methodological bar. The answer may be "not yet".

---

# R4 — Global datasets

| Dataset | What MIRA could contribute | Conditions |
|---|---|---|
| **Lighting observations** | Aggregated, thresholded cell-level lighting (≥ 3 voices), with dates | Only aggregates; licence compatible with OSM (share-alike) if contributed upstream; never per-person |
| **OSM improvements** | Lit tags, opening hours, help-point tags, confirmed upstream by humans under OSM's rules | OSM community norms; no automated bulk edits from MIRA data without community approval |
| **Help Point hours accuracy** | How often provider hours are wrong, by city and class | Aggregates only |
| **Locale profiles** | Emergency numbers, helplines, operators, with citations | Openly licensed (e.g. CC BY); versioned |
| **Coverage maps** | Where lighting / hours / transit data is missing | Helps cities and mappers target gaps |

Never released: trips, routes, individual contributions, reports (even anonymised free text), anything re-identifiable.

---

# R5 — Public policy & research opportunities

- **Lighting-gap reports for cities:** "these corridors have a high share of walkers reporting dark stretches". Aggregated, dated, infrastructure-only. Actionable by municipal lighting departments. Needs sufficient density and a partner city.
- **Transit-hours evidence:** late-night service gaps on routes women actually use (aggregate journey counts by time band, no paths). Needs a privacy review before collection. Today MIRA deliberately keeps no journey history, so this would need an explicit opt-in research mode.
- **Help-point accessibility:** where 24 h staffed help is more than N minutes away at night.
- **Emergency-response integration standards for apps in India:** MIRA's R1 research could inform how third-party apps connect to ERSS responsibly.
- **Academic partnerships:** evaluation of whether safety-context tools change decisions or wellbeing, without increasing fear. Pre-registered.

**Guardrail:** any research use of MIRA data requires a published protocol, ethics review, opt-in where the data isn't already public aggregates, and no change to the product's privacy promises.

---

## Open questions register

| # | Question | Blocks | Owner |
|---|---|---|---|
| Q1 | Does Routes API return walking alternatives reliably in Indian cities? | Route alternatives (P1) | Engineering spike |
| Q2 | Cost of Places opening-hours fields at expected volume vs. parsing OSM `opening_hours` coverage in Delhi | Help Point hours (P1) | Engineering + budget |
| Q3 | iPhone: does the installed PWA keep the Safari session? Does Web Push work reliably for the target users? | Accounts, push (P0 test, P1) | Real-device test |
| Q4 | WhatsApp Business template approval for safety alerts; SMS DLT registration timelines | Channels (P2) | Owner |
| Q5 | Which ERSS channel could accept third-party app signals, and under what conditions? | R1 | Research |
| Q6 | False-positive rate of on-device deviation / stop detection on real Delhi walks | P2 feature | Field test |
| Q7 | Which travel corridors do Indian women users actually travel? | G2 rollout | User research |
| Q8 | Legal review: TCPA and equivalents for any automated call to contacts | R2 option | Legal |

---

## Sources

- TCPA and AI voices: [FCC DA 20-1507](https://docs.fcc.gov/public/attachments/DA-20-1507A1.txt) · [FCC 23-101](https://docs.fcc.gov/public/attachments/FCC-23-101A1.pdf) · [FCC fact sheet, 25 Jan 2024 (AI-generated voices under the TCPA)](https://docs.fcc.gov/public/attachments/DOC-400039A1.pdf) · [Mayer Brown summary, Feb 2024](https://www.mayerbrown.com/en/insights/publications/2024/02/fcc-declares-authority-and-intent-to-regulate-ai-generated-calls-under-the-tcpa)
- PEMEA: [ETSI TS 103 478](https://www.etsi.org/deliver/etsi_ts/103400_103499/103478/01.01.01_60/ts_103478v010101p.pdf) · [ETSI announcement](https://www.etsi.org/newsroom/news/1289-2018-03-news-etsi-releases-standard-on-pan-european-mobile-emergency-application) · [EENA PEMEA project](https://eena.org/pan-european-mobile-emergency-apps-project-pemea/) · [pemea.eu](https://pemea.eu/what-is-pemea/) · [PEMEA standard update, Sep 2025](https://pemea.eu/2025/09/29/update-of-the-pemea-standard/)
- Android ELS in India: [Business Standard](https://www.business-standard.com/technology/tech-news/google-s-android-emergency-location-service-goes-live-in-india-up-what-is-it-how-it-works-125122300494_1.html) · [Digit](https://www.digit.in/news/general/google-launches-emergency-location-service-for-android-users-in-india-starting-with-up.html)
- ERSS-112 India: [112.gov.in](https://112.gov.in/) · [ERSS participants](https://www.112.gov.in/participants) · [MHA ERSS page](https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss) · [Kerala SDMA ERSS-112](https://sdma.kerala.gov.in/erss-112/)
- RapidSOS / Uber: [Uber newsroom](https://www.uber.com/ca/en/newsroom/rapid-sos-canada/) · [RapidSOS case study](https://rapidsos.com/case-study/uber/) · [RapidSOS developer docs](https://developer.rapidsos.com/public_safety/default/getting-started)
- Monitoring model: [Noonlight — how it works](https://help.noonlight.com/en/articles/2060965-how-does-noonlight-work) · [Noonlight — why not just dial 911](https://help.noonlight.com/en/articles/2062101-why-not-just-dial-911) · [Noonlight Dispatch API](https://www.noonlight.com/products/dispatch-api)
