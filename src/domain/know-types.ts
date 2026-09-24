/**
 * Public KNOW response contract (architecture §4). Everything here may be shown to
 * anyone: sourced OSM facts, graph-derived routes, and released aggregates only.
 */
import type { TimeBand, TimeContext } from "./time-bands";

export interface SourceInfo {
  name: string;
  licence: string;
  attribution: string;
  copyrightUrl: string;
  snapshotDate: string; // ISO
}

export interface Fact {
  label: string;
  value?: string;
  note?: string;
}

export interface PlaceSummaryPublic {
  id: string;
  name: string;
  kind: string;
  placeType: string;
  point: { lat: number; lon: number };
}

export type CommunityCoverage = "no_recent_community_data" | "multiple_independent_recent_observations";

export interface CommunityObservation {
  id: string;
  polarity: "positive" | "environmental" | "incident";
  category: string;
  text: string;
  timeBand: TimeBand;
  releasedWeek: string; // YYYY-MM-DD (Monday IST)
  expiresAt: string;
}

export interface CommunitySection {
  coverage: CommunityCoverage;
  selectedBand: TimeBand;
  matching: CommunityObservation[];
  otherBands: CommunityObservation[];
  statement: string;
}

export interface RouteResult {
  id: "A" | "B";
  label: "Shortest" | "Alternate";
  lengthM: number;
  minutes: number;
  geometry: Array<[number, number]>; // [lon, lat]
  steps: Array<{ name: string; lengthM: number }>;
  facts: Fact[];
}

export interface KnowResponse {
  kind: "place" | "route";
  coverage: "inside" | "outside";
  time: { context: TimeContext; band: TimeBand; label: string };
  source: SourceInfo;
  place?: PlaceSummaryPublic & { facts: Fact[]; nearby: Fact[] };
  origin?: { name: string; point?: { lat: number; lon: number } };
  destination?: PlaceSummaryPublic;
  routes?: RouteResult[];
  routeUnavailable?: { reason: "not_near_walkway" | "no_connected_path" | "same_place"; message: string };
  comparison?: string[];
  community: CommunitySection;
  unknowns: string[];
}

export interface PilotInfo {
  available: boolean;
  name: string;
  bounds: { south: number; north: number; west: number; east: number };
  timezone: string;
  source: SourceInfo | null;
  tiles: { url: string; attribution: string };
}
