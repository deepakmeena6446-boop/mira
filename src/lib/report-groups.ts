import { CATEGORY_POLARITY, type Category } from "@/domain/report/taxonomy";

/** Where Report was opened from (a UI-only hint in the URL: never a place, never an id). */
export const REPORT_FROM = ["journey", "unsafe", "mira", "contribute", "map", "home", "me"] as const;
export type ReportFrom = (typeof REPORT_FROM)[number];
export type ReportGroup = "street" | "happened";

export function parseReportFrom(v: unknown): ReportFrom | null {
  return typeof v === "string" && (REPORT_FROM as readonly string[]).includes(v) ? (v as ReportFrom) : null;
}

/**
 * Which group of report tiles comes first (docs/launch-ux/06 §3.13). After a journey, from "I feel
 * unsafe", from Mira, or with an incident preset: "Something that happened". Otherwise — Contribute,
 * the map, Home, Me, or nothing — "On the street" first: everyday observations for everyone.
 */
export function reportGroupOrder(from: ReportFrom | null, preset: Category | null): [ReportGroup, ReportGroup] {
  const incident = preset !== null && CATEGORY_POLARITY[preset] === "incident";
  return from === "journey" || from === "unsafe" || from === "mira" || incident ? ["happened", "street"] : ["street", "happened"];
}
