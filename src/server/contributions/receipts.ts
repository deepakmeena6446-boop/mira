import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { cellsForRoute, type LitVote, type WalkerCell } from "@/domain/lighting";
import {
  CLAIM_GROUPS,
  LIGHTING_WINDOW_DAYS,
  PENDING_MAX_DAYS,
  WINDOW_DAYS,
  evaluateClaim,
  evaluateLighting,
  groupOf,
  isTimed,
  receiptDecision,
  sampleCells,
  type Band,
  type PlaceClaim,
  type PlaceSignal,
} from "@/domain/contributions";
import { decryptText, encryptText, hmacHex } from "@/server/crypto";
import { isoWeek, litVoterHash } from "@/server/lighting";

/*
 * ── Privacy design (read with docs/CONTRIBUTIONS.md) ─────────────────────────────────────
 * 1. Signal stores are the truth and stay UNLINKABLE: lit_votes and place_signals carry only a
 *    keyed hash of (person, subject, week) and the day. No user id, no trip, no time of day.
 * 2. contribution_receipts is a separate per-person ledger (so she can see honest impact): kind,
 *    status, day, country, area_key = hmac(person, ~5 km geohash) and subject_hash =
 *    hmac(person, subject). Both hashes are keyed with a server secret, differ per person, and
 *    can't be joined across people or reversed without the key.
 * 3. Subject links are AES-GCM encrypted. `subject_enc` is removed on decision. New place
 *    receipts retain `decision_enc` for at most 31 days so later contradictions can revoke
 *    credit; historical receipts lack this link and cannot be recomputed. Pending receipts
 *    are decided or expired within 30 days (places) or 90 days (lighting).
 * 4. subject_hash is cleared 30 days after the decision (it's only needed for diminishing returns).
 * 5. Deleting the account deletes receipts and checks (FK cascade). Signals stay, unlinkable.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export type ReceiptKind = "lighting" | "place_status" | "correction";
export type ReceiptOutcome = "pending" | "verified" | "contradicted" | "duplicate";

export const PLACE_KEY_RE = /^(g:[A-Za-z0-9_-]{1,255}|osm:(node|way|relation)\/[0-9]{1,20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
/** Diminishing returns: only the first verified contribution per subject in this window counts. */
export const COUNT_ONCE_DAYS = 30;

const DAY_MS = 86_400_000;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export const subjectHash = (userId: string, subject: string) => hmacHex("contrib-subject", `${userId}|${subject}`);
export const areaKey = (userId: string, geohash5: string) => hmacHex("contrib-area", `${userId}|${geohash5.slice(0, 5)}`);
const placeSubject = (placeKey: string, claim: PlaceClaim) => `place|${placeKey}|${groupOf(claim)}`;
/** Shared opaque claim id for current receipts; no user id or location coordinates. */
const claimKey = (placeKey: string, claim: PlaceClaim, weekday: number | null, band: Band | null) =>
  hmacHex("place-claim", `${placeKey}|${groupOf(claim)}|${weekday ?? "-"}|${band ?? "-"}`);

const subjectSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("lit"), v: z.enum(["lit", "partly", "dark"]), c: z.array(z.string().regex(/^[0-9b-hjkmnp-z]{8}$/)).max(12) }),
  z.object({
    k: z.literal("place"),
    p: z.string().regex(PLACE_KEY_RE),
    c: z.enum(Object.values(CLAIM_GROUPS).flat() as [PlaceClaim, ...PlaceClaim[]]),
    w: z.number().int().min(0).max(6).nullable(),
    b: z.enum(["day", "evening", "late"]).nullable(),
    pv: z.boolean().nullable(),
  }),
]);
type Subject = z.infer<typeof subjectSchema>;

// ── Lighting ─────────────────────────────────────────────────────────────────────────

/**
 * Called right after a "Was the way lit?" answer is stored (api/lighting/vote). Keeps a PENDING
 * receipt with an encrypted sample of ≤ 8 of the street cells (not the route) so it can be decided
 * later by the existing walker rule. One receipt per ~1 km area per week (re-answering updates the
 * same lit_votes rows, so it isn't a new contribution).
 */
export async function recordLightingReceipt(sql: postgres.Sql, userId: string, route: Array<[number, number]>, vote: LitVote, now: Date): Promise<ReceiptOutcome> {
  const cells = cellsForRoute(route).slice(0, 400);
  if (!cells.length) return "duplicate";
  const mid = cells[Math.floor(cells.length / 2)];
  const sh = subjectHash(userId, `lit|${mid.slice(0, 6)}`);
  const [dup] = await sql`SELECT 1 FROM contribution_receipts WHERE user_id = ${userId} AND subject_hash = ${sh} AND created_at > ${new Date(now.getTime() - 7 * DAY_MS)}`;
  if (dup) return "duplicate";
  const subject: Subject = { k: "lit", v: vote, c: sampleCells(cells, 8) };
  const [row] = await sql<ReceiptRow[]>`
    INSERT INTO contribution_receipts (user_id, kind, day, area_key, subject_hash, subject_enc, created_at)
    VALUES (${userId}, 'lighting', ${dayOf(now)}, ${areaKey(userId, mid)}, ${sh}, ${encryptText(JSON.stringify(subject), "contribution_subject")}, ${now})
    RETURNING id, user_id, kind, subject_enc, subject_hash, created_at`;
  return decideReceipt(sql, row, now);
}

/** Walker counts for her sampled cells with HER voice counted at most once per cell (not once per week). */
async function lightingCells(sql: postgres.Sql, userId: string, cells: string[], now: Date): Promise<WalkerCell[]> {
  if (!cells.length) return [];
  const since = new Date(now.getTime() - LIGHTING_WINDOW_DAYS * DAY_MS);
  const rows = await sql<{ cell: string; value: number; voter_hash: string }[]>`
    SELECT cell, value, voter_hash FROM lit_votes WHERE cell = ANY(${cells}) AND identity_version = 2 AND day > ${since}`;
  const weeks = new Set<string>();
  for (let t = since.getTime(); t <= now.getTime() + DAY_MS; t += DAY_MS) weeks.add(isoWeek(new Date(t)));
  return cells.map((cell) => {
    // Her per-stretch voice, plus week-keyed voices from before votes were keyed per stretch.
    const mine = new Set([litVoterHash(userId, cell), ...[...weeks].map((w) => hmacHex("lit-vote", `${userId}:${cell}:${w}`))]);
    const out: WalkerCell = { cell, lit: 0, partly: 0, dark: 0 };
    let herCounted = false;
    for (const r of rows) {
      if (r.cell !== cell) continue;
      if (mine.has(r.voter_hash)) {
        if (herCounted) continue; // her other weeks don't corroborate her
        herCounted = true;
      }
      if (r.value === 1) out.lit++;
      else if (r.value === -1) out.dark++;
      else out.partly++;
    }
    return out;
  });
}

// ── Places (MIRA Checks and corrections) ─────────────────────────────────────────────

export interface PlaceSignalInput {
  userId: string;
  kind: "place_status" | "correction";
  placeKey: string;
  claim: PlaceClaim;
  /** Local weekday/band when she was there (time-dependent claims only). */
  weekday: number | null;
  band: Band | null;
  /** Did the provider's listed hours agree with her answer at that time (null = no listing)? */
  providerAgrees: boolean | null;
  /** ~5 km geohash of the place, for her area diversity (only a keyed hash is stored). */
  area5: string | null;
  country: string | null;
  now: Date;
}

/**
 * Store one voice about a place (unlinkable signal) and her private receipt. One voice per person
 * per place and claim group per validity window: the receipt ledger is the guard, because the
 * signal's voter hash rotates weekly and can't tell weeks apart.
 */
export async function recordPlaceSignal(sql: postgres.Sql, input: PlaceSignalInput): Promise<ReceiptOutcome> {
  const { userId, placeKey, claim, now } = input;
  if (!PLACE_KEY_RE.test(placeKey)) throw new Error("invalid place key");
  const group = groupOf(claim);
  const timed = isTimed(claim);
  if (timed && (input.weekday === null || input.band === null)) throw new Error("time-dependent claim without weekday/band");
  const weekday = timed ? input.weekday : null;
  const band = timed ? input.band : null;
  const sh = subjectHash(userId, placeSubject(placeKey, claim));
  const ck = claimKey(placeKey, claim, weekday, band);
  const subject: Subject = { k: "place", p: placeKey, c: claim, w: weekday, b: band, pv: timed ? input.providerAgrees : null };
  const row = await sql.begin(async (tx) => {
    // Serialise one person's writes about one subject (double taps, two tabs).
    await tx`SELECT pg_advisory_xact_lock(hashtext(${sh}))`;
    const [dup] = await tx`SELECT 1 FROM contribution_receipts WHERE user_id = ${userId} AND subject_hash = ${sh} AND NOT legacy_unverifiable AND created_at > ${new Date(now.getTime() - WINDOW_DAYS[group] * DAY_MS)}`;
    if (dup) return null;
    const voter = hmacHex("place-signal", `${userId}:${placeKey}:${group}:${isoWeek(now)}`);
    await tx`
      INSERT INTO place_signals (place_key, claim_group, claim, weekday, band, voter_hash, day)
      VALUES (${placeKey}, ${group}, ${claim}, ${weekday}, ${band}, ${voter}, ${dayOf(now)})
      ON CONFLICT (place_key, claim_group, voter_hash) DO UPDATE SET claim = EXCLUDED.claim, weekday = EXCLUDED.weekday, band = EXCLUDED.band, day = EXCLUDED.day`;
    const [r] = await tx<ReceiptRow[]>`
      INSERT INTO contribution_receipts (user_id, kind, day, country, area_key, subject_hash, subject_enc, decision_enc, claim_key, created_at)
      VALUES (${userId}, ${input.kind}, ${dayOf(now)}, ${input.country}, ${input.area5 ? areaKey(userId, input.area5) : null}, ${sh},
              ${encryptText(JSON.stringify(subject), "contribution_subject")}, ${encryptText(JSON.stringify(subject), "contribution_subject")}, ${ck}, ${now})
      RETURNING id, user_id, kind, subject_enc, subject_hash, created_at`;
    return r;
  });
  if (!row) return "duplicate";
  await recomputePlaceReceipts(sql, ck, placeKey, now);
  const [decided] = await sql<{ status: ReceiptOutcome }[]>`SELECT status FROM contribution_receipts WHERE id = ${row.id}`;
  return decided.status;
}

async function placeSignals(sql: postgres.Sql | postgres.TransactionSql, placeKey: string, now: Date): Promise<PlaceSignal[]> {
  const rows = await sql<{ claim: PlaceClaim; day: string; weekday: number | null; band: Band | null; voter_hash: string }[]>`
    SELECT claim, to_char(day, 'YYYY-MM-DD') AS day, weekday, band, voter_hash FROM place_signals
    WHERE place_key = ${placeKey} AND day > ${new Date(now.getTime() - 31 * DAY_MS)}`;
  return rows.map((r) => ({ claim: r.claim, day: r.day, weekday: r.weekday, band: r.band, voter: r.voter_hash }));
}

/** Everything the rule needs, per place, in one query (Help Points, check selection). */
export async function placeSignalsFor(sql: postgres.Sql, placeKeys: string[], now: Date): Promise<Map<string, PlaceSignal[]>> {
  const out = new Map<string, PlaceSignal[]>(placeKeys.map((k) => [k, []]));
  if (!placeKeys.length) return out;
  const rows = await sql<{ place_key: string; claim: PlaceClaim; day: string; weekday: number | null; band: Band | null; voter_hash: string }[]>`
    SELECT place_key, claim, to_char(day, 'YYYY-MM-DD') AS day, weekday, band, voter_hash FROM place_signals
    WHERE place_key = ANY(${placeKeys}) AND day > ${new Date(now.getTime() - 31 * DAY_MS)}`;
  for (const r of rows) out.get(r.place_key)?.push({ claim: r.claim, day: r.day, weekday: r.weekday, band: r.band, voter: r.voter_hash });
  return out;
}


/** Reevaluate every still-linkable receipt for one claim, including already credited rows. */
export async function recomputePlaceReceipts(sql: postgres.Sql, ck: string, placeKey: string, now: Date): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${ck}))`;
    // Read after taking the claim lock so an older snapshot cannot overwrite a newer contradiction.
    const signals = await placeSignals(tx, placeKey, now);
    const rows = await tx<{ id: string; user_id: string; subject_hash: string | null; decision_enc: string | null; created_at: Date }[]>`
      SELECT id, user_id, subject_hash, decision_enc, created_at FROM contribution_receipts
      WHERE claim_key = ${ck} AND decision_enc IS NOT NULL ORDER BY created_at, id FOR UPDATE`;
    for (const row of rows) {
      let subject: Subject | null = null;
      try { subject = subjectSchema.parse(JSON.parse(decryptText(row.decision_enc!, "contribution_subject"))); } catch { /* expire unreadable evidence */ }
      const age = now.getTime() - new Date(row.created_at).getTime();
      const outcome = subject?.k === "place" ? receiptDecision(evaluateClaim(subject.c, { weekday: subject.w, band: subject.b }, signals, now, subject.pv)) : null;
      const status = !subject || age > 31 * DAY_MS ? "expired" : outcome?.status ?? "pending";
      const by = status === "verified" && outcome?.status === "verified" ? outcome.by : null;
      const counted = status === "verified" && row.subject_hash !== null && !(await tx`
        SELECT 1 FROM contribution_receipts o WHERE o.user_id = ${row.user_id} AND o.id <> ${row.id}
          AND o.subject_hash = ${row.subject_hash} AND o.status = 'verified' AND o.counted AND NOT o.legacy_unverifiable
          AND o.created_at <= ${row.created_at} AND o.created_at > ${new Date(new Date(row.created_at).getTime() - COUNT_ONCE_DAYS * DAY_MS)} LIMIT 1`).length;
      await tx`UPDATE contribution_receipts SET status = ${status}, verified_by = ${by}, counted = ${counted},
        decided_at = ${status === "pending" ? null : now}, subject_enc = ${status === "pending" ? row.decision_enc : null} WHERE id = ${row.id}`;
    }
  });
}

/** Has she already given a voice about this place's claim group within its window? */
export async function alreadyContributed(sql: postgres.Sql, userId: string, placeKey: string, claim: PlaceClaim, now: Date): Promise<boolean> {
  const [r] = await sql`SELECT 1 FROM contribution_receipts WHERE user_id = ${userId} AND NOT legacy_unverifiable AND subject_hash = ${subjectHash(userId, placeSubject(placeKey, claim))}
                        AND created_at > ${new Date(now.getTime() - WINDOW_DAYS[groupOf(claim)] * DAY_MS)}`;
  return Boolean(r);
}

// ── Deciding receipts ────────────────────────────────────────────────────────────────

type ReceiptRow = { id: string; user_id: string; kind: ReceiptKind; subject_enc: string | null; subject_hash: string | null; claim_key?: string | null; created_at: Date };

async function finish(sql: postgres.Sql, row: ReceiptRow, status: "verified" | "contradicted" | "expired", by: "corroboration" | "provider" | null, now: Date): Promise<void> {
  // Link deleted in the same statement as the decision. `counted`: first verified per subject per 30 days.
  await sql`
    UPDATE contribution_receipts r SET status = ${status}, verified_by = ${by}, decided_at = ${now}, subject_enc = NULL,
      counted = ${status === "verified"} AND NOT EXISTS (
        SELECT 1 FROM contribution_receipts o WHERE o.user_id = r.user_id AND o.id <> r.id AND o.counted AND NOT o.legacy_unverifiable
          AND o.subject_hash IS NOT DISTINCT FROM r.subject_hash AND r.subject_hash IS NOT NULL
          AND o.decided_at > ${new Date(now.getTime() - COUNT_ONCE_DAYS * DAY_MS)})
    WHERE r.id = ${row.id} AND r.status = 'pending'`;
}

/** Decide one pending receipt now, if the evidence allows. Idempotent. */
export async function decideReceipt(sql: postgres.Sql, row: ReceiptRow, now: Date): Promise<ReceiptOutcome> {
  let subject: Subject | null = null;
  try {
    subject = row.subject_enc ? subjectSchema.parse(JSON.parse(decryptText(row.subject_enc, "contribution_subject"))) : null;
  } catch {
    subject = null; // unreadable (e.g. rotated key): it can never be decided, so it expires
  }
  const tooOld = now.getTime() - new Date(row.created_at).getTime() > PENDING_MAX_DAYS[row.kind] * DAY_MS;
  if (!subject) {
    await finish(sql, row, "expired", null, now);
    return "pending";
  }
  if (subject.k === "lit") {
    const r = evaluateLighting(subject.v, await lightingCells(sql, row.user_id, subject.c, now));
    if (r !== "pending") {
      await finish(sql, row, r, r === "verified" ? "corroboration" : null, now);
      return r;
    }
  } else {
    if (row.claim_key) {
      await recomputePlaceReceipts(sql, row.claim_key, subject.p, now);
      const [updated] = await sql<{ status: ReceiptOutcome }[]>`SELECT status FROM contribution_receipts WHERE id = ${row.id}`;
      return updated.status;
    }
    const outcome = evaluateClaim(subject.c, { weekday: subject.w, band: subject.b }, await placeSignals(sql, subject.p, now), now, subject.pv);
    const d = receiptDecision(outcome);
    if (d) {
      await finish(sql, row, d.status, d.status === "verified" ? d.by : null, now);
      return d.status;
    }
  }
  if (tooOld) await finish(sql, row, "expired", null, now);
  return "pending";
}

/** Worker: decide (or expire) pending receipts, oldest first, in bounded batches. */
export async function decidePending(sql: postgres.Sql, now: Date, limit = 300): Promise<{ checked: number; verified: number; contradicted: number }> {
  const rows = await sql<ReceiptRow[]>`
    SELECT id, user_id, kind, subject_enc, subject_hash, claim_key, created_at FROM contribution_receipts
    WHERE status = 'pending' ORDER BY random() LIMIT ${limit}`; // random: a backlog can't starve newer receipts
  let verified = 0;
  let contradicted = 0;
  for (const r of rows) {
    const o = await decideReceipt(sql, r, now);
    if (o === "verified") verified++;
    if (o === "contradicted") contradicted++;
  }
  return { checked: rows.length, verified, contradicted };
}

/**
 * Worker: one calm Updates item per person whose contributions were newly confirmed by someone else
 * (counted, verified receipts not yet announced). It says how many, never what or where.
 */
export async function notifyConfirmedContributions(sql: postgres.Sql, now: Date): Promise<number> {
  const rows = await sql<{ user_id: string; n: number }[]>`
    WITH due AS (
      UPDATE contribution_receipts SET notified_at = ${now}
      WHERE status = 'verified' AND counted AND notified_at IS NULL
      RETURNING user_id)
    SELECT user_id, count(*)::int AS n FROM due GROUP BY user_id`;
  for (const r of rows) {
    await sql`INSERT INTO notifications (user_id, kind, title, body, href) VALUES (${r.user_id}, 'contribution_confirmed',
      ${r.n === 1 ? "Something you added was confirmed" : `${r.n} things you added were confirmed`},
      ${"Someone else saw the same thing. It now helps the next person — thank you."}, ${"/contribute"})`;
  }
  return rows.length;
}
