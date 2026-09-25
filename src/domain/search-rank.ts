import { haversineMeters } from "./pilot";

/**
 * Ranking for "Where to?" results merged from several sources (MIRA's local map data,
 * Photon, Nominatim). What you typed matters most; distance only breaks ties — so
 * "India Gate" finds India Gate, not a nearby "State Bank of India".
 */
export interface RankableHit {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceM?: number;
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** 0 = exact name, 1 = name starts with it, 2 = every word present, 3+ = partial/fuzzy (worse the more words missing). */
export function textScore(name: string, query: string): number {
  const n = norm(name);
  const q = norm(query);
  if (!q) return 9;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = q.split(" ").filter((w) => w.length > 1);
  const nameWords = n.split(" ");
  const present = words.filter((w) => nameWords.some((nw) => nw.startsWith(w)));
  if (words.length && present.length === words.length) return 2;
  return 3 + (words.length ? (words.length - present.length) / words.length : 1) * 3;
}

/** Walking destinations: beyond this, a result is almost certainly a same-name place elsewhere. */
export const FAR_M = 150_000;
const SAME_PLACE_M = 300;

export function rankPlaces<T extends RankableHit>(hits: T[], query: string, near?: { lat: number; lon: number }, limit = 8): T[] {
  const withDist = hits.map((h) => (near ? { ...h, distanceM: h.distanceM ?? Math.round(haversineMeters(near, h)) } : h));
  // Drop far-away namesakes when there's anything within reach.
  const within = near ? withDist.filter((h) => (h.distanceM ?? 0) <= FAR_M) : withDist;
  const pool = within.length ? within : withDist;
  const scored = pool
    .map((h) => ({ h, s: textScore(h.name, query) }))
    .filter((x) => x.s <= 5) // at least a third of the words must match (people type extra words like "IGI Airport")
    .sort((a, b) => a.s - b.s || (a.h.distanceM ?? 0) - (b.h.distanceM ?? 0));
  // Same name within a few hundred metres is the same place (sources overlap); keep the best-ranked.
  const out: T[] = [];
  for (const { h } of scored) {
    if (out.some((o) => norm(o.name) === norm(h.name) && haversineMeters(o, h) < SAME_PLACE_M)) continue;
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
