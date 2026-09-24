/** REPORT field vocabularies (product spec §5). Labels use everyday words. */

export const INVOLVEMENTS = ["experienced", "witnessed"] as const;
export type Involvement = (typeof INVOLVEMENTS)[number];

export const CATEGORIES = [
  "harassment",
  "following_stalking",
  "unwanted_touching",
  "threatening_behaviour",
  "transport_issue",
  "environment",
  "positive_condition",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  harassment: "Harassment",
  following_stalking: "Being followed",
  unwanted_touching: "Unwanted touching",
  threatening_behaviour: "Threats or intimidation",
  transport_issue: "Transport problem",
  environment: "Street environment",
  positive_condition: "Something positive",
  other: "Something else",
};

export const CATEGORY_HINT: Record<Category, string> = {
  harassment: "Comments, gestures, staring",
  following_stalking: "Someone followed or kept watching",
  unwanted_touching: "Groping or unwanted contact",
  threatening_behaviour: "Threats, aggression",
  transport_issue: "Waits, crowding, drivers",
  environment: "Lighting, footpaths, isolation",
  positive_condition: "Good lighting, people around, help",
  other: "Anything not listed",
};

export const RECENCIES = ["today", "yesterday", "past_week", "earlier_unsure"] as const;
export type Recency = (typeof RECENCIES)[number];
export const RECENCY_LABEL: Record<Recency, string> = {
  today: "Today",
  yesterday: "Yesterday",
  past_week: "In the past week",
  earlier_unsure: "Earlier / not sure",
};

export const REPORT_TIME_BANDS = ["day", "evening", "late", "unsure"] as const;
export type ReportTimeBand = (typeof REPORT_TIME_BANDS)[number];
export const REPORT_TIME_LABEL: Record<ReportTimeBand, string> = {
  day: "Day (6 am–6 pm)",
  evening: "Evening (6–10 pm)",
  late: "Late (10 pm–6 am)",
  unsure: "Not sure",
};

export type Polarity = "positive" | "environmental" | "incident";
export const CATEGORY_POLARITY: Record<Category, Polarity> = {
  harassment: "incident",
  following_stalking: "incident",
  unwanted_touching: "incident",
  threatening_behaviour: "incident",
  transport_issue: "environmental",
  environment: "environmental",
  positive_condition: "positive",
  other: "incident",
};

/**
 * Moderator-assignable structured tags. Fixed allowlist: free-text tags are never
 * accepted, so structured content cannot carry identifying details.
 */
export const TAGS_BY_CATEGORY: Record<Category, readonly string[]> = {
  harassment: ["verbal", "gestures", "staring"],
  following_stalking: [],
  unwanted_touching: ["in_crowd"],
  threatening_behaviour: [],
  transport_issue: ["long_wait", "overcrowding", "transport_unavailable", "driver_behaviour"],
  environment: ["poor_lighting", "broken_footpath", "no_footpath", "isolated_stretch", "obstruction"],
  positive_condition: ["good_lighting", "people_around", "helpful_staff", "shops_open"],
  other: [],
};

export const TAG_PHRASE: Record<string, string> = {
  verbal: "verbal harassment",
  gestures: "harassing gestures",
  staring: "persistent staring",
  in_crowd: "unwanted touching in crowds",
  long_wait: "long waits for transport",
  overcrowding: "overcrowded transport",
  transport_unavailable: "difficulty finding transport",
  driver_behaviour: "problems with drivers",
  poor_lighting: "poor lighting",
  broken_footpath: "broken footpaths",
  no_footpath: "missing footpaths",
  isolated_stretch: "isolated stretches",
  obstruction: "obstructed walkways",
  good_lighting: "good lighting",
  people_around: "people around",
  helpful_staff: "helpful staff nearby",
  shops_open: "shops open",
};

export function isValidTag(category: Category, tag: string): boolean {
  return TAGS_BY_CATEGORY[category].includes(tag);
}

export const NARRATIVE_MAX = 1000;
