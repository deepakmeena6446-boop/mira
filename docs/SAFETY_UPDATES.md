# Safety updates (Women Safety Intelligence)

Safety updates are recent, relevant, sourced context around where she is (Home, once she has shared her location) or where she is going (a destination she picked).

The feature answers one question: *is there recent information a woman may reasonably want to know here?*

It is not:
- a news feed;
- a crime map;
- a rating of an area;
- proof that something did or didn't happen.

**Product rule:** MIRA surfaces relevant recent evidence. It does not manufacture a perception of danger.

## Pipeline

```
provider discovery (city name only)
  → recency window (7 days, or 30) + same-country plausibility
  → strict deterministic relevance gate            src/domain/safety-updates.ts  screenHeadline()
  → small classifier for the ambiguous few only    src/server/safety-intel/classifier.ts
  → dedupe (canonical URL) + story clustering      clusterCandidates()
  → structured updates with source metadata       toUpdate()
  → EvidenceState (ready / empty / partial / failed / unavailable)
  → cache per city + window                         src/server/safety-intel/pipeline.ts
  → Home line + sheet                               src/components/app/SafetyUpdates.tsx
```

The API is `POST /api/safety-updates` with `{ lat, lon, window?: 7 | 30 }`. The point is in the body, never the URL. It is used once, to name the city.

## Providers

Providers sit behind `SafetyIntelligenceProvider` (`src/server/safety-intel/providers.ts`). A provider receives `{ place, countryName, windowDays }`: names only. By construction, it can't receive coordinates.

- **GDELT DOC 2.0** (`SAFETY_UPDATES=gdelt`, the default). It is a discovery index across about 65 machine-translated languages, and is never treated as proof. Every result keeps its publisher and link.
  - GDELT asks for at most one request every 5 s. MIRA spaces its requests. If a request would have to queue for more than 6 s, it fails as "busy".
  - GDELT answers rate limits and query errors as plain text with status 200. MIRA treats both as failures, never as "no results".
- **Fixture** (`SAFETY_UPDATES=fixture`). Labelled `[Sample]` data for E2E and development. The public-beta strict profile refuses it.
- **Off** (`SAFETY_UPDATES=off`). The section says updates aren't available.
- **Official / police / transport feeds.** The interface is ready, but none are connected yet. Today "official" means an update's host matches a government or police suffix (`.gov`, `.gov.xx`, `.gouv.fr`, `.go.jp`, `.police.uk`, …). That host rule is conservative: `gob.mx`, for example, counts as news.

## Relevance

**Deterministic gate.** It is strict, and precision comes first.
- Topic exclusions run first: history, opinion, round-ups, politics and policy, business, sport, entertainment, accidents, incidental mentions.
- Then category rules include a headline only when it clearly concerns women's safety. The categories are sexual violence, harassment/stalking, transport, missing/abduction, trafficking, gender-based violence, domestic-violence *advisories* only, spiking, and official advisories.
- Keyword coverage spans 13 languages (en, es, pt, fr, de, it, hi, ja, ko, ar, id/ms, tr, zh), in both simplified and traditional Chinese.

**Ambiguous.** Some headlines go to the classifier:
- a woman attacked where her gender may be incidental;
- harassment or stalking with no gendered word ("students stalked");
- languages outside keyword coverage.

**Classifier.** The default is `claude-opus-5` at low effort; `SAFETY_CLASSIFIER_MODEL` overrides it.
- It sees at most 20 headlines per fetch, and each article once (cached for 14 days).
- It shares Mira's daily token ceiling.
- It judges relevance, category and translation only. It never judges truth, guilt, whether a place is safe, or whether anyone is in danger. Headlines are treated as data.
- A refusal, an unparseable answer or a spent budget leaves the headline out. It is never guessed in.

### Evaluation (`scripts/safety-eval.ts`, `tests/unit/safety-updates.test.ts`)

| Set | Cases | First run (before any fix) |
|---|---|---|
| Tuning (written first, tuned against) | 70 | 34/34 included, 32/32 excluded (after tuning) |
| Held-out 1 (labelled independently) | 70 | precision 0.938 (1 false positive: "stalking horse bid"); 15/26 relevant included |
| Held-out 2 (labelled independently, fresh) | 80 | **precision 1.000** (38/38 excluded); 20/30 relevant included, 4 more routed to the classifier |
| Live GDELT sample (real response, hand-labelled) | 8 | 4/4 excluded; missed the one include; 2 borderline headlines were dropped instead of routed |

After each first run, only vocabulary gaps were fixed: inflections, legal phrases, scripts and idioms. The definition of relevance was not changed. All four sets now pass as regression tests, so they no longer measure unseen data. The honest estimate for unseen headlines is the held-out first run: precision about 0.94–1.0, and deterministic recall about 0.6–0.7 before the classifier.

## Structure and language

- **Every update keeps what the source provides:**
  - the headline verbatim, labelled with its publisher;
  - publication age;
  - city-level location, with the level shown;
  - the source type (Official source or News report);
  - the source count, with each source's own headline;
  - a link to the original;
  - the retrieval time.
- **Summaries are never generated** (`summary: null`).
- **Event year** is shown only when the headline states one.
- **Legal status comes from the headline's own words.** The labels are: advisory, court outcome, charges (not a conviction), arrest (not a conviction), under investigation, allegation (not a legal finding), or "as reported".
- **Clustering** merges articles published within 72 h that match on any of:
  - the same canonical URL (AMP and mobile copies included);
  - the same category with similar headlines;
  - two or more shared names or acronyms (e.g. "Mukherjee Nagar", "SUV", "DU").

  Four articles are one story, "Reported by 4 sources", never four incidents.
- **Missing-person stories** are marked sensitive. The card then shows the source only, with no summary.

## What the UI never does

- No score, count-to-colour, ranking, or "safe/unsafe". Tests check the copy and the module's exports.
- No distance, unless precision is exact or neighbourhood. Discovery today is city-level, so no distance is shown.
- News and community reports are never merged. Community reports appear as "not in the beta" until the moderation release gate is met.
- A failed check is never shown as "no updates":
  - failed: "MIRA couldn't check recent updates right now."
  - partial: "Some sources couldn't be checked."
  - empty: "No recent women-safety updates found from the sources MIRA checked in this area. This does not mean no incidents occurred."

## Privacy and cost

- **Coordinates:** only in the POST body to MIRA. They are reverse-geocoded with the existing provider's rounding, then discarded. They are not logged or stored, and they are not in the cache: the integration test checks this.
- **News provider:** gets only the city name (or the region name when no city is known).
- **Cache:** `safety_intel_cache`, keyed by hash. It holds no user id. Rows are purged by the retention job when they expire.
- **Refresh rates:**
  - results: 30 min per city and window, shared across instances;
  - failures: 5 min;
  - concurrent requests for one city share one provider call;
  - the client fetches once per ~1 km and window, never on every re-render.

## Known limitations

- **GDELT throttling.** GDELT throttles shared egress addresses hard. From the development machine, a first request succeeded only after about 9 minutes of spaced retries. Expect "couldn't check" states on shared hosting until a second provider or cache warming exists.
- **Location is city-level only.** A GDELT match means the article mentions the city, not that the event happened there. Same-named cities are filtered by the publisher's country unless the headline names the city.
- **Real headlines often omit gender.** Without `ANTHROPIC_API_KEY`, those headlines are left out.
- **Clustering.** Cross-language duplicate clustering is weak. The name rule can merge two different incidents in the same neighbourhood within 72 h; each source's own headline stays visible.
- **Classifier not measured live.** No live classifier calls were made in the sprint that built this.
