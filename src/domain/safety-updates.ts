/**
 * Women Safety Intelligence ("Safety updates" in the app): recent, relevant, sourced context
 * around where she is or where she's going — never a verdict on an area.
 *
 * Pipeline (src/server/safety-intel): discovery → location + recency → this module's strict
 * relevance gate → dedupe / story clustering → source metadata → structured updates → UI.
 * A small model sees only the headlines this gate can't decide (ambiguous), and only to judge
 * relevance, category and translation — never truth, guilt, or whether an area is safe.
 *
 * Rules that shape everything here:
 * - Precision over recall. An empty list is better than an irrelevant one.
 * - A headline is the publisher's words, shown with the publisher. Allegations stay allegations.
 * - One incident reported by many outlets is ONE update ("Reported by 4 sources").
 * - Counts are never turned into a rating: no scores, colours, rankings or "safe/unsafe".
 * - No update is ever placed closer to her than the source supports (city-level = city-level).
 *
 * Client-safe: pure functions and types only.
 */

import { companionOutputIssue } from "@/domain/companion-output";
import type { SourceState } from "@/domain/evidence-state";

export type SafetyCategory =
  | "sexual_violence"
  | "harassment_stalking"
  | "transport"
  | "missing_abduction"
  | "trafficking"
  | "gender_based_violence"
  | "domestic_violence_advisory"
  | "spiking_nightlife"
  | "institutional_advisory";

export const CATEGORY_LABEL: Record<SafetyCategory, string> = {
  sexual_violence: "Sexual violence",
  harassment_stalking: "Harassment / stalking",
  transport: "Transport",
  missing_abduction: "Missing / abduction",
  trafficking: "Trafficking",
  gender_based_violence: "Violence against women",
  domestic_violence_advisory: "Domestic violence advisory",
  spiking_nightlife: "Drink spiking / nightlife",
  institutional_advisory: "Official advisory",
};

/**
 * How precisely the source places the story. Distance is only ever shown for "exact" / "neighbourhood".
 * "mentioned": the article mentions the searched area, but its headline doesn't place the story there.
 */
export type LocationPrecision = "exact" | "neighbourhood" | "city" | "district" | "region" | "country" | "mentioned";

/** Who published it: an official body (police, government, transport authority) or a news outlet. */
export type SourceType = "official" | "news";

/** What the headline says happened in legal terms — so MIRA never upgrades an allegation to a fact. */
export type ReportingStatus = "advisory" | "court_outcome" | "charged" | "arrest_reported" | "under_investigation" | "allegation" | "reported";

export const REPORTING_NOTE: Record<ReportingStatus, string> = {
  advisory: "Advisory",
  court_outcome: "Court outcome reported",
  charged: "Charges reported, not a conviction",
  arrest_reported: "Arrest reported, not a conviction",
  under_investigation: "Under investigation",
  allegation: "Allegation, not a legal finding",
  reported: "As reported",
};

/** One article as a discovery provider returned it. The provider is an index, never proof. */
export interface SafetySourceResult {
  url: string;
  title: string;
  /**
   * ISO timestamp the provider gives. For GDELT this is when its index first saw the article,
   * not the publisher's own publication time: the UI says "first indexed", never "published".
   */
  publishedAt: string;
  /** Publisher's host, e.g. "thehindu.com". */
  publisher: string;
  /** Language name or code as the provider gives it ("English", "es"), or null. */
  language: string | null;
  /** Publisher's country as the provider names it, or null. */
  sourceCountry: string | null;
  /** Discovery layer that found it ("gdelt", "fixture"). */
  via: string;
}

export interface SafetyUpdateSource {
  /** This source's own headline (a cluster may word the story differently per outlet). */
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  sourceType: SourceType;
}

export interface SafetyUpdate {
  id: string;
  /** The lead article's headline, verbatim (the publisher's words). */
  title: string;
  /** English translation of a non-English headline, made by MIRA's classifier; labelled as such. */
  translatedTitle: string | null;
  /** Never generated: only a summary a source itself supplies. Null in the beta. */
  summary: string | null;
  category: SafetyCategory;
  reporting: ReportingStatus;
  reportedLocation: string | null;
  locationPrecision: LocationPrecision;
  /** The latest time the index first saw any article in the cluster (see SafetySourceResult.publishedAt). */
  publishedAt: string;
  /** Year the event happened when the headline states one; null otherwise (never guessed). */
  eventYear: number | null;
  publisher: string;
  originalUrl: string;
  sourceType: SourceType;
  /**
   * Independent reports in the cluster (not a count of incidents): distinct publishers, with
   * copies of one wire story (Reuters, AP, PTI, ANI, IANS, AFP) or near-identical headlines
   * counted once. `sources` still lists every outlet.
   */
  sourceCount: number;
  sources: SafetyUpdateSource[];
  /** Active missing-person or similar: show the source only, no summary. */
  sensitive: boolean;
  retrievedAt: string;
}

export interface SafetyArea {
  /** The name MIRA searched for ("Delhi"). */
  name: string;
  precision: LocationPrecision;
  countryIso: string | null;
  countryName: string | null;
}

export interface SafetyUpdatesData {
  area: SafetyArea;
  windowDays: SafetyWindow;
  updates: SafetyUpdate[];
  counts: { official: number; news: number };
  /** Community reports are a separate signal and stay off until moderation gates are met. */
  community: "unavailable_in_beta";
  checkedAt: string;
}

export const SAFETY_WINDOWS = [7, 30] as const;
export type SafetyWindow = (typeof SAFETY_WINDOWS)[number];
export const DEFAULT_WINDOW: SafetyWindow = 7;

// ── Relevance gate ────────────────────────────────────────────────────────────────────────────

export type GateDecision =
  | { decision: "include"; category: SafetyCategory; reason: string }
  | { decision: "ambiguous"; reason: string }
  | { decision: "exclude"; reason: string };

/** Languages the keyword lists below cover; anything else goes to the classifier (or is left out). */
export const COVERED_LANGUAGES = ["en", "es", "pt", "fr", "de", "it", "hi", "ja", "ko", "ar", "id", "ms", "tr", "zh"] as const;

const LANG_NAMES: Record<string, string> = {
  english: "en", spanish: "es", portuguese: "pt", french: "fr", german: "de", italian: "it", hindi: "hi", japanese: "ja", korean: "ko",
  arabic: "ar", indonesian: "id", malay: "ms", turkish: "tr", chinese: "zh",
};

/** "English" / "en" / "pt-BR" → "en" / "pt"; other names lower-cased ("swedish"); null when absent. */
export function languageCode(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const l = lang.trim().toLowerCase();
  if (LANG_NAMES[l]) return LANG_NAMES[l];
  const m = /^([a-z]{2,3})(?:[-_].*)?$/.exec(l);
  // An unmapped language name ("swedish") stays as itself: known to be outside keyword coverage.
  return m ? m[1] : /^\p{L}[\p{L} ]*$/u.test(l) ? l : null;
}

// Word-bounded (Latin, Devanagari with spaces…) and substring (CJK, Hangul, stems) matchers.
const W = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "iu");
const S = (alts: string) => new RegExp(`(?:${alts})`, "iu");
const any = (text: string, res: RegExp[]) => res.some((r) => r.test(text));

/** Words that make a story about women or girls (not just mentioning one). */
const TARGET = [
  W("women|woman|girls?|female|females|lady|ladies|schoolgirls?|mujer|mujeres|niñas?|chicas?|mulher|mulheres|meninas?|garotas?|femmes?|filles?|jeune femme|passag[eè]res?|voyageuses?|[ée]tudiantes?|frau|frauen|mädchen|schülerin|studentin\\p{L}*|passagierin\\p{L}*|donna|donne|ragazze?|studentess[ae]|passeggera|wanita|perempuan|gadis|kadın\\p{L}*|kızlar\\p{L}*|genç kız\\p{L}*"),
  S("महिला|लड़की|लड़कियों|युवती|छात्रा|女性|女子|少女|女児|女乘客|女學生|女学生|여성|여학생|امرأة|نساء|فتاة|فتيات|سيدة|妇女|女孩"),
];

const SEXUAL = [
  W("rape[ds]?|raping|rapists?|gang-?raped?|sexual(?:ly)? (?:assault\\p{L}*|abus\\p{L}*|harass\\p{L}*)|molest\\p{L}*|grop\\p{L}*|indecent(?:ly)? assault\\p{L}*|indecent exposure|expos(?:ing|ed|es) (?:himself|his genitals|his private parts)|flashers?|upskirt\\p{L}*|voyeur\\p{L}*|outrag\\p{L}* (?:of |the )?modesty"),
  W("agresi[oó]n sexual|abuso sexual|tocamientos|estupro|estuprad[ao]s?|importuna[cç][aã]o sexual|ass[eé]dio sexual|viol|viols|viol[ée]e|agressions? sexuelles?|agress[ée]e?s? sexuellement|attouchements|(?:agredid|aggredit|abusad|molestad|atacad|violentad)[ao]s? (?:sexualmente|sessualmente)|sexuell (?:belästigt|missbraucht|genötigt|bedrängt)|vergewaltig\\p{L}*|sexuelle[rn]? (?:übergriff|belästigung)\\p{L}*|stupro|violenza sessuale|pemerkosaan|pelecehan seksual|tecavüz|cinsel saldırı"),
  S("बलात्कार|दुष्कर्म|यौन उत्पीड़न|छेड़छाड़|छेड़खानी|性的暴行|強制性交|不同意性交|強制わいせつ|不同意わいせつ|痴漢|盗撮|성폭행|성추행|몰카|불법촬영|불법 촬영|اغتصاب|تحرش جنسي|性侵|强奸|強姦|猥亵|猥褻|偷拍|非禮|非礼"),
];

const HARASSMENT = [
  W("#?metoo|harass\\p{L}*|misbehav\\p{L}* with|stalk(?:er|ers|ing|ed)?|being followed|followed (?:home|from|off|into)|follow(?:s|ing)? (?:women|a woman|girls?) (?:home|from|to)|suit (?:des |une )?femmes?|verfolgt|eve[- ]teas\\p{L}*|catcall\\p{L}*|lewd|acos[oa]\\p{L}*|ass[eé]dio|persegui[cç][aã]o|harc[eè]l\\p{L}*|belästig\\p{L}*|nachstell\\p{L}*|stalking|molestie|pelecehan|penguntitan|taciz|ısrarlı takip"),
  S("पीछा|つきまとい|つけ回|ストーカー|스토킹|미행|تحرش|مطاردة|骚扰|騷擾|跟踪|跟蹤|尾随|尾隨"),
];

const ABDUCTION = [
  W("abduct\\p{L}*|kidnap\\p{L}*|missing (?:\\d{1,2}-year-old |teen(?:age)? |young )?(?:woman|women|girls?|schoolgirls?|female)|(?:girl|woman), \\d{1,2}, (?:goes |went |is |reported )?missing|(?:woman|women|girls?) (?:goes |went |has gone |reported |remains? )?missing|lured|secuestr\\p{L}*|desaparecid[ao]s?|sequestr\\p{L}*|enl[eè]v\\p{L}*|disparue?s?|kidnapp\\p{L}*|entführ\\p{L}*|vermisst\\p{L}*|rapit\\p{L}*|scompars\\p{L}*|penculikan|kaçırıl\\p{L}*"),
  S("अपहरण|लापता|誘拐|連れ去り|行方不明|납치|실종|خطف|اختطاف|مفقودة|绑架|拐卖|失踪"),
];

/** An attempted-abduction construction names its victim: "tried to drag her into an SUV". */
const ATTEMPTED_ABDUCTION = [W("(?:tried|attempted|trying) to (?:drag|pull|force|push|bundle|lure) (?:her|(?:a |the )?(?:woman|girl|student|teen)|women|girls) into|(?:dragged|pulled|forced|bundled) (?:her|a woman|a girl) into (?:a |an |the |his )?(?:car|suv|van|vehicle|auto|cab|taxi)")];
/** "Tries to abduct", "kidnap bid": an attempt, whose victim another condition must still establish. */
const ABDUCTION_ATTEMPT = [W("(?:tri(?:es|ed)|attempt(?:s|ed)?|trying) to (?:abduct|kidnap)|attempted (?:abduction|kidnapping)|(?:abduction|kidnap(?:ping)?) (?:bid|attempt)")];

/** A missing-person appeal ("last seen", "appeal to find") about a woman or girl. */
const MISSING_APPEAL = [W("last seen|appeal to (?:find|trace|locate)|missing person appeal")];
const MISSING_WORD = [W("missing")];
/** "she" can mean a woman, a girl, a pet or a ship: never enough on its own. */
const SHE = [W("she")];
const ANIMAL = [W("dogs?|cats?|pets?|pupp(?:y|ies)|kittens?|horses?|cows?|parrots?|birds?|tigress|elephants?|ships?|boats?|vessels?")];
/** Sexual-violence headlines whose only named victims are male ("abuse of boys", "molesting minor boy"). */
const MALE_VICTIM = [W("boys?|schoolboys?|sons?|nephews?|male (?:students?|child|children|victims?|colleagues?|passengers?)|seminarians?")];
/** "Woman arrested for stalking ex-boyfriend": the woman or girl named first is the accused, not the victim. */
const ACCUSED_WOMAN = /(?:^|[:;|–—]\s*)(?:a |an |the )?(?:woman|women|girl|lady|female)(?:,? \d{1,2},?)?(?: \p{L}+)? (?:arrested|booked|held|nabbed|detained|charged|accused|jailed) (?:for|of|over)(?![\p{L}\p{N}])/giu;
/** Impostor drivers: "fake cab drivers", "men posing as taxi drivers". */
const FAKE_DRIVER = [W("fake|bogus|unlicen[cs]ed|unregistered|impostors?|posing as|pretending to be")];
/** "Police station", "petrol station" are not transport. */
const NOT_TRANSPORT = /(?:police|fire|petrol|gas|power|radio|tv|polling) stations?/giu;

const TRAFFICKING = [W("traffick\\p{L}*|traffic (?:girls|women|children|minors|people|persons)|forced prostitution|flesh trade|sex ring|trata de (?:personas|mujeres|blancas)|redes? de trata|explotaci[oó]n sexual|tr[aá]fico de (?:pessoas|mulheres)|explora[cç][aã]o sexual|traite (?:des (?:êtres humains|femmes)|de femmes)|prox[eé]n[eé]tisme|exploitation sexuelle|menschenhandel|zwangsprostitution|tratta|perdagangan orang|insan ticareti"), S("मानव तस्करी|देह व्यापार|人身取引|人身売買|인신매매|الاتجار بالبشر|人口贩卖|拐卖妇女")];
/** Words that mean rape only when the headline is about a woman or girl ("violación" is also a rights/data "violation"). */
const SEXUAL_WITH_TARGET = [W("violaci[oó]n|violad[oa]s?|violentad[oa]s?")];

/** Recruitment/luring patterns the brief lists under trafficking: fake jobs or modelling abroad. */
const LURE = [W("fake (?:overseas |foreign )?(?:job|jobs|work|modell?ing|recruitment) (?:offers?|ads?|agents?|scams?)|job scams? abroad|aliciamento|falsas (?:vagas|ofertas)|ofertas? (?:de (?:empleo|trabajo) )?falsas|captaci[oó]n de (?:mujeres|j[oó]venes)|fausses offres d'emploi|lowongan kerja palsu|modus lowongan|dụ dỗ")];
const ABROAD = [W("abroad|overseas|foreign|exterior|extranjero|étranger|luar negeri|ausland")];

/** "Trafficking" also means drugs, arms, wildlife: only human trafficking counts. */
const TRAFFICKING_HUMAN = [W("human|humans|people|persons|sex|forced|victims?|rescued|women|woman|girls?|minors?|mujeres|pessoas|mulheres|femmes|frauen|êtres humains|personas")];
const NON_HUMAN_TRAFFICKING = [W("drugs?|narcotics?|cocaine|heroin|ganja|cannabis|weapons?|arms|firearms|guns?|wildlife|ivory|timber|sand|liquor|fuel|cattle|traffic (?:jam|congestion|police)|air traffic")];

const SPIKING = [
  W("drink[- ]spik\\p{L}*|drugg(?:ing|ed) (?:women|a woman|girls?|her)|gang drugging|spiked (?:drinks?|with)|spik(?:ed|ing) (?:her |their |women'?s? )?drinks?|needle[- ]spik\\p{L}*|spiking (?:incidents?|reports?|cases?|warning)|date[- ]rape drugs?|roofie\\p{L}*|ghb|sumisi[oó]n qu[ií]mica|burundanga|boa noite,? cinderela|soumission chimique|k\\.?-?o\\.?-?tropfen"),
];

const GBV = [
  W("femicides?|feminicides?|acid (?:attack\\p{L}*|thrown)|honou?r killings?|dowry deaths?|bride burning|feminicidio|femicidio|feminic[ií]dio|f[eé]minicides?|femizid\\p{L}*|femminicidio|kadın cinayeti"),
  S("दहेज हत्या|तेजाब हमला|एसिड अटैक|جرائم الشرف|قتل النساء"),
];

const DOMESTIC = [
  W("domestic (?:violence|abuse)|intimate partner violence|violencia (?:de g[eé]nero|machista|dom[eé]stica)|viol[eê]ncia dom[eé]stica|lei maria da penha|violences conjugales|häusliche gewalt|violenza domestica|kdrt"),
  S("घरेलू हिंसा|家庭内暴力|DV被害|가정폭력|العنف الأسري|家暴"),
];

const TRANSPORT = [
  W("metro|subway|underground|(?:public )?transport|transporte|transports en commun|tube (?:station|train)|trains?|railways?|stations?|railway platform|bus|buses|tram|taxi|taxis|cab|cabs|uber|ola (?:cab|driver)|lyft|grab (?:car|driver|taxi)|bolt driver|didi|ride-?hail\\p{L}*|ride-?shar\\p{L}*|auto-?rickshaws?|rickshaws?|tuk-?tuks?|matatu|okada|ferry|autob[uú]s|cami[oó]n|tren|estaci[oó]n|metr[oô]|[oô]nibus|trem|esta[cç][aã]o|m[eé]tro|rer|gare|vtc|u-bahn|s-bahn|zug|bahnhof|kereta|angkot|ojek|krl|transjakarta"),
  S("मेट्रो|बस|ट्रेन|कैब|ऑटो|電車|駅|地下鉄|バス|タクシー|지하철|버스|택시|مترو|حافلة|تاكسي|地铁|公交|出租车|网约车"),
];

const ADVISORY = [
  W("advisory|advisories|warns?|warning|alerts?|urges?|appeals?|safety tips|caution|helpline|campaign against|crackdown|drive against|alerta|advierte|aviso|alerta para|met en garde|appel à témoins|warnt|warnung|zeugenaufruf|imbauan|uyarı"),
  S("चेतावनी|अलर्ट|注意喚起|警告|주의보|경고|تحذير|提醒|预警"),
];

const VIOLENCE_GENERIC = [W("attack\\p{L}*|assault\\p{L}*|stabb\\p{L}*|beaten|beat up|killed|killings?|murder\\p{L}*|shot|strangled|threaten\\p{L}*|intimidat\\p{L}*|followed|chased|robbed|snatch\\p{L}*|agredid[ao]s?|atacad[ao]s?|asesinad[ao]|agress\\p{L}*|poignard\\p{L}*|angegriffen|aggredit\\p{L}*|saldır\\p{L}*"), S("हमला|हत्या|襲われ|暴行|폭행|اعتداء|袭击")];
/** A transport-service relationship (driver → passenger): the brief's "taxi / ride-hailing attacks". */
const TRANSPORT_SERVICE = [W("(?:cab|taxi|taksi|bus|auto|rickshaw|e-?hailing|ride-?hail\\p{L}*|ride-?shar\\p{L}*|uber|app-?based|private hire) drivers?|drivers? of (?:a |an )?(?:cab|taxi|bus|auto)|conductors?|(?:female|woman|women|girl) passengers?|motorista de aplicativo|chofer de (?:taxi|aplicaci[oó]n)|chauffeur (?:vtc|de taxi)|taksi şoför\\p{L}*|kadın yolcu\\p{L}*")];
/** A warning about a threat (not a witness appeal after one incident). */
const WARNING = [W("warns?|warning|advisory|alerts?|urges? (?:caution|vigilance|women)|caution|met en garde|alerte|alerta|advierte|warnt|warnung|imbau\\p{L}*|uyar\\p{L}*"), S("चेतावनी|注意喚起|警告|呼籲|呼吁|경고|주의|تحذير")];
const POLICE = [W("police|polic[ií]a|polizei|polizia|polisi|gendarmerie|garda|sheriff"), S("पुलिस|警察|警方|경찰|الشرطة|شرطة")];
const TARGETING = [W("targets?|targeting|targeted|preying|preys|approach(?:es|ing)? (?:lone |young )?(?:women|girls)|lone women|women travell?ers|solo women")];

/** Not a place she moves through: online abuse, trolling, deepfakes, cyber-crime. */
const ONLINE = [W("(?:harass\\p{L}*|abus\\p{L}*|threaten\\p{L}*|stalk\\p{L}*|bull(?:y|ied|ying)|trolled|targeted) online|online (?:harassment|abuse|trolling|stalking|threats?|bullying|hate)|cyber\\p{L}*|trolls?|trolled|trolling|deepfakes?|morphed|sextortion|obscene (?:messages?|posts?|comments?|calls?)|(?:stalk|harass|abus|threat)\\p{L}* (?:\\p{L}+ ){0,3}on (?:instagram|facebook|whatsapp|twitter|snapchat|telegram)")];
/** "Woman shares video of harassment on metro on social media": how it surfaced, not where it happened. */
const SOCIAL_MEDIA = [W("social media")];

/**
 * Court procedure (hearings, trials, verdicts, sentences) is a past incident's legal process,
 * not present context: excluded unless an official source issues it as an advisory.
 */
const COURT = [
  W("hearings?|hear (?:a |the )?pleas?|pleas?|trials?(?! rooms?)|verdicts?|jailed|jail terms?|sentenc\\p{L}*|acquit\\p{L}*|convict\\p{L}*|found guilty|pleads? guilty|life imprisonment|rigorous imprisonment|years in (?:jail|prison)|condenad[oa]s?|absuelt[oa]s?|juicio|julgamento|condamn[ée]e?s?|procès|verurteilt|prozess|vonis|sidang"),
  S("判決|懲役|裁判|선고|징역|재판|判决"),
];
/** A court named at the arrest stage ("arrested, produced in court", "bail", "HC"): often a current incident's next step. */
const COURT_MENTION = [W("bail|bailed|(?<!food )courts?|hc|high court|supreme court"), S("जमानत|अदालत|कोर्ट|法院|محكمة")];

/** A protest, march or outrage. When it comes before the incident the story may be the protest: the classifier decides. */
const PROTEST = [W("protests?|protesters?|protested|protesting|(?:women|students|residents|activists|people|villagers|locals|hundreds|thousands|families|parents) (?:march\\p{L}*|hold (?:a )?(?:protest|march|vigil)|stage (?:a )?protest)|candle-?(?:light)? march\\p{L}*|march(?:es)? against|demand\\p{L}* justice|seek\\p{L}* justice|justice for|outrage (?:over|after|as|at|against)|sparks? outrage|public outrage|draws? outrage|dharna|sit-in|agitation|bandh|vigils?")];
const INCIDENT = [...SEXUAL, ...SEXUAL_WITH_TARGET, ...HARASSMENT, ...ABDUCTION, ...GBV, ...TRAFFICKING, ...SPIKING];

/** Where the first match of any pattern starts (Infinity when none matches). */
function firstIndex(text: string, res: RegExp[]): number {
  return Math.min(...res.map((r) => r.exec(text)?.index ?? Infinity));
}

/** Topics that disqualify a headline outright (the brief's exclusion list). Checked first. */
const EXCLUDE_TOPICS: Array<[string, RegExp[]]> = [
  ["historical", [W("anniversary|years after|decades after|years ago|decades ago|years on|years since|decades? on|decades since|a year since|cold case|looking back|remember(?:ing|s)|throwback|in the (?:19|20)\\d0s")]],
  ["opinion", [W("opinion|op-?ed|editorial|column|essay|blog|podcast|explainer|analysis|in an interview|exclusive interview|book review|why we must|it'?s time|we need to talk|perspective")]],
  ["roundup", [W("round-?up|top (?:news|stories)|news (?:highlights|wrap|bulletin)|live updates?|(?:morning|evening|daily|news) briefing|headlines|digest|what happened today|crime news today|news in brief")]],
  ["politics_policy", [W("elections?|electoral|polls? (?:campaign|body)|campaign(?:ing|s)? (?:trail|rally)|manifesto|promises?|pledges?|vows?|rally|rallies|opposition|minister (?:says|said|announces?|slams|lauds)|parliament|assembly (?:session|polls)|lok sabha|rajya sabha|legislation|amendment|ordinance|yojana|budget|allocat\\p{L}*|lawmakers?|mp says|mla says|senator|congressman|governor says|president says|prime minister|new law|laws? (?:to|on|against)|guidelines|initiative|(?:commission|panel) (?:chief|chairperson|head)|launch(?:es|ed)? (?:a |new )?(?:\\p{L}+ ){0,2}(?:programme|program|app|portal)")]],
  ["awareness_event", [W("awareness|sensiti[sz]ation|self-?defen[cs]e|workshops?|seminars?|symposium|panel discussion|training (?:session|programme|program|camp)")]],
  ["statistics_ranking", [W("surveys?|surveyed|rank(?:s|ed|ing|ings)|index|safest|least safe|most unsafe|ncrb|statistics|(?:study|report|figures) (?:finds|found|shows|showed|reveals)|per ?cent of women|\\d+ in \\d+ women")]],
  ["media_award", [W("film (?:on|about|based on|wins|screened|screening)|films? (?:on|about)|documentar\\p{L}*|docu-?series|books? (?:on|about)|book (?:launch\\p{L}*|release\\p{L}*)|novel|memoir|short film|exhibition|awards?|awarded|honou?red (?:for|with)|felicitat\\p{L}*|prizes?")]],
  ["business", [W("stalking horse|entrepreneurs?|entrepreneurship|founders?|start-?ups?|funding|investors?|conference|summit|expo|award (?:ceremony|winners?)|ceo|ipo|stock market|startup|women in (?:tech|business|leadership)|leadership|empowerment|hackathon|webinar")]],
  ["sport", [W("champions?|championship|medals?|tournament|olympi\\p{L}*|world cup|grand slam|cricket(?:er)?s?|football(?:er)?s?|soccer|tennis|athletes?|athletics|marathon|wins? (?:gold|silver|bronze|title|the)|league|match(?:es)? (?:report|preview)|t20|odi|ipl|wpl")]],
  ["entertainment", [W("(?:new|upcoming|debut) film|film (?:release|festival|review|premiere|shoot)|movies?|trailer|box office|actress(?:es)?|actors?|celebrit\\p{L}*|bollywood|hollywood|tollywood|netflix|web series|ott|albums?|singers?|premiere|red carpet|divorce[ds]?|dating rumou?rs?|wedding|reality (?:show|tv)|biopic|star kids?|influencer|pel[ií]cula|actriz|estreno|atriz|novela|estreia|actrice|schauspielerin")]],
  ["accident", [W("road accident|collision|traffic accident|mishap|overturn\\p{L}*|fire broke out|blaze|landslide|flood(?:s|ed|ing|waters)?|electrocut\\p{L}*")]],
  ["incidental", [W("(?:female|woman) (?:witness|driver|passenger injured)")]],
];

/**
 * Words that also turn up in a real incident's headline: "Police condemn attack at bus stop",
 * "accused arrested, produced in court", "woman shares video on social media", "witnesses said",
 * "chased by stalker, she drowned". Never enough to drop a headline: one the gate would include
 * goes to the classifier instead, and one with no women's-safety signal is still left out.
 */
const WEAK_TOPICS: Array<[string, RegExp[]]> = [
  ["politics_policy", [W("bill|scheme|policy|visits|visited|condemn\\p{L}*|condol\\p{L}*")]],
  ["accident", [W("crash(?:es|ed)?|drown\\p{L}*")]],
  ["incidental", [W("witness(?:es)? (?:said|say)|eyewitness(?:es)?")]],
];

/** "…in 2019 case": a year older than last year means a historical case, not current context. */
function oldYear(text: string, now: Date): number | null {
  const years = [...text.matchAll(/(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/g)].map((m) => Number(m[1]));
  const old = years.filter((y) => y < now.getUTCFullYear() - 1);
  return old.length ? Math.max(...old) : null;
}

/** The year a headline says the event happened ("2026 stalking case"), when it says one. */
export function eventYearOf(title: string): number | null {
  const m = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/.exec(title);
  return m ? Number(m[1]) : null;
}

/**
 * The strict, deterministic relevance gate. Include only headlines that are clearly about
 * women's safety; send the ones it can't judge to the classifier; exclude everything else.
 * Never tuned by loosening what counts as relevant.
 *
 * Weak words (WEAK_TOPICS, a court named at the arrest stage, a protest, "social media") never
 * drop a headline on their own: one the gate would include goes to the classifier instead, so a
 * real incident reported alongside them isn't thrown away. With no women's-safety signal, it's
 * still left out.
 */
export function screenHeadline(item: Pick<SafetySourceResult, "title" | "language" | "publisher">, now: Date = new Date()): GateDecision {
  const weak: string[] = [];
  const d = gateHeadline(item, now, weak);
  if (d.decision !== "include" || !weak.length) return d;
  return { decision: "ambiguous", reason: `${d.reason}, but mentions ${weak.join(", ")}` };
}

function gateHeadline(item: Pick<SafetySourceResult, "title" | "language" | "publisher">, now: Date, weak: string[]): GateDecision {
  const text = item.title.normalize("NFKC");
  if (!text.trim()) return { decision: "exclude", reason: "empty" };
  const old = oldYear(text, now);
  if (old !== null) return { decision: "exclude", reason: `historical (${old})` };
  for (const [topic, res] of EXCLUDE_TOPICS) if (any(text, res)) return { decision: "exclude", reason: topic };
  for (const [topic, res] of WEAK_TOPICS) if (any(text, res)) weak.push(topic);

  const official = sourceTypeOf(item.publisher) === "official";
  const advisory = any(text, ADVISORY);
  const officialAdvisory = official && advisory;
  if (any(text, COURT) && !officialAdvisory) return { decision: "exclude", reason: "court procedure" };
  if (any(text, COURT_MENTION) && !officialAdvisory) weak.push("court");
  if (firstIndex(text, PROTEST) < firstIndex(text, INCIDENT)) weak.push("protest / reaction");

  // A woman named only as the accused ("Woman arrested for stalking ex-boyfriend") is not a victim word.
  const accusedWoman = text.search(ACCUSED_WOMAN) >= 0;
  const target = any(text.replace(ACCUSED_WOMAN, " "), TARGET);
  const transport = any(text.replace(NOT_TRANSPORT, " "), TRANSPORT);
  const policeWarning = any(text, POLICE) && any(text, WARNING);

  if (any(text, GBV)) return { decision: "include", category: "gender_based_violence", reason: "gender-based violence term" };
  if (any(text, TRAFFICKING) && !any(text, NON_HUMAN_TRAFFICKING) && (target || any(text, TRAFFICKING_HUMAN))) return { decision: "include", category: "trafficking", reason: "human trafficking" };
  if (any(text, LURE) && any(text, ABROAD) && (target || advisory)) return { decision: "include", category: "trafficking", reason: "trafficking lure pattern" };
  if (any(text, SPIKING)) return { decision: "include", category: "spiking_nightlife", reason: "drink/needle spiking" };
  if (any(text, ONLINE)) return { decision: "exclude", reason: "online, not a place she moves through" };
  if (any(text, SOCIAL_MEDIA)) weak.push("social media");
  if (accusedWoman && !target) return { decision: "exclude", reason: "the woman named is the accused" };
  if (any(text, SEXUAL) || (target && any(text, SEXUAL_WITH_TARGET))) {
    // A woman/girl victim, a public-transport setting, or a police/official warning; never on the crime word alone.
    if (target || transport || policeWarning || officialAdvisory) return { decision: "include", category: transport ? "transport" : "sexual_violence", reason: "sexual violence term" };
    if (any(text, MALE_VICTIM)) return { decision: "exclude", reason: "sexual violence, victims named are male" };
    return { decision: "ambiguous", reason: "sexual violence term without a woman/girl word" };
  }
  if (target && any(text, MISSING_APPEAL)) return { decision: "include", category: "missing_abduction", reason: "missing woman/girl appeal" };
  if (any(text, MISSING_WORD) && any(text, SHE) && !any(text, ANIMAL)) {
    return target ? { decision: "include", category: "missing_abduction", reason: "missing woman/girl" } : { decision: "ambiguous", reason: "missing, 'she' without a woman/girl word" };
  }
  if (any(text, ATTEMPTED_ABDUCTION)) return { decision: "include", category: "missing_abduction", reason: "attempted abduction of a woman/girl" };
  if (any(text, ABDUCTION) && target) return { decision: "include", category: "missing_abduction", reason: "abduction/missing + woman/girl" };
  if (any(text, ABDUCTION_ATTEMPT) && any(text, TRANSPORT_SERVICE)) return { decision: "include", category: "transport", reason: "attempted abduction by a transport driver" };
  if (any(text, HARASSMENT) && target) return { decision: "include", category: transport ? "transport" : "harassment_stalking", reason: "harassment/stalking + woman/girl" };
  if (any(text, DOMESTIC)) {
    // A private case is not a location story; only a public advisory is.
    return advisory || official ? { decision: "include", category: "domestic_violence_advisory", reason: "domestic violence advisory" } : { decision: "exclude", reason: "private domestic case" };
  }
  if (any(text, FAKE_DRIVER) && any(text, TRANSPORT_SERVICE) && (policeWarning || officialAdvisory)) return { decision: "include", category: "transport", reason: "warning about impostor drivers" };
  if (target && any(text, TARGETING) && policeWarning) return { decision: "include", category: "institutional_advisory", reason: "police warning about someone targeting women" };
  if (target && any(text, VIOLENCE_GENERIC) && policeWarning) return { decision: "include", category: "institutional_advisory", reason: "police advisory about violence against women" };
  if (target && any(text, VIOLENCE_GENERIC) && any(text, TRANSPORT_SERVICE)) return { decision: "include", category: "transport", reason: "attack on a woman by/among transport service" };
  // Safety words without a gendered word ("stalking DU students"): the classifier decides; never included on keywords alone.
  if (any(text, HARASSMENT) || any(text, ABDUCTION)) return { decision: "ambiguous", reason: "harassment/abduction term without a woman/girl word" };
  if (target && (any(text, VIOLENCE_GENERIC) || any(text, TARGETING))) return { decision: "ambiguous", reason: "violence/targeting + woman/girl" };
  if (target && advisory && (official || transport)) return { decision: "ambiguous", reason: "advisory mentioning women" };

  const lang = languageCode(item.language);
  if (lang && !(COVERED_LANGUAGES as readonly string[]).includes(lang)) return { decision: "ambiguous", reason: `language ${lang} not covered by keywords` };
  return { decision: "exclude", reason: "not about women's safety" };
}

// ── Structure ─────────────────────────────────────────────────────────────────────────────────

const OFFICIAL_HOSTS = [
  /(^|\.)gov(\.[a-z]{2})?$/, /\.gouv\.[a-z]{2}$/, /\.gob\.[a-z]{2}$/, /\.go\.[a-z]{2}$/, /\.govt\.[a-z]{2}$/, /\.gv\.at$/, /\.gc\.ca$/,
  /\.police\.uk$/, /(^|\.)police\.gov\.[a-z]{2}$/, /\.mil(\.[a-z]{2})?$/, /(^|\.)europa\.eu$/, /(^|\.)admin\.ch$/, /(^|\.)bund\.de$/, /(^|\.)polizei\.[a-z]{2}$/,
];

/** Official = a government, police or public-authority host. Everything else is a news report. */
export function sourceTypeOf(host: string): SourceType {
  const h = host.toLowerCase().replace(/^www\./, "");
  return OFFICIAL_HOSTS.some((r) => r.test(h)) ? "official" : "news";
}

const REPORTING: Array<[ReportingStatus, RegExp[]]> = [
  ["court_outcome", [W("convicted|sentenced|found guilty|jailed|acquitted|condenad[oa]s?|condamn[ée]e?s?|verurteilt"), S("दोषी|有罪|징역")]],
  ["charged", [W("charged|charge ?sheet(?:ed)?|indicted|booked|imputad[oa]|denunciad[oa]|mis en examen|angeklagt")]],
  ["arrest_reported", [W("arrested|arrests?|detained|nabbed|apprehended|in custody|detenid[oa]s?|pres[oa]s?|interpell[ée]e?s?|arr[eê]t[ée]e?s?|festgenommen|ditangkap|gözaltı"), S("गिरफ्तार|逮捕|체포|اعتقال|被捕")]],
  ["under_investigation", [W("investigat\\p{L}*|probe[ds]?|inquiry|enquiry|investiga\\p{L}*|enqu[eê]te|ermittl\\p{L}*"), S("जांच|捜査|수사|تحقيق|调查")]],
  ["allegation", [W("alleg\\p{L}*|accus\\p{L}*|complaint|claims?|fir|presunt[oa]|denuncia|suposto|den[uú]ncia|pr[ée]sum[ée]e?|plainte|mutmaßlich|anzeige"), S("आरोप|शिकायत|疑い|혐의")]],
];

/** The legal status the headline itself states; "reported" when it states none. Official advisories are advisories. */
export function reportingStatusOf(title: string, sourceType: SourceType): ReportingStatus {
  if (sourceType === "official" && any(title, ADVISORY)) return "advisory";
  for (const [status, res] of REPORTING) if (any(title, res)) return status;
  return any(title, ADVISORY) ? "advisory" : "reported";
}

/** Same article under different URLs (tracking params, AMP, mobile hosts) → one key. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www|m|amp|mobile)\./, "");
    const path = u.pathname.replace(/\/amp\/?$/, "/").replace(/\.amp$/, "").replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

const STOP = new Set("the a an and or of in on at to for from by with as is are was were be been has have had after over into near its it this that says said police woman women girl girls man men case news report reports reported update latest".split(" "));

/** Headline tokens for similarity: words for spaced scripts, character bigrams for CJK / Hangul. */
export function headlineTokens(title: string): Set<string> {
  const t = title.normalize("NFKC").toLowerCase();
  const out = new Set<string>();
  for (const w of t.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
  const cjk = t.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, "");
  for (let i = 0; i + 1 < cjk.length; i++) out.add(cjk.slice(i, i + 2));
  return out;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const x of a) if (b.has(x)) common++;
  return common / (a.size + b.size - common);
}

/** Capitalised words and acronyms too common to identify a story. */
const ENTITY_STOP = new Set("police cops court hc sc pm cm fir cctv metro city news live update updates woman women girl girls man men student students accused case says said arrested video watch breaking exclusive new the a an and in on at of to for by her his she he".split(" "));

function capitalised(title: string): Array<{ word: string; initial: boolean; acronym: boolean }> {
  return title
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w, i) => ({ word: w, initial: i === 0, acronym: /^\p{Lu}{2,}$/u.test(w), cap: /^\p{Lu}/u.test(w) }))
    .filter((w) => w.cap)
    .map(({ word, initial, acronym }) => ({ word: word.toLowerCase(), initial, acronym }));
}

/**
 * Names that identify a story ("Mukherjee", "Nagar", "SUV", "DU"). In a Title Case headline
 * every word is capitalised, so only its acronyms count as names there.
 */
export function storyEntities(title: string, areaName = ""): { strict: Set<string>; loose: Set<string> } {
  const words = title.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const caps = capitalised(title);
  const titleCase = words.length >= 4 && caps.length / words.length > 0.6;
  const area = new Set(areaName.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  const keep = (w: string) => w.length >= 2 && !ENTITY_STOP.has(w) && !area.has(w);
  return {
    strict: new Set(caps.filter((c) => (titleCase ? c.acronym : !c.initial || c.acronym)).map((c) => c.word).filter(keep)),
    loose: new Set(caps.map((c) => c.word).filter(keep)),
  };
}

/** Shared names between two headlines: one's clear names found among the other's capitalised words. */
export function sharedEntities(a: ReturnType<typeof storyEntities>, b: ReturnType<typeof storyEntities>): number {
  const shared = new Set<string>();
  for (const x of a.strict) if (b.loose.has(x)) shared.add(x);
  for (const x of b.strict) if (a.loose.has(x)) shared.add(x);
  return shared.size;
}

export interface Candidate extends SafetySourceResult {
  category: SafetyCategory;
  translatedTitle?: string | null;
}

const CLUSTER_SIMILARITY = 0.4;
const CLUSTER_WINDOW_MS = 72 * 3600_000;

/**
 * Groups articles that likely describe the same story, within 72 h of each other: the same
 * canonical URL; or the same category with similar headlines; or at least two shared names
 * ("Mukherjee Nagar", "SUV", "DU") whatever the wording. Four articles about one incident
 * become one cluster with four sources; they are never four incidents. Every source keeps its
 * own headline, so an over-merged cluster still shows what each source said.
 */
export function clusterCandidates(items: Candidate[], areaName = ""): Candidate[][] {
  const clusters: Array<{ items: Candidate[]; tokens: Set<string>[]; entities: Array<ReturnType<typeof storyEntities>>; urls: Set<string> }> = [];
  const sorted = [...items].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  for (const it of sorted) {
    const url = canonicalUrl(it.url);
    const tokens = headlineTokens(it.translatedTitle ?? it.title);
    const entities = storyEntities(it.title, areaName);
    const t = Date.parse(it.publishedAt);
    const home = clusters.find((c) => {
      if (c.urls.has(url)) return true;
      if (!c.items.some((o) => Math.abs(Date.parse(o.publishedAt) - t) <= CLUSTER_WINDOW_MS)) return false;
      if (c.entities.some((e) => sharedEntities(e, entities) >= 2)) return true;
      return c.items[0].category === it.category && c.tokens.some((o) => similarity(o, tokens) >= CLUSTER_SIMILARITY);
    });
    if (home) {
      if (!home.urls.has(url)) home.items.push(it);
      home.urls.add(url);
      home.tokens.push(tokens);
      home.entities.push(entities);
    } else clusters.push({ items: [it], tokens: [tokens], entities: [entities], urls: new Set([url]) });
  }
  return clusters.map((c) => c.items);
}

/** Only http(s) links are ever shown or opened: a javascript:, data: or relative URL is never a source. */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const foldText = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "Delhi man", "Delhi-based", "Delhi-born": the city is someone's origin, not where it happened. */
const ORIGIN_AFTER = /^(?:-(?:based|born|origin)|\s+(?:man|men|woman|women|girl|boy|youth|resident|residents|native|couple|family|businessman|student|techie|doctor|teacher)(?![\p{L}\p{N}]))/u;
const ORIGIN_BEFORE = /(?:from|native of|hails from|resident of|residents of)\s+$/u;

/**
 * How a headline places the story relative to the searched area. GDELT matches the name anywhere
 * in an article, so only the headline's own words can place it there:
 * "named" (the headline names the area), "incidental" (only as someone's origin: "Delhi man",
 * "from Delhi"), or "absent".
 */
export function areaMention(title: string, areaName: string): "named" | "incidental" | "absent" {
  const area = foldText(areaName).trim();
  if (area.length < 2) return "absent";
  const t = foldText(title);
  const hits = [...t.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(area).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "gu"))];
  if (!hits.length) return "absent";
  return hits.some((m) => !ORIGIN_AFTER.test(t.slice(m.index + m[0].length)) && !ORIGIN_BEFORE.test(t.slice(0, m.index))) ? "named" : "incidental";
}

/**
 * Which article represents a story cluster on the card: its headline, publisher and link
 * are what she sees first. Called with at least one item.
 */
export function pickLead(items: Candidate[], areaName = ""): Candidate {
  const byTime = [...items].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  // An official source always leads: an advisory outranks coverage of it (fixed rule, tested).
  const official = byTime.find((c) => sourceTypeOf(c.publisher) === "official");
  if (official) return official;
  // Among news reports: the earliest one whose headline itself names the area, so the card's
  // place is supported by the words she reads; otherwise the earliest report (the original
  // reporting, not a later rewrite or follow-up). Never the most alarming or most recent.
  const placed = areaName ? byTime.find((c) => areaMention(c.translatedTitle ? `${c.title} ${c.translatedTitle}` : c.title, areaName) === "named") : undefined;
  return placed ?? byTime[0];
}

// ── Independent reporting ("Reported by N sources") ──────────────────────────────────────────

const WIRE_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)reuters\.com$/, "reuters"], [/(^|\.)(apnews\.com|ap\.org)$/, "ap"], [/(^|\.)(ptinews\.com|pti\.in)$/, "pti"],
  [/(^|\.)(aninews\.in|ani\.in)$/, "ani"], [/(^|\.)(ians\.in|ianslive\.in)$/, "ians"], [/(^|\.)afp\.com$/, "afp"],
];
/** A headline crediting a wire: "(PTI)", "| Reuters", "IANS:". Case-sensitive: these are agency names. */
const WIRE_CREDIT: Array<[RegExp, string]> = [
  [/\bReuters\b/, "reuters"], [/\(AP\)|\bAssociated Press\b/, "ap"], [/\bPTI\b/, "pti"], [/\bANI\b/, "ani"], [/\bIANS\b/, "ians"], [/\bAFP\b/, "afp"],
];
const CREDIT_STRIP = /\s*[|–—-]\s*(?:PTI|ANI|IANS|Reuters|AFP|AP)\s*$|\((?:PTI|ANI|IANS|Reuters|AFP|AP)\)|^(?:PTI|ANI|IANS|Reuters|AFP)\s*[:|–—-]\s*/g;

/** The wire a copy came from, by the publisher's host or a credit in the headline; null for original reporting. */
export function wireOf(publisher: string, title: string): string | null {
  const host = publisher.toLowerCase().replace(/^www\./, "");
  return WIRE_HOSTS.find(([r]) => r.test(host))?.[1] ?? WIRE_CREDIT.find(([r]) => r.test(title))?.[1] ?? null;
}

function orderedTokens(title: string): string[] {
  return foldText(title.replace(CREDIT_STRIP, " ")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Same words in the same order (≥ 90% by longest common subsequence): a syndicated or lightly edited copy. */
export function nearIdenticalTitles(a: string, b: string): boolean {
  const x = orderedTokens(a);
  const y = orderedTokens(b);
  if (!x.length || !y.length) return false;
  if (x.join("") === y.join("")) return true; // spacing / hyphenation only: "night clubs" = "nightclubs"
  const row = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = row[j];
      row[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return (2 * row[y.length]) / (x.length + y.length) >= 0.9;
}

/**
 * How many independent reports a set of outlets represents: copies of one wire story (the wire's
 * own host, a wire credit, or a near-identical headline) count once. Never more than the outlets.
 */
export function independentReports(sources: Array<Pick<SafetyUpdateSource, "publisher" | "title">>): number {
  const parent = sources.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const wires = sources.map((s) => wireOf(s.publisher, s.title));
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      if ((wires[i] && wires[i] === wires[j]) || nearIdenticalTitles(sources[i].title, sources[j].title)) parent[find(j)] = find(i);
    }
  }
  return new Set(sources.map((_, i) => find(i))).size;
}

/**
 * The classifier's English translation, only when it adds something: never for an English
 * headline, never a copy of the original, and never with a verdict word ("safe", "dangerous")
 * the source didn't write (the same deterministic check as Mira's replies).
 */
export function cleanTranslation(original: string, translation: string | null | undefined, language: string | null): string | null {
  const t = translation?.replace(/\s+/g, " ").trim();
  if (!t || languageCode(language) === "en") return null;
  const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(t) === norm(original)) return null;
  if (companionOutputIssue(t, []) === "safety_verdict") return null;
  return t;
}

/** Small stable hash for ids (client-safe; not for security). */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** One structured update per cluster. Nothing is invented: absent fields stay null. */
export function toUpdate(cluster: Candidate[], area: SafetyArea, retrievedAt: string): SafetyUpdate {
  // Defense in depth: providers already drop non-http(s) links, and a link is never shown without one.
  const linked = cluster.filter((c) => isHttpUrl(c.url));
  const lead = pickLead(linked.length ? linked : cluster, area.name);
  const sources = [...new Map(linked.map((c) => [c.publisher.toLowerCase().replace(/^www\./, ""), c])).values()]
    .map((c) => ({ title: c.title, publisher: c.publisher.replace(/^www\./, ""), url: c.url, publishedAt: c.publishedAt, sourceType: sourceTypeOf(c.publisher) }));
  const sourceType = sourceTypeOf(lead.publisher);
  const latest = cluster.reduce((m, c) => (Date.parse(c.publishedAt) > Date.parse(m) ? c.publishedAt : m), lead.publishedAt);
  // Only a headline that names the area places the story there; otherwise the article merely mentions it.
  const named = cluster.some((c) => areaMention(c.title, area.name) === "named" || (c.translatedTitle ? areaMention(c.translatedTitle, area.name) === "named" : false));
  return {
    id: fnv(canonicalUrl(lead.url)),
    title: lead.title,
    translatedTitle: cleanTranslation(lead.title, lead.translatedTitle, lead.language),
    summary: null,
    category: lead.category,
    reporting: reportingStatusOf(lead.title, sourceType),
    reportedLocation: area.name,
    locationPrecision: named ? area.precision : "mentioned",
    publishedAt: latest,
    eventYear: eventYearOf(lead.title),
    publisher: lead.publisher.replace(/^www\./, ""),
    originalUrl: isHttpUrl(lead.url) ? lead.url : "",
    sourceType,
    sourceCount: independentReports(sources),
    sources,
    sensitive: lead.category === "missing_abduction",
    retrievedAt,
  };
}

/** Inside the chosen window (and not from the future beyond clock skew). */
export function withinWindow(publishedAt: string, windowDays: number, now: Date): boolean {
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) && t <= now.getTime() + 3600_000 && now.getTime() - t <= windowDays * 86_400_000;
}

// ── Words the UI uses (one place, so every screen says the same honest thing) ─────────────────

export const EMPTY_LINE = "No recent women-safety updates found from the sources MIRA checked in this area.";
export const EMPTY_CAVEAT = "This does not mean no incidents occurred.";
export const FAILED_LINE = "MIRA couldn't check recent updates right now.";
const SOURCES_PARTIAL = "Some sources couldn't be checked.";
export const PARTIAL_LINE = `${SOURCES_PARTIAL} Showing what was available.`;
export const RELEVANCE_PARTIAL_LINE = "Some reports couldn't be checked for relevance.";
/** Said instead of EMPTY_LINE when nothing was shown but not everything could be checked. */
export const PARTIAL_EMPTY_LINE = "MIRA can't say there are no recent updates.";
export const NOT_A_RATING = "Recent reports as published: not a rating of the area, and not proof that something did or didn't happen.";
/** The evidence source that stands for the relevance classifier (unassessed headlines make a result partial). */
export const RELEVANCE_SOURCE = "relevance-check";

/** Why a result is partial, in her words: sources not reached, reports not checked for relevance, or both. */
export function partialLine(sources: SourceState[], empty: boolean): string {
  const relevance = sources.some((s) => s.source === RELEVANCE_SOURCE && s.state !== "ready");
  const provider = sources.some((s) => s.source !== RELEVANCE_SOURCE && s.state !== "ready") || !relevance;
  const why = [provider ? SOURCES_PARTIAL : null, relevance ? RELEVANCE_PARTIAL_LINE : null].filter(Boolean).join(" ");
  return `${why} ${empty ? PARTIAL_EMPTY_LINE : "Showing what was available."}`;
}

/** "2 days ago", "5 hours ago": the age is always shown. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - Date.parse(iso));
  const h = Math.floor(ms / 3600_000);
  if (h < 1) return "Less than an hour ago";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/**
 * The provider's date is when its index first saw the article (GDELT's "seendate"), not the
 * publisher's own publication time: "First indexed 2 days ago (25 Sep)".
 */
export function indexedLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = Number.isFinite(d.getTime()) ? ` (${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]})` : "";
  return `First indexed ${ageLabel(iso, now).toLowerCase()}${day}`;
}

/**
 * Where the source places it, never closer than it supports: "Delhi (city-level)" when the
 * headline names the city; "Mentions Delhi" when only the article does.
 */
export function locationLabel(u: Pick<SafetyUpdate, "reportedLocation" | "locationPrecision">): string | null {
  if (!u.reportedLocation) return null;
  if (u.locationPrecision === "mentioned") return `Mentions ${u.reportedLocation}`;
  return u.locationPrecision === "exact" || u.locationPrecision === "neighbourhood" ? u.reportedLocation : `${u.reportedLocation} (${u.locationPrecision}-level)`;
}

/** The compact Home line: a count of stories found, never a judgement. */
export function summaryLine(d: SafetyUpdatesData): string {
  const n = d.updates.length;
  return n ? `${n} recent women-safety update${n === 1 ? "" : "s"} from the past ${d.windowDays} days` : EMPTY_LINE;
}
