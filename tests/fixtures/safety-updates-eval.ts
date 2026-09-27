/**
 * Evaluation set for the Women Safety Intelligence relevance gate (brief B20). Synthetic but
 * realistic headlines, written before tuning. Labels follow the brief's definition of
 * relevance and are never changed to make the gate pass:
 * - "include": clearly women-safety relevant; the deterministic gate must include it.
 * - "exclude": must never be surfaced.
 * - "ambiguous": the deterministic gate may send it to the classifier or exclude it; it must
 *   NOT include it on keywords alone.
 */
export interface EvalCase {
  title: string;
  language: string;
  publisher: string;
  expect: "include" | "exclude" | "ambiguous";
  category?: string;
  note?: string;
}

export const EVAL_NOW = new Date("2026-09-27T12:00:00Z");

export const EVAL_CASES: EvalCase[] = [
  // ── Should include (brief B20 list first) ──
  { title: "Woman sexually assaulted near Rajiv Chowk metro station, police register case", language: "English", publisher: "hindustantimes.com", expect: "include", category: "transport" },
  { title: "Police warn of serial harasser targeting women near university campus", language: "English", publisher: "met.police.uk", expect: "include", category: "harassment_stalking" },
  { title: "Ride-hailing driver arrested for assaulting female passenger", language: "English", publisher: "straitstimes.com", expect: "include", category: "transport", note: "assault + female passenger + ride-hailing" },
  { title: "Attempted abduction of woman outside shopping centre, suspect fled", language: "English", publisher: "abc.net.au", expect: "include", category: "missing_abduction" },
  { title: "Police issue drink spiking warning after reports at city centre bars", language: "English", publisher: "bbc.co.uk", expect: "include", category: "spiking_nightlife" },
  { title: "Stalking reports rise in Shibuya as women describe being followed home", language: "English", publisher: "japantimes.co.jp", expect: "include", category: "harassment_stalking" },
  { title: "Trafficking ring that lured women with fake job offers busted in Lagos", language: "English", publisher: "punchng.com", expect: "include", category: "trafficking" },
  { title: "Transport authority advisory: report harassment of women on night buses via new helpline", language: "English", publisher: "tfl.gov.uk", expect: "include", category: "transport" },
  { title: "Man arrested for groping woman on crowded train", language: "English", publisher: "nypost.com", expect: "include", category: "transport" },
  { title: "Acid attack on woman in Hyderabad, accused absconding", language: "English", publisher: "thehindu.com", expect: "include", category: "gender_based_violence" },
  { title: "Femicide in São Paulo suburb prompts protest", language: "English", publisher: "reuters.com", expect: "include", category: "gender_based_violence" },
  { title: "Two held for molesting college student near bus stop", language: "English", publisher: "timesofindia.indiatimes.com", expect: "include", category: "transport" },
  { title: "Missing girl, 16, last seen at Oxford Circus; police appeal for information", language: "English", publisher: "standard.co.uk", expect: "include", category: "missing_abduction" },
  { title: "Needle spiking incidents reported at two Paris nightclubs", language: "English", publisher: "france24.com", expect: "include", category: "spiking_nightlife" },
  { title: "Police launch domestic violence advisory and 24-hour helpline ahead of holidays", language: "English", publisher: "police.gov.sg", expect: "include", category: "domestic_violence_advisory" },
  { title: "Taxi driver charged with rape of passenger in Johannesburg", language: "English", publisher: "news24.com", expect: "include", category: "transport" },
  { title: "Women report being stalked after using ride-share app, company investigating", language: "English", publisher: "theguardian.com", expect: "include", category: "transport" },
  { title: "Indecent exposure on Northern line: British Transport Police appeal", language: "English", publisher: "btp.police.uk", expect: "include", category: "transport" },
  { title: "Girl kidnapped from school gate rescued within hours", language: "English", publisher: "gulfnews.com", expect: "include", category: "missing_abduction" },
  { title: "Honour killing: young woman found dead, family members arrested", language: "English", publisher: "dawn.com", expect: "include", category: "gender_based_violence" },
  // Other languages
  { title: "Mujer denuncia agresión sexual en el metro de Ciudad de México", language: "Spanish", publisher: "eluniversal.com.mx", expect: "include", category: "transport" },
  { title: "Detienen a hombre por acoso a mujeres en el transporte público", language: "Spanish", publisher: "milenio.com", expect: "include", category: "transport" },
  { title: "Feminicidio en Guadalajara: vecinos exigen justicia", language: "Spanish", publisher: "informador.mx", expect: "include", category: "gender_based_violence" },
  { title: "Polícia prende suspeito de estupro no metrô de São Paulo", language: "Portuguese", publisher: "g1.globo.com", expect: "include", category: "transport" },
  { title: "Mulher é vítima de importunação sexual em ônibus no Rio", language: "Portuguese", publisher: "oglobo.globo.com", expect: "include", category: "transport" },
  { title: "Agression sexuelle dans le RER B : une femme porte plainte", language: "French", publisher: "leparisien.fr", expect: "include", category: "transport" },
  { title: "Soumission chimique : la police alerte les étudiantes après plusieurs cas", language: "French", publisher: "ouest-france.fr", expect: "include", category: "spiking_nightlife" },
  { title: "Frau in S-Bahn sexuell belästigt – Polizei sucht Zeugen", language: "German", publisher: "berliner-zeitung.de", expect: "include", category: "transport", note: "'sexuell belästigt' via belästig + Frau" },
  { title: "दिल्ली मेट्रो में महिला से छेड़छाड़, आरोपी गिरफ्तार", language: "Hindi", publisher: "livehindustan.com", expect: "include", category: "transport" },
  { title: "電車内で痴漢の疑い 会社員の男を逮捕", language: "Japanese", publisher: "nhk.or.jp", expect: "include", category: "transport" },
  { title: "지하철서 여성 상대 성추행 혐의 30대 체포", language: "Korean", publisher: "yna.co.kr", expect: "include", category: "transport" },
  { title: "Kadına ısrarlı takip yapan şüpheli gözaltına alındı", language: "Turkish", publisher: "hurriyet.com.tr", expect: "include", category: "harassment_stalking" },
  { title: "Polisi tangkap pelaku pelecehan seksual terhadap perempuan di KRL", language: "Indonesian", publisher: "kompas.com", expect: "include", category: "transport" },
  { title: "القبض على متهم بالتحرش بفتاة في محطة مترو", language: "Arabic", publisher: "youm7.com", expect: "include", category: "transport" },

  // ── Should exclude (brief B20 list first) ──
  { title: "Female athlete wins gold at national championships", language: "English", publisher: "espn.com", expect: "exclude" },
  { title: "Actress launches new film about friendship", language: "English", publisher: "variety.com", expect: "exclude" },
  { title: "Women founders conference draws record attendance", language: "English", publisher: "techcrunch.com", expect: "exclude" },
  { title: "Politician promises women's safety programme if elected", language: "English", publisher: "ndtv.com", expect: "exclude" },
  { title: "Jewellery shop robbery: female witness describes gunmen", language: "English", publisher: "news24.com", expect: "exclude" },
  { title: "Celebrity couple announce divorce after five years", language: "English", publisher: "people.com", expect: "exclude" },
  { title: "Crime news today: roundup of arrests across the city", language: "English", publisher: "localpaper.com", expect: "exclude" },
  { title: "Remembering the 1998 campus assault case, 28 years on", language: "English", publisher: "thehindu.com", expect: "exclude" },
  { title: "Opinion: We need to talk about how cities treat women", language: "English", publisher: "theguardian.com", expect: "exclude" },
  // More hard negatives (over-inclusion traps)
  { title: "Woman elected mayor of Nairobi in historic win", language: "English", publisher: "nation.africa", expect: "exclude" },
  { title: "Women's cricket team clinches series against Australia", language: "English", publisher: "espncricinfo.com", expect: "exclude" },
  { title: "Woman killed in road accident on highway", language: "English", publisher: "tribune.com.pk", expect: "exclude" },
  { title: "Drug trafficking gang busted, 40 kg cocaine seized", language: "English", publisher: "punchng.com", expect: "exclude" },
  { title: "Wildlife trafficking: ivory haul seized at port", language: "English", publisher: "standardmedia.co.ke", expect: "exclude" },
  { title: "Stock prices spiking after rate cut", language: "English", publisher: "bloomberg.com", expect: "exclude" },
  { title: "Cabinet approves bill on women's reservation", language: "English", publisher: "indianexpress.com", expect: "exclude" },
  { title: "Women in tech summit announces 2027 speakers", language: "English", publisher: "forbes.com", expect: "exclude" },
  { title: "Mother of three opens bakery in Shoreditch", language: "English", publisher: "timeout.com", expect: "exclude" },
  { title: "Mother says her son is missing after trek", language: "English", publisher: "kathmandupost.com", expect: "exclude", note: "missing + mother: not a woman/girl missing" },
  { title: "Journalists face online harassment, press body says", language: "English", publisher: "rsf.org", expect: "exclude", note: "harassment without a woman/girl subject" },
  { title: "Data violación: la empresa reconoce una filtración", language: "Spanish", publisher: "elpais.com", expect: "exclude", note: "'violación' as violation, no woman" },
  { title: "Série de cambriolages à Lyon, la police appelle à la vigilance", language: "French", publisher: "leprogres.fr", expect: "exclude" },
  { title: "Bollywood actress alleges harassment on film set", language: "English", publisher: "filmfare.com", expect: "exclude", note: "celebrity/entertainment" },
  { title: "Women's safety index ranks cities, report says", language: "English", publisher: "somesite.com", expect: "exclude", note: "rankings are never surfaced" },
  { title: "Man jailed in 2019 stalking case finally sentenced", language: "English", publisher: "bbc.co.uk", expect: "exclude", note: "historical case" },
  { title: "Explainer: what the new harassment law means for women", language: "English", publisher: "scroll.in", expect: "exclude" },
  { title: "Live updates: city council votes on women's safety budget", language: "English", publisher: "citynews.ca", expect: "exclude" },
  { title: "Air traffic controllers strike delays flights", language: "English", publisher: "reuters.com", expect: "exclude" },
  { title: "Mujeres emprendedoras celebran feria en Bogotá", language: "Spanish", publisher: "eltiempo.com", expect: "exclude" },
  { title: "Atriz estreia nova novela na TV", language: "Portuguese", publisher: "gshow.globo.com", expect: "exclude" },
  { title: "Domestic violence: man sentenced for assaulting wife", language: "English", publisher: "stuff.co.nz", expect: "exclude", note: "private domestic case, no advisory" },
  { title: "Grab driver wins award for honesty after returning wallet", language: "English", publisher: "thestar.com.my", expect: "exclude" },

  // ── Ambiguous: must not be included on keywords alone ──
  { title: "Woman stabbed near railway station late at night", language: "English", publisher: "news.sky.com", expect: "ambiguous", note: "violence against a woman in public; gender may be incidental" },
  { title: "Chain snatchers targeting women on morning walks, residents say", language: "English", publisher: "deccanherald.com", expect: "ambiguous" },
  { title: "Kvinna överfallen i centrala Stockholm", language: "Swedish", publisher: "aftonbladet.se", expect: "ambiguous", note: "language outside keyword coverage" },
  { title: "Mwanamke ashambuliwa kituo cha basi Dar es Salaam", language: "Swahili", publisher: "mwananchi.co.tz", expect: "ambiguous", note: "language outside keyword coverage" },
];

/** Near-duplicate coverage of one incident (brief B8) — must become ONE update with 4 sources. */
export const DUPLICATE_STORY = [
  { title: "Woman sexually assaulted on Delhi Metro Yellow Line, accused arrested", publisher: "hindustantimes.com", url: "https://www.hindustantimes.com/cities/delhi-news/woman-sexually-assaulted-metro-yellow-line-101.html?utm_source=x", at: "2026-09-25T08:00:00Z" },
  { title: "Delhi Metro Yellow Line: woman sexually assaulted, accused arrested by police", publisher: "timesofindia.indiatimes.com", url: "https://timesofindia.indiatimes.com/city/delhi/woman-sexually-assaulted-yellow-line/articleshow/1.cms", at: "2026-09-25T10:30:00Z" },
  { title: "Accused arrested after woman sexually assaulted on Yellow Line metro in Delhi", publisher: "ndtv.com", url: "https://www.ndtv.com/delhi-news/accused-arrested-woman-sexually-assaulted-yellow-line-metro-1", at: "2026-09-25T12:00:00Z" },
  { title: "Woman sexually assaulted on Delhi Metro Yellow Line, accused arrested", publisher: "m.hindustantimes.com", url: "https://m.hindustantimes.com/cities/delhi-news/woman-sexually-assaulted-metro-yellow-line-101.html/amp", at: "2026-09-25T08:05:00Z" },
  { title: "Delhi Police arrest man for sexually assaulting woman on metro Yellow Line", publisher: "delhipolice.gov.in", url: "https://delhipolice.gov.in/press/yellow-line-arrest", at: "2026-09-25T14:00:00Z" },
];

/** Same category and city, different incidents — must stay separate. */
export const DISTINCT_STORIES = [
  { title: "Woman harassed at Kashmere Gate bus stop, complaint filed", publisher: "hindustantimes.com", url: "https://www.hindustantimes.com/a", at: "2026-09-24T08:00:00Z" },
  { title: "Man stalks college student in Rohini for weeks, arrested", publisher: "ndtv.com", url: "https://www.ndtv.com/b", at: "2026-09-24T09:00:00Z" },
];

/**
 * A real GDELT DOC 2.0 response (tests/fixtures/gdelt-sample.json, query "Delhi" + harassment
 * terms, captured 2026-09-27), labelled by hand BEFORE the gate was run on it. Real headlines
 * often omit "woman": those go to the classifier rather than being guessed in or out.
 */
export const LIVE_SAMPLE_LABELS: Record<string, EvalCase["expect"]> = {
  "Delhi HC agrees to hear plea seeking takedown": "exclude",
  "तरुण तेजपाल की सजा के खिलाफ अपील": "exclude",
  "Delhi HC to hear plea alleging CJP leaders circulated deepfake": "exclude",
  "# MeToo floodgates open at NLU Delhi": "ambiguous",
  "Hardeep Singh Mundian Hits Back": "exclude",
  "I Was Lucky That I Got Saved": "include",
  "3 accused of stalking DU students in SUV": "ambiguous",
  "Mukherjee Nagar harassment case": "ambiguous",
};
