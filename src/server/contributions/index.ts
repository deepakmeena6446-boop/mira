import "server-only";
import type postgres from "postgres";
import { placeStatus, type Band, type Correction, type PlaceStatus } from "@/domain/contributions";
import { DEFAULT_STEWARD, impactLine, impactSummary, stewardStatus, type ImpactSummary, type ReceiptRow, type StewardStatus, type StewardThresholds } from "@/domain/reputation";
import { encodeGeohash } from "@/domain/geohash";
import { haversineMeters } from "@/domain/pilot";
import { getEnv } from "@/server/config/env";
import { badRequest, forbidden } from "@/server/http/errors";
import type { GeoProvider } from "@/server/providers/geo";
import { PLACE_KEY_RE, decidePending, placeSignalsFor, recordPlaceSignal, type ReceiptOutcome } from "./receipts";
import { prepareChecks } from "./checks";

export { captureCheckEvidence, prepareChecks, listChecks, answerCheck, type CheckView } from "./checks";
export { recordLightingReceipt, recordPlaceSignal, decidePending } from "./receipts";

/** Beta thresholds with env overrides (STEWARD_*). Not final. */
export function stewardThresholds(): StewardThresholds {
  const env = getEnv();
  const n = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));
  return {
    minVerified: n(env.STEWARD_MIN_VERIFIED, DEFAULT_STEWARD.minVerified),
    minActiveDays: n(env.STEWARD_MIN_ACTIVE_DAYS, DEFAULT_STEWARD.minActiveDays),
    minAreas: n(env.STEWARD_MIN_AREAS, DEFAULT_STEWARD.minAreas),
    minAgreement: env.STEWARD_MIN_AGREEMENT_PCT === undefined ? DEFAULT_STEWARD.minAgreement : Number(env.STEWARD_MIN_AGREEMENT_PCT) / 100,
    minAccountDays: n(env.STEWARD_MIN_ACCOUNT_DAYS, DEFAULT_STEWARD.minAccountDays),
  };
}

export interface ImpactView {
  summary: Omit<ImpactSummary, "flags">;
  line: string | null;
  steward: StewardStatus;
}

/** Her impact from her own receipts only. Pending, differing, expired never count; incident reports have no receipts. */
export async function impactFor(sql: postgres.Sql, user: { id: string; durable: boolean }, now: Date): Promise<ImpactView> {
  const rows = await sql<{ kind: ReceiptRow["kind"]; status: ReceiptRow["status"]; counted: boolean; legacy_unverifiable: boolean; day: string; area_key: string | null }[]>`
    SELECT kind, status, counted, legacy_unverifiable, to_char(day, 'YYYY-MM-DD') AS day, area_key FROM contribution_receipts WHERE user_id = ${user.id}`;
  const [u] = await sql<{ created_at: Date }[]>`SELECT created_at FROM users WHERE id = ${user.id}`;
  const summary = impactSummary(rows.map((r) => ({ kind: r.kind, status: r.status, counted: r.counted, legacyUnverifiable: r.legacy_unverifiable, day: r.day, areaKey: r.area_key })));
  const steward = stewardStatus(summary, { durable: user.durable, createdAt: new Date(u?.created_at ?? now) }, stewardThresholds(), now);
  const { flags: _flags, ...rest } = summary;
  void _flags; // flags are internal: they appear only as a plain "what's still needed" line
  return { summary: rest, line: impactLine(summary), steward };
}

// ── Corrections ─────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * "Correct something": a structured correction about a place she picked in search. The place is
 * re-found on the server (never trusted from the client) so the key is a real provider place.
 * Coordinates are used for that lookup and a ~5 km area hash only; they're never stored.
 */
export async function submitCorrection(
  sql: postgres.Sql,
  geo: GeoProvider,
  user: { id: string; durable: boolean },
  input: { placeKey?: string; name: string; lat: number; lon: number; claim: Correction; country: string | null },
  now: Date,
): Promise<{ outcome: ReceiptOutcome; placeName: string }> {
  if (!user.durable) throw forbidden("Add an email to your account in Me to correct places — it keeps it to one voice per person.");
  const at = { lat: input.lat, lon: input.lon };
  const hits = (await geo.search(input.name, at)).filter((h) => PLACE_KEY_RE.test(h.id) && haversineMeters(at, h) <= 150);
  const place =
    hits.find((h) => h.id === input.placeKey) ??
    hits.find((h) => norm(h.name) === norm(input.name)) ??
    hits.filter((h) => haversineMeters(at, h) <= 60).sort((a, b) => haversineMeters(at, a) - haversineMeters(at, b))[0];
  if (!place) throw badRequest("place_unknown", "MIRA couldn't match that place. Try choosing it from the search results.");
  const outcome = await recordPlaceSignal(sql, {
    userId: user.id,
    kind: "correction",
    placeKey: place.id,
    claim: input.claim,
    weekday: null,
    band: null,
    providerAgrees: null,
    area5: encodeGeohash(place.lat, place.lon, 5),
    country: input.country,
    now,
  });
  return { outcome, placeName: place.name };
}

// ── Help Point integration (the lead wires this into src/server/help-points) ────────

/**
 * What the community currently says about these places at a local weekday × band. Only
 * corroborated claims are true here (≥ 2 independent voices, disagreement → reportsDiffer);
 * a single voice never changes anything. Places with no signals are absent from the map.
 */
export async function placeStatusFor(sql: postgres.Sql, placeKeys: string[], at: { weekday: number; band: Band }, now = new Date()): Promise<Map<string, PlaceStatus>> {
  const keys = [...new Set(placeKeys.filter((k) => PLACE_KEY_RE.test(k)))].slice(0, 200);
  const signals = await placeSignalsFor(sql, keys, now);
  const out = new Map<string, PlaceStatus>();
  for (const [k, s] of signals) if (s.length) out.set(k, placeStatus(s, at, now));
  return out;
}

// ── Worker ──────────────────────────────────────────────────────────────────────────

/** The `contributions` worker job: prepare captured checks, then decide/expire pending receipts. */
export async function runContributionsJob(sql: postgres.Sql, geo: GeoProvider, now: Date): Promise<{ checksReady: number; checksNone: number; checked: number; verified: number; contradicted: number }> {
  const prepared = await prepareChecks(sql, geo, now, { limit: 20 });
  const decided = await decidePending(sql, now, 300);
  return { checksReady: prepared.ready, checksNone: prepared.none, ...decided };
}
