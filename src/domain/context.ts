import type { RouteLighting } from "./lighting";
import { HELP_CLASSES, SOURCE_NAME, type HelpPoint } from "./help-points";

/**
 * The context item read-model (safety context engine doc §4, stage S1). One internal shape
 * for "what MIRA knows" — a claim, its source, how recent, how confident, and what isn't
 * known — computed at request time from existing data (lighting, Help Points, released notes).
 * No table: MIRA stores nothing new here.
 *
 * Truth and confidence come from these deterministic adapters. AI (Mira) may only decide which
 * items matter to her now and how to say them; it receives items, never produces them.
 * Claim types are a controlled vocabulary: "safety", "danger" or "area reputation" are not claims.
 */
export type ClaimType = "lighting" | "help_point_class" | "place_hours" | "community_note";
export type Confidence = "official" | "corroborated" | "single_source" | "unverified" | "conflicting";

export interface ContextItem {
  id: string;
  claim: ClaimType;
  /** Structured value; presentation comes from a template for the claim type. */
  value: string | number | boolean | null;
  subject: { kind: "route" } | { kind: "place"; placeId: string; name: string } | { kind: "area"; precisionM: number };
  source: { id: string; name: string };
  /** Year (or ISO date) the underlying fact was observed/edited, when known. */
  observedAt: string | null;
  confidence: Confidence;
  unknowns: string[];
}

export function lightingItems(l: RouteLighting | null): ContextItem[] {
  if (!l) return [];
  const f = l.freshness;
  const items: ContextItem[] = [];
  const mapped = l.summary.lit - (l.confirmed?.lit ?? 0);
  if (l.sources.osm)
    items.push({
      id: "lighting:osm",
      claim: "lighting",
      value: mapped,
      subject: { kind: "route" },
      source: { id: "osm", name: "OpenStreetMap" },
      observedAt: f?.osmTo ? String(f.osmTo) : null,
      confidence: "single_source",
      unknowns: [`${l.summary.unknown}% of the way not known`, "map tags say nothing about whether lights work tonight"],
    });
  if (l.sources.walkers && l.confirmed?.lit)
    items.push({
      id: "lighting:walkers",
      claim: "lighting",
      value: l.confirmed.lit,
      subject: { kind: "route" },
      source: { id: "mira_walkers", name: "MIRA walkers" },
      observedAt: null,
      confidence: "corroborated", // ≥ 3 distinct voters agreeing, last 90 days (domain/lighting.ts)
      unknowns: [],
    });
  if (l.sources.poles && l.summary.poles)
    items.push({
      id: "lighting:poles",
      claim: "lighting",
      value: l.summary.poles,
      subject: { kind: "route" },
      source: { id: "mapillary", name: "Mapillary street imagery" },
      observedAt: f?.polesTo ? String(f.polesTo) : null,
      confidence: "single_source",
      unknowns: ["a pole is not necessarily a working light"],
    });
  if (!items.length)
    items.push({ id: "lighting:none", claim: "lighting", value: null, subject: { kind: "route" }, source: { id: "none", name: "no source" }, observedAt: null, confidence: "unverified", unknowns: ["lighting not known for these streets"] });
  return items;
}

export function helpPointItems(points: HelpPoint[], max = 3): ContextItem[] {
  return points.slice(0, max).map((p) => ({
    id: `help:${p.id}`,
    claim: "help_point_class",
    value: p.cls,
    subject: { kind: "place", placeId: p.id, name: p.name },
    source: { id: p.source, name: SOURCE_NAME[p.source] },
    observedAt: null,
    confidence: "single_source",
    unknowns: p.open24h ? [] : p.hours ? ["listed hours may be out of date"] : ["hours not known", "whether it is staffed right now"],
  }));
}

export function noteItem(n: { id: string; text: string; week?: string }): ContextItem {
  return {
    id: `note:${n.id}`,
    claim: "community_note",
    value: n.text,
    subject: { kind: "area", precisionM: 1200 },
    source: { id: "mira_reports", name: "MIRA reports (reviewed, ≥ 5 people)" },
    observedAt: n.week ?? null,
    confidence: "corroborated",
    unknowns: ["exact place and time"],
  };
}

/** The one sentence each claim type may produce (output contract §8). Templates contain no verdict words. */
export function contextLine(item: ContextItem): string {
  const src = `${item.source.name}${item.observedAt ? `, ${item.observedAt}` : ""}`;
  switch (item.claim) {
    case "lighting":
      if (item.value === null) return "Lighting: not known for these streets.";
      return item.source.id === "mira_walkers"
        ? `${item.value}% confirmed lit by MIRA walkers.`
        : item.source.id === "mapillary"
          ? `${item.value}% has streetlight poles seen in street imagery (${src}).`
          : `${item.value}% mapped as lit (${src}).`;
    case "help_point_class":
      return `${item.subject.kind === "place" ? item.subject.name : "A place"}: ${HELP_CLASSES[item.value as keyof typeof HELP_CLASSES]?.label ?? "Help Point"} (${src}).`;
    case "place_hours":
      return `Listed hours: ${String(item.value)} (${src}).`;
    case "community_note":
      return `Community note: ${String(item.value)}`;
  }
}
