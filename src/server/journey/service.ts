import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import {
  EXPIRE_AFTER_ETA_MS,
  MAX_JOURNEY_MS,
  MISS_GRACE_MS,
  displayAlertState,
  purgeAt,
  userTransition,
  validateExtension,
  validateNewEta,
  type AlertState,
  type ContactState,
  type JourneyState,
  type UserAction,
} from "@/domain/journey";
import { normaliseNarrative } from "@/domain/report/text";
import { decryptText, encryptText, hashToken, randomToken } from "@/server/crypto";
import { ApiError, conflict, notFound } from "@/server/http/errors";
import { getEnv } from "@/server/config/env";
import type { Clock } from "@/server/clock";
import type { Mailer } from "@/server/mail";
import { inviteEmail } from "@/server/mail/templates";
import { displayName } from "@/domain/know-copy";
import { onTripArrived } from "@/server/trips/on-arrival";

export const LABEL_MAX = 60;

export const createJourneySchema = z
  .object({
    idempotencyKey: z.guid(),
    destination: z.union([z.object({ placeId: z.guid() }).strict(), z.object({ label: z.string().min(1).max(200) }).strict()]),
    etaAt: z.iso.datetime({ offset: true }),
    contactEmail: z.email().max(254).optional(),
  })
  .strict();
export type CreateJourneyInput = z.infer<typeof createJourneySchema>;

type JourneyRow = {
  id: string;
  owner_actor_hash: string;
  place_id: string | null;
  destination_label_enc: string | null;
  eta_at: Date;
  extended: boolean;
  state: JourneyState;
  contact_state: ContactState;
  alert_state: AlertState;
  alert_claimed_at: Date | null;
  created_at: Date;
  missed_at: Date | null;
  closed_at: Date | null;
  purge_at: Date | null;
  place_name?: string | null;
  place_kind?: string | null;
};

/** What the owner's browser sees. Never includes the contact's address or any token. */
export interface JourneyView {
  id: string;
  state: JourneyState;
  destination: { name: string; fromMap: boolean };
  etaAt: string;
  createdAt: string;
  extended: boolean;
  canExtend: boolean;
  maxEtaAt: string;
  missAt: string;
  expiresAt: string;
  contact: ContactState;
  alert: AlertState;
  missedAt: string | null;
  closedAt: string | null;
  purgeAt: string | null;
}

export function toView(r: JourneyRow, now: Date): JourneyView {
  const eta = new Date(r.eta_at);
  const created = new Date(r.created_at);
  const name = r.place_id && r.place_name !== undefined ? displayName(r.place_name ?? null, r.place_kind ?? "Place") : null;
  return {
    id: r.id,
    state: r.state,
    destination: name
      ? { name, fromMap: true }
      : { name: r.destination_label_enc ? decryptText(r.destination_label_enc, "journey_destination") : "Planned destination", fromMap: false },
    etaAt: eta.toISOString(),
    createdAt: created.toISOString(),
    extended: r.extended,
    canExtend: r.state === "active" && !r.extended && now.getTime() < eta.getTime() + MISS_GRACE_MS,
    maxEtaAt: new Date(created.getTime() + MAX_JOURNEY_MS).toISOString(),
    missAt: new Date(eta.getTime() + MISS_GRACE_MS).toISOString(),
    expiresAt: new Date(eta.getTime() + EXPIRE_AFTER_ETA_MS).toISOString(),
    contact: r.contact_state,
    alert: displayAlertState(r.alert_state, r.alert_claimed_at ? new Date(r.alert_claimed_at) : null, now),
    missedAt: r.missed_at ? new Date(r.missed_at).toISOString() : null,
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    purgeAt: r.purge_at ? new Date(r.purge_at).toISOString() : null,
  };
}

async function loadOwned(sql: postgres.Sql | postgres.TransactionSql, actorHash: string, id: string, lock = false): Promise<JourneyRow> {
  const rows = lock
    ? await sql<JourneyRow[]>`SELECT * FROM journeys WHERE id = ${id} AND owner_actor_hash = ${actorHash} FOR UPDATE`
    : await sql<JourneyRow[]>`SELECT * FROM journeys WHERE id = ${id} AND owner_actor_hash = ${actorHash}`;
  // A journey that isn't yours is indistinguishable from one that doesn't exist.
  if (!rows[0]) throw notFound("Journey not found.");
  return rows[0];
}

async function withPlace(sql: postgres.Sql | postgres.TransactionSql, r: JourneyRow): Promise<JourneyRow> {
  if (!r.place_id) return r;
  const [p] = await sql<{ name: string | null; kind: string }[]>`SELECT name, tags->>'mira:kind' AS kind FROM places WHERE id = ${r.place_id}`;
  return { ...r, place_name: p?.name ?? null, place_kind: p?.kind ?? "Place" };
}

export interface CreateContext {
  sql: postgres.Sql;
  clock: Clock;
  mailer: Mailer | null;
  workerHealthy: boolean;
}

export async function createJourney(ctx: CreateContext, actorHash: string, input: CreateJourneyInput): Promise<JourneyView> {
  const { sql, clock, mailer } = ctx;
  const now = clock.now();
  if (!ctx.workerHealthy) {
    throw new ApiError(503, "journeys_unavailable", "Check-ins are paused because the background service that handles missed check-ins and deletion isn't running.");
  }
  const eta = new Date(input.etaAt);
  const etaError = validateNewEta(now, eta);
  if (etaError) throw new ApiError(400, "invalid_eta", etaError, { fields: ["etaAt"] });
  if (input.contactEmail && !mailer) {
    throw new ApiError(400, "contact_unavailable", "Contact alerts are unavailable; you can still use a private check-in.", { fields: ["contactEmail"] });
  }
  let placeId: string | null = null;
  let labelEnc: string | null = null;
  if ("placeId" in input.destination) {
    const [p] = await sql`SELECT id FROM places WHERE id = ${input.destination.placeId}`;
    if (!p) throw new ApiError(422, "unknown_place", "That place isn't in the pilot map.", { fields: ["destination"] });
    placeId = input.destination.placeId;
  } else {
    const label = normaliseNarrative(input.destination.label).replace(/\n/g, " ");
    if (!label || [...label].length > LABEL_MAX) throw new ApiError(400, "invalid_label", `Use a short label (up to ${LABEL_MAX} characters).`, { fields: ["destination"] });
    labelEnc = encryptText(label, "journey_destination");
  }

  let row: JourneyRow | undefined;
  try {
    [row] = await sql<JourneyRow[]>`
      INSERT INTO journeys (owner_actor_hash, idempotency_key, place_id, destination_label_enc, eta_at, contact_state, created_at)
      VALUES (${actorHash}, ${input.idempotencyKey}, ${placeId}, ${labelEnc}, ${eta}, ${input.contactEmail ? "invite_pending" : "none"}, ${now})
      ON CONFLICT (owner_actor_hash, idempotency_key) DO NOTHING
      RETURNING *`;
  } catch (err) {
    if ((err as { constraint_name?: string }).constraint_name === "journeys_one_open_per_actor") {
      throw conflict("journey_already_active", "You already have an active journey. Finish or end it before starting another.");
    }
    throw err;
  }
  if (!row) {
    // Retried request: return the journey created by the first attempt.
    const [existing] = await sql<JourneyRow[]>`SELECT * FROM journeys WHERE owner_actor_hash = ${actorHash} AND idempotency_key = ${input.idempotencyKey}`;
    if (!existing) throw conflict("retry_conflict", "Please try again.");
    return toView(await withPlace(sql, existing), now);
  }

  if (input.contactEmail && mailer) {
    const token = randomToken(32);
    const expires = new Date(eta.getTime() + EXPIRE_AFTER_ETA_MS);
    await sql`
      INSERT INTO contact_invites (journey_id, token_hash, encrypted_email, created_at, expires_at)
      VALUES (${row.id}, ${hashToken("invite", token)}, ${encryptText(input.contactEmail.trim().toLowerCase(), "contact_email")}, ${now}, ${expires})`;
    const acceptUrl = new URL(`/invite/${token}`, getEnv().APP_BASE_URL).toString();
    const result = await mailer.send({ to: input.contactEmail.trim(), ...inviteEmail({ acceptUrl, etaAt: eta, expiresAt: expires }) });
    if (result.ok) {
      await sql`UPDATE contact_invites SET sent_at = ${now} WHERE journey_id = ${row.id}`;
    } else {
      // Keep the private check-in; the contact simply can't be alerted.
      await sql`UPDATE journeys SET contact_state = 'invite_failed' WHERE id = ${row.id}`;
      row = { ...row, contact_state: "invite_failed" };
    }
  }
  return toView(await withPlace(sql, row), now);
}

/** The owner's open journey, or the most recent closed one until it is purged. */
export async function currentJourney(sql: postgres.Sql, actorHash: string, now: Date): Promise<JourneyView | null> {
  const [row] = await sql<JourneyRow[]>`
    SELECT * FROM journeys
    WHERE owner_actor_hash = ${actorHash} AND (state IN ('active', 'missed') OR purge_at > ${now})
    ORDER BY (state IN ('active', 'missed')) DESC, created_at DESC LIMIT 1`;
  return row ? toView(await withPlace(sql, row), now) : null;
}

function closeFields(now: Date) {
  return { closed: now, purge: purgeAt(now) };
}

export async function userAction(sql: postgres.Sql, actorHash: string, id: string, action: UserAction, clock: Clock): Promise<JourneyView> {
  const now = clock.now();
  const { row, arrived } = await sql.begin(async (tx) => {
    const j = await loadOwned(tx, actorHash, id, true);
    const t = userTransition(j.state, action);
    if (!t.ok) throw conflict("journey_closed", "This journey has already finished.");
    if (!t.changed) return { row: j, arrived: false };
    const { closed, purge } = closeFields(now);
    const [updated] = await tx<JourneyRow[]>`
      UPDATE journeys SET state = ${t.next}, closed_at = ${closed}, purge_at = ${purge} WHERE id = ${id} RETURNING *`;
    await tx`UPDATE contact_invites SET expires_at = LEAST(expires_at, ${now}) WHERE journey_id = ${id}`;
    await tx`DELETE FROM trip_locations WHERE journey_id = ${id}`; // live points never outlive the trip
    return { row: updated, arrived: t.next === "arrived" };
  });
  if (arrived) await onTripArrived(sql, id, now); // after commit: best-effort, never undoes the arrival
  return toView(await withPlace(sql, row), now);
}

export async function extendJourney(sql: postgres.Sql, actorHash: string, id: string, newEtaIso: string, clock: Clock): Promise<JourneyView> {
  const now = clock.now();
  const newEta = new Date(newEtaIso);
  const row = await sql.begin(async (tx) => {
    const j = await loadOwned(tx, actorHash, id, true);
    const err = validateExtension({ state: j.state, extended: j.extended, etaAt: new Date(j.eta_at), createdAt: new Date(j.created_at) }, now, newEta);
    if (err) throw new ApiError(j.state === "active" ? 400 : 409, "invalid_extension", err, { fields: ["etaAt"] });
    const [updated] = await tx<JourneyRow[]>`UPDATE journeys SET eta_at = ${newEta}, extended = true WHERE id = ${id} RETURNING *`;
    await tx`UPDATE contact_invites SET expires_at = ${new Date(newEta.getTime() + EXPIRE_AFTER_ETA_MS)} WHERE journey_id = ${id} AND revoked_at IS NULL`;
    return updated;
  });
  return toView(await withPlace(sql, row), now);
}

export async function revokeContact(sql: postgres.Sql, actorHash: string, id: string, clock: Clock): Promise<JourneyView> {
  const now = clock.now();
  const row = await sql.begin(async (tx) => {
    const j = await loadOwned(tx, actorHash, id, true);
    if (j.contact_state === "none" || j.contact_state === "revoked") return j;
    const [updated] = await tx<JourneyRow[]>`UPDATE journeys SET contact_state = 'revoked' WHERE id = ${id} RETURNING *`;
    await tx`UPDATE contact_invites SET revoked_at = ${now} WHERE journey_id = ${id} AND revoked_at IS NULL`;
    return updated;
  });
  return toView(await withPlace(sql, row), now);
}
