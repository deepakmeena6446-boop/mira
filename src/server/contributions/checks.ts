import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import {
  CHECK_OPTIONS,
  PASSED_WITHIN_M,
  bandForHour,
  checkQuestion,
  chooseCheck,
  evaluateClaim,
  localWhen,
  type Band,
  type CheckAnswer,
  type CheckCandidate,
} from "@/domain/contributions";
import { HELP_CLASSES, dedupeHelpPoints, isNight, projectOnRoute, type HelpPoint } from "@/domain/help-points";
import { openState } from "@/domain/opening-hours";
import { encodeGeohash } from "@/domain/geohash";
import { haversineMeters } from "@/domain/pilot";
import { decryptText, encryptText } from "@/server/crypto";
import { conflict, forbidden, notFound } from "@/server/http/errors";
import type { GeoProvider } from "@/server/providers/geo";
import { PLACE_KEY_RE, alreadyContributed, placeSignalsFor, recordPlaceSignal, type ReceiptOutcome } from "./receipts";

/**
 * MIRA Checks (blueprint §7 "confirm and correct beats report"; engine doc §11): after a walk
 * she completed, at most ONE small question about a Help Point she actually passed (≤ 60 m from
 * where the journey went), chosen by the value of the answer. Always skippable; no reward loop.
 *
 * Evidence: the journey's own points, captured inside the arrival transaction right before
 * they're deleted, held ENCRYPTED on the check while it's being prepared (minutes), then dropped.
 * Only the place id and name she passed remain, for ≤ 24 h.
 */

export const CHECK_TTL_MS = 24 * 3600_000;
const MAX_LOOKUP_RADIUS_M = 1500;

const evidenceSchema = z.object({
  tz: z.string().max(64).nullable(),
  /** [lat, lon, epoch minute] rounded to ~10 m. */
  p: z.array(z.tuple([z.number(), z.number(), z.number()])).min(2).max(40),
});

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * HOOK (called from the arrival path, inside its transaction, BEFORE trip_locations are deleted).
 * Never breaks an arrival: runs in a savepoint and swallows its own errors. Walks only (on a ride
 * she can't tell whether a pharmacy was open), durable accounts only (non-lighting signals need one).
 */
export async function captureCheckEvidence(tx: postgres.TransactionSql, journeyId: string, now: Date): Promise<void> {
  try {
    await tx.savepoint(async (sp) => {
      const [j] = await sp<{ user_id: string | null; mode: string; tz: string | null; durable: boolean }[]>`
        SELECT j.user_id, j.mode, j.tz, (u.email_hash IS NOT NULL) AS durable FROM journeys j JOIN users u ON u.id = j.user_id WHERE j.id = ${journeyId}`;
      if (!j?.user_id || !j.durable || j.mode !== "walk") return;
      const pts = await sp<{ lat: number; lon: number; at: Date }[]>`SELECT lat, lon, at FROM trip_locations WHERE journey_id = ${journeyId} ORDER BY at LIMIT 40`;
      if (pts.length < 2) return; // no journey evidence, no question
      const evidence = { tz: j.tz, p: pts.map((p) => [round(p.lat), round(p.lon), Math.round(new Date(p.at).getTime() / 60_000)]) };
      await sp`
        INSERT INTO mira_checks (user_id, journey_id, state, evidence_enc, created_at, expires_at)
        VALUES (${j.user_id}, ${journeyId}, 'preparing', ${encryptText(JSON.stringify(evidence), "check_evidence")}, ${now}, ${new Date(now.getTime() + CHECK_TTL_MS)})
        ON CONFLICT (journey_id) DO NOTHING`;
    });
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "checks.capture_failed", error: err instanceof Error ? err.name : "unknown" }));
  }
}

/** Metres from a place to the walked path (points joined in order). */
function offPath(p: { lat: number; lon: number }, path: Array<[number, number]>): number {
  if (path.length === 1) return haversineMeters(p, { lon: path[0][0], lat: path[0][1] });
  return projectOnRoute(p, path).offM;
}

type Prepared = { id: string; user_id: string; evidence_enc: string | null };

/**
 * Turn captured evidence into at most one ready question (or nothing). ONE Help Point lookup per
 * journey (one point, radius covering the walked points; provider results are cached).
 */
async function prepareOne(sql: postgres.Sql, geo: GeoProvider, row: Prepared, now: Date): Promise<"ready" | "none" | "retry"> {
  let ev: z.infer<typeof evidenceSchema>;
  try {
    ev = evidenceSchema.parse(JSON.parse(decryptText(row.evidence_enc ?? "", "check_evidence")));
  } catch {
    await sql`DELETE FROM mira_checks WHERE id = ${row.id} AND state = 'preparing'`;
    return "none";
  }
  const pts = ev.p.map(([lat, lon, m]) => ({ lat, lon, at: new Date(m * 60_000) }));
  const centre = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
  const radius = Math.min(MAX_LOOKUP_RADIUS_M, Math.max(150, ...pts.map((p) => haversineMeters(centre, p))) + PASSED_WITHIN_M);
  let found: HelpPoint[];
  try {
    found = await geo.helpPlaces([centre], radius);
  } catch {
    return "retry"; // provider down: try again on the next run (the check expires in ≤ 24 h anyway)
  }
  const path = pts.map((p) => [p.lon, p.lat] as [number, number]);
  const passed = dedupeHelpPoints(found).filter((h) => HELP_CLASSES[h.cls].hoursMatter && PLACE_KEY_RE.test(h.id) && offPath(h, path) <= PASSED_WITHIN_M);
  if (!passed.length) {
    await sql`DELETE FROM mira_checks WHERE id = ${row.id} AND state = 'preparing'`;
    return "none";
  }
  const signals = await placeSignalsFor(sql, passed.map((h) => h.id), now);
  const info = await Promise.all(
    passed.map(async (h) => {
      // When she passed it: the time of the nearest walked point, on the local clock.
      const nearest = pts.reduce((a, b) => (haversineMeters(h, b) < haversineMeters(h, a) ? b : a));
      const when = localWhen(nearest.at, ev.tz, h.lon);
      const band: Band = bandForHour(when.hour);
      const listed = h.open24h ? "open" : h.schedule ? openState(h.schedule, { day: when.weekday, minute: when.hour * 60 + when.minute }).state : "unknown";
      const providerOpen = listed === "open" || listed === "closing" ? true : listed === "closed" ? false : null;
      const candidate: CheckCandidate = {
        key: h.id,
        name: h.name,
        hoursKnown: Boolean(h.open24h || h.schedule),
        contested: evaluateClaim("open", { weekday: when.weekday, band }, signals.get(h.id) ?? [], now).state === "differ",
        alreadyAnswered: await alreadyContributed(sql, row.user_id, h.id, "open", now),
      };
      return { h, when, band, providerOpen, candidate };
    }),
  );
  const last = pts[pts.length - 1];
  const night = isNight(localWhen(last.at, ev.tz, last.lon).hour);
  const chosen = chooseCheck(info.map((i) => i.candidate), night);
  const pick = chosen && info.find((i) => i.candidate.key === chosen.key);
  if (!pick) {
    await sql`DELETE FROM mira_checks WHERE id = ${row.id} AND state = 'preparing'`;
    return "none";
  }
  await sql`
    UPDATE mira_checks SET state = 'ready', evidence_enc = NULL, kind = 'place_open', subject_key = ${pick.h.id}, subject_name = ${pick.h.name.slice(0, 120)},
      question = ${checkQuestion(pick.h.name)}, options = ${sql.json(CHECK_OPTIONS.map((o) => ({ ...o })))}, weekday = ${pick.when.weekday}, band = ${pick.band},
      provider_open = ${pick.providerOpen}, area5 = ${encodeGeohash(pick.h.lat, pick.h.lon, 5)}
    WHERE id = ${row.id} AND state = 'preparing'`;
  return "ready";
}

/** Prepare captured checks (worker, and lazily when she opens Contribute). Bounded per run. */
export async function prepareChecks(sql: postgres.Sql, geo: GeoProvider, now: Date, opts: { userId?: string; limit?: number } = {}): Promise<{ ready: number; none: number }> {
  const rows = opts.userId
    ? await sql<Prepared[]>`SELECT id, user_id, evidence_enc FROM mira_checks WHERE state = 'preparing' AND expires_at > ${now} AND user_id = ${opts.userId} ORDER BY created_at LIMIT ${opts.limit ?? 2}`
    : await sql<Prepared[]>`SELECT id, user_id, evidence_enc FROM mira_checks WHERE state = 'preparing' AND expires_at > ${now} ORDER BY created_at LIMIT ${opts.limit ?? 20}`;
  let ready = 0;
  let none = 0;
  for (const r of rows) {
    const o = await prepareOne(sql, geo, r, now);
    if (o === "ready") ready++;
    if (o === "none") none++;
  }
  return { ready, none };
}

export interface CheckView {
  id: string;
  /** The journey it came from (while that journey still exists), so After-arrival can show it. */
  journeyId: string | null;
  question: string;
  placeName: string;
  options: Array<{ value: string; label: string }>;
  expiresAt: string;
}

export async function listChecks(sql: postgres.Sql, userId: string, now: Date): Promise<CheckView[]> {
  const rows = await sql<{ id: string; journey_id: string | null; question: string; subject_name: string; options: Array<{ value: string; label: string }>; expires_at: Date }[]>`
    SELECT id, journey_id, question, subject_name, options, expires_at FROM mira_checks
    WHERE user_id = ${userId} AND state = 'ready' AND expires_at > ${now} ORDER BY created_at DESC LIMIT 5`;
  return rows.map((r) => ({ id: r.id, journeyId: r.journey_id, question: r.question, placeName: r.subject_name, options: r.options, expiresAt: new Date(r.expires_at).toISOString() }));
}

/**
 * Her answer. The check is closed first (so a double tap can't answer twice) and its place link is
 * dropped; "Didn't notice" / skip record nothing at all.
 */
export async function answerCheck(
  sql: postgres.Sql,
  user: { id: string; durable: boolean },
  id: string,
  answer: CheckAnswer,
  now: Date,
  country: string | null,
): Promise<{ recorded: boolean; outcome: ReceiptOutcome | null }> {
  if (!user.durable) throw forbidden("Add an email to your account in Me to answer MIRA Checks — it keeps it to one voice per person.");
  const [c] = await sql<{ subject_key: string; weekday: number; band: Band; provider_open: boolean | null; area5: string | null }[]>`
    UPDATE mira_checks m SET state = 'answered', answered_at = ${now}, subject_key = NULL, subject_name = NULL, area5 = NULL
    FROM (SELECT id, subject_key, weekday, band, provider_open, area5 FROM mira_checks WHERE id = ${id} AND user_id = ${user.id} AND state = 'ready' AND expires_at > ${now} FOR UPDATE) old
    WHERE m.id = old.id
    RETURNING old.subject_key, old.weekday, old.band, old.provider_open, old.area5`;
  if (!c) {
    const [exists] = await sql`SELECT state FROM mira_checks WHERE id = ${id} AND user_id = ${user.id}`;
    if (exists?.state === "answered") throw conflict("already_answered", "You've already answered this one.");
    throw notFound("This question has expired.");
  }
  if (answer !== "open" && answer !== "closed") return { recorded: false, outcome: null };
  const outcome = await recordPlaceSignal(sql, {
    userId: user.id,
    kind: "place_status",
    placeKey: c.subject_key,
    claim: answer,
    weekday: c.weekday,
    band: c.band,
    providerAgrees: c.provider_open === null ? null : c.provider_open === (answer === "open"),
    area5: c.area5,
    country,
    now,
  });
  return { recorded: outcome !== "duplicate", outcome };
}
