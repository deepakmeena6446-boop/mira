/**
 * Pre-launch audit probes for the Safety updates relevance gate (2026-09-27). Labelled from the
 * product definition BEFORE the gate was changed, and never relabelled to make the gate pass:
 * - the audit's wrongly-included headlines (must now be excluded);
 * - the audit's keep-included / keep-excluded controls;
 * - likely false positives in real GDELT feeds (policy, awareness events, rankings, anniversaries,
 *   court procedure, protests, online abuse, media about an incident, the accused being a woman);
 * - likely false negatives (short incident headlines without the usual vocabulary).
 * "exclude" also accepts the classifier route (never shown on keywords alone); "ambiguous" means
 * the gate must send it to the classifier.
 */
import type { EvalCase } from "./safety-updates-eval";

const en = (title: string, expect: EvalCase["expect"], note?: string, publisher = "news.example.com"): EvalCase => ({ title, language: "English", publisher, expect, note });

export const AUDIT_CASES: EvalCase[] = [
  // ── Audit: wrongly included before, must be excluded ──
  en("Protest over rape case turns violent", "exclude", "protest, not an incident"),
  en("Stalker jailed after following woman for months", "exclude", "past court outcome, no present relevance"),
  en("Missing dog found; she was hungry", "exclude", "'missing' + 'she' without a woman/girl word"),
  en("Priest arrested for sexual abuse of boys", "exclude", "victims are boys"),
  en("Man arrested for molesting minor boy", "exclude", "victim is a boy"),
  en("Film on acid attack survivor wins award", "exclude", "a film and an award are not incidents"),
  en("Women protest against harassment in Delhi university", "exclude", "protest"),
  en("Rape accused MLA granted bail", "exclude", "court procedure + political"),
  en("Woman journalist harassed online by trolls", "exclude", "online abuse, not moving through the city"),

  // ── Audit controls: keep included ──
  en("Police warn of drink spiking at Soho bars", "include"),
  en("Cab driver arrested for molesting passenger", "include"),
  en("Man held for harassing women on metro", "include"),

  // ── Audit controls: keep excluded ──
  en("Woman CEO opens new office in Mumbai", "exclude"),
  en("Actress attends film premiere in Delhi", "exclude"),
  en("Minister says women's safety is top priority", "exclude"),
  en("Man arrested for theft in Bengaluru", "exclude"),
  en("Woman killed in road accident", "exclude"),
  en("Woman among 5 injured in bus crash", "exclude"),
  en("Women's cricket team wins series", "exclude"),

  // ── Likely GDELT false positives ──
  // Policy, bills, schemes, launches
  en("State launches scheme to protect girls from trafficking", "exclude", "scheme announcement"),
  en("New law to curb stalking of women passed by assembly", "exclude", "legislation"),
  en("Government issues guidelines to prevent sexual harassment at workplaces", "exclude", "guidelines, no incident"),
  // Awareness events, workshops, conferences
  en("Police hold self-defence workshop for college girls to counter harassment", "exclude", "self-defence workshop"),
  en("Awareness campaign on sexual harassment held at Pune college", "exclude", "awareness campaign"),
  en("Seminar on trafficking of women and girls held in Kathmandu", "exclude", "seminar"),
  // Rankings, surveys, statistics
  en("Delhi ranked least safe city for women, survey says harassment rampant", "exclude", "ranking / survey"),
  en("Survey: 6 in 10 women face harassment on Mumbai local trains", "exclude", "survey, not an incident"),
  en("NCRB data: rape cases in Jaipur rise 12%", "exclude", "statistics"),
  // Anniversaries and history without a year
  en("Nirbhaya gang rape: 14 years on, mother still seeks change", "exclude", "anniversary"),
  en("Ten years since the Park Street rape case", "exclude", "anniversary"),
  // Court procedure
  en("Court reserves verdict in metro molestation case", "exclude", "court procedure"),
  en("Delhi HC to hear plea in woman's stalking case today", "exclude", "court procedure"),
  en("Man convicted of stalking woman sentenced to three years", "exclude", "court outcome"),
  en("Professor acquitted in student sexual harassment case", "exclude", "court outcome"),
  en("Trial begins in cab driver rape case", "exclude", "court procedure"),
  en("Accused in schoolgirl abduction case denied bail", "exclude", "court procedure"),
  // Protests, marches, outrage
  en("Candle march held for gang-rape victim in Kolkata", "exclude", "march"),
  en("Students demand justice for molested classmate", "exclude", "demand for justice"),
  en("Outrage over minister's remark on rape victims", "exclude", "political outrage"),
  en("Residents protest outside police station after girl abducted", "exclude", "protest"),
  // Online / cyber
  en("Man arrested for cyberstalking woman on Instagram", "exclude", "online"),
  en("Deepfake video of woman: police register case", "exclude", "online"),
  en("Women MPs face online abuse and threats, report says", "exclude", "online + politics"),
  // Media about an incident, awards
  en("Documentary on trafficked girls premieres in London", "exclude", "documentary"),
  en("Book on survivors of acid attacks released", "exclude", "book"),
  en("Constable honoured for rescuing kidnapped girl", "exclude", "award/honour"),
  // The woman is the accused
  en("Woman arrested for stalking ex-boyfriend", "exclude", "woman is the accused, victim is a man"),
  en("Woman booked for harassing neighbour", "exclude", "woman is the accused"),
  // Not about women at all
  en("Boy, 12, abducted from park, rescued by police", "exclude", "victim is a boy"),
  en("Missing cat found safe; she had been trapped in a shed", "exclude", "animal"),
  en("Man held for sexually abusing nephew", "exclude", "victim is a boy"),

  // ── Likely false negatives (must be included) ──
  en("Woman groped on bus in Bengaluru", "include"),
  en("Auto driver tries to abduct student in Hyderabad", "include", "attempted abduction by a transport driver"),
  en("Police issue advisory on fake cab drivers at airport", "include", "official warning about fake drivers"),
  en("Police warn women about man exposing himself near park", "include", "indecent exposure warning"),
  en("Teen girl followed and harassed on way home from school", "include"),
  en("Uber driver held for molesting woman passenger", "include"),
  en("Man arrested for trying to drag woman into car in Andheri", "include"),
  en("Woman molested on crowded local train, accused held", "include"),
  en("Police warn of men posing as taxi drivers targeting women at night", "include"),
  en("Girl, 15, goes missing after leaving tuition class; police appeal", "include"),
  en("Woman arrested for trafficking girls to Gulf on fake job offers", "include", "trafficking victims are girls; the accused's gender is irrelevant"),
  en("Femicide in São Paulo suburb prompts protest", "include", "the incident leads; the protest is a consequence"),

  // ── Must reach the classifier, not be guessed in or out ──
  en("Man held for sexual assault in Delhi hotel", "ambiguous", "sexual violence, victim's gender not stated"),
  en("Student, 19, missing for 4 days; family says she left for coaching", "ambiguous", "'she' without a woman/girl word"),

  // ── Fresh probes written AFTER the gate change and run once before any further fix ──
  // First run: 7 of 10 relevant included (2 more routed to the classifier), 1 false positive
  // ("Women's commission chief visits rape survivor"). Then two vocabulary fixes: official
  // visits/condemnations are statements, "misbehaving with" is harassment.
  en("Woman passenger sexually harassed by bus conductor in Chennai", "include"),
  en("Girl, 14, abducted while returning from school; police launch search", "include"),
  en("Police arrest two for stalking nursing student in Kochi", "ambiguous", "relevant, but no woman/girl word: the classifier decides"),
  en("Man exposes himself to women on Piccadilly line, BTP appeal", "include"),
  en("Ola driver held for misbehaving with woman passenger", "include"),
  en("Women travellers warned of fake taxi scam at Bali airport", "ambiguous", "relevant, but not a police/official warning: the classifier decides"),
  en("Spiked drinks: students warned after cases at campus bar", "include"),
  en("Teenage girl rescued from traffickers at railway station", "include"),
  en("Woman chased and molested by bikers near Hebbal flyover", "include"),
  en("Rapido rider arrested for groping woman customer", "include"),
  en("High court quashes FIR against man in stalking case", "exclude", "court procedure"),
  en("Women's commission chief visits rape survivor in hospital", "exclude", "an official's visit, not an incident report"),
  en("City police launch 'Pink Patrol' vans for women's safety", "exclude", "initiative"),
  en("Ahead of polls, party promises CCTV in all buses for women", "exclude", "politics"),
  en("Rape survivor's memoir tops bestseller list", "exclude", "book"),
  en("Hundreds march in Kolkata demanding justice for doctor", "exclude", "protest"),
  en("Woman teacher arrested for sexually abusing student", "exclude", "the woman is the accused"),
  en("Man booked for harassing neighbour over parking dispute", "exclude", "no woman/girl"),
  en("Survey finds 70% of women feel unsafe in parks at night", "exclude", "survey"),
  en("Trolls target woman cricketer after match loss", "exclude", "online + sport"),
  en("Bengaluru ranks third in list of safest cities for women", "exclude", "ranking"),
  en("Man held for killing wife over dowry", "exclude", "private domestic case"),
  en("Pune: Awareness drive on good touch, bad touch at schools", "exclude", "awareness event"),
  en("Two years after Hathras rape case, family still waits", "exclude", "anniversary"),
];
