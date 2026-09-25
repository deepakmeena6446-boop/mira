import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { EXPIRE_AFTER_ETA_MS, MAX_JOURNEY_MS, MIN_ETA_MS, displayAlertState, purgeAt, type AlertState, type JourneyState } from "@/domain/journey";
import { haversineMeters } from "@/domain/pilot";
import { decryptText, encryptText, hashToken, hmacHex, randomToken } from "@/server/crypto";
import { ApiError, conflict, notFound } from "@/server/http/errors";
import { getEnv } from "@/server/config/env";
import type { Clock } from "@/server/clock";
import { getGeo } from "@/server/providers/geo";
import { emailContact } from "@/server/providers/notify";
import { shareTargets } from "@/server/account/contacts";
import { tripSharedEmail } from "@/server/mail/templates";
import type { User } from "@/server/session/user";

export const ARRIVAL_RADIUS_M = 75;
export const ARRIVAL_DWELL_MS = 45_000;
export const KEEP_POINTS = 20;
/** Fixes vaguer than this (cell/Wi-Fi positioning) never count towards auto-arrival. */
export const ARRIVAL_MAX_ACCURACY_M = 50;
/** After a trip closes, its links show only "arrived/ended" + first name for this long, then nothing. */
export const CLOSED_LINK_GRACE_MS = 30 * 60_000;

export const startTripSchema = z
  .object({
    from: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict(),
    to: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), name: z.string().trim().min(1).max(80) }).strict(),
    share: z.boolean().default(true),
  })
  .strict();

export function tripOwnerHash(userId: string): string {
  return hmacHex("user-actor", userId);
}

/** ETA = walking estimate + a relaxed buffer (never below 5 min). */
export function etaFor(minutes: number, now: Date): Date {
  const buffered = Math.ceil(minutes * 1.25) + 5;
  return new Date(now.getTime() + Math.max(MIN_ETA_MS, buffered * 60_000));
}

/** Walks whose buffered ETA wouldn't fit the 4-hour trip limit are refused up front (no buffer-less ETAs). */
export function tooLongForTrip(minutes: number): boolean {
  return (Math.ceil(minutes * 1.25) + 5) * 60_000 > MAX_JOURNEY_MS - 60_000;
}

export interface TripView {
  id: string;
  state: JourneyState;
  destination: { name: string; lat: number; lon: number };
  etaAt: string;
  expiresAt: string;
  routeMeters: number | null;
  extended: boolean;
  alert: AlertState;
  shareUrl: string | null;
  /** notified=false: the link email to this contact failed, so they can't follow along. */
  sharedWith: Array<{ name: string; notified: boolean }>;
  lastLocation: { lat: number; lon: number; at: string } | null;
  closedAt: string | null;
  purgeAt: string | null;
}

type Row = {
  id: string;
  state: JourneyState;
  dest_lat: number;
  dest_lon: number;
  dest_name: string;
  eta_at: Date;
  route_meters: number | null;
  extended: boolean;
  alert_state: AlertState;
  alert_claimed_at: Date | null;
  share_token_enc: string | null;
  closed_at: Date | null;
  purge_at: Date | null;
};

async function toView(sql: postgres.Sql, r: Row, now: Date): Promise<TripView> {
  const [contacts, [loc]] = await Promise.all([
    sql<{ name: string; notified: boolean }[]>`
      SELECT c.name, tc.notified_at IS NOT NULL AS notified FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id WHERE tc.journey_id = ${r.id} ORDER BY c.name`,
    sql<{ lat: number; lon: number; at: Date }[]>`SELECT lat, lon, at FROM trip_locations WHERE journey_id = ${r.id} ORDER BY at DESC LIMIT 1`,
  ]);
  const open = r.state === "active" || r.state === "missed";
  return {
    id: r.id,
    state: r.state,
    destination: { name: r.dest_name, lat: r.dest_lat, lon: r.dest_lon },
    etaAt: new Date(r.eta_at).toISOString(),
    expiresAt: new Date(new Date(r.eta_at).getTime() + EXPIRE_AFTER_ETA_MS).toISOString(),
    routeMeters: r.route_meters,
    extended: r.extended,
    alert: displayAlertState(r.alert_state, r.alert_claimed_at ? new Date(r.alert_claimed_at) : null, now),
    shareUrl: open && r.share_token_enc ? new URL(`/t/${decryptText(r.share_token_enc, "share_token")}`, getEnv().APP_BASE_URL).toString() : null,
    sharedWith: contacts,
    lastLocation: loc ? { lat: loc.lat, lon: loc.lon, at: new Date(loc.at).toISOString() } : null,
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    purgeAt: r.purge_at ? new Date(r.purge_at).toISOString() : null,
  };
}

const COLS = "id, state, dest_lat, dest_lon, dest_name, eta_at, route_meters, extended, alert_state, alert_claimed_at, share_token_enc, closed_at, purge_at";

export async function startTrip(sql: postgres.Sql, user: User, input: z.infer<typeof startTripSchema>, clock: Clock): Promise<TripView> {
  const now = clock.now();
  const route = await getGeo().walk(input.from, input.to);
  if (tooLongForTrip(route.minutes)) throw new ApiError(400, "too_far", "That's more than a 3-hour walk. Try sharing a closer stop.");
  const eta = etaFor(route.minutes, now);
  const ownerToken = randomToken(24); // the traveller's own "Share link" (they choose who gets it)
  let created: { row: Row; links: Array<{ contactId: string; name: string; email: string; token: string }> };
  try {
    // One transaction: the trip, its first point and every contact link exist together, or not at all.
    created = await sql.begin(async (tx) => {
      const [row] = await tx<Row[]>`
        INSERT INTO journeys (owner_actor_hash, idempotency_key, user_id, destination_label_enc, dest_lat, dest_lon, dest_name, route_meters,
                              eta_at, created_at, share_token_hash, share_token_enc, contact_state, last_location_at)
        VALUES (${tripOwnerHash(user.id)}, ${randomToken(12)}, ${user.id}, ${encryptText(input.to.name, "journey_destination")}, ${input.to.lat}, ${input.to.lon},
                ${input.to.name}, ${route.meters}, ${eta}, ${now}, ${hashToken("invite", `trip:${ownerToken}`)}, ${encryptText(ownerToken, "share_token")}, 'none', ${now})
        RETURNING ${sql.unsafe(COLS)}`;
      await tx`INSERT INTO trip_locations (journey_id, lat, lon, at) VALUES (${row.id}, ${input.from.lat}, ${input.from.lon}, ${now})`;
      const targets = input.share ? await shareTargets(tx as unknown as postgres.Sql, user.id) : [];
      const links = targets.map((t) => ({ contactId: t.id, name: t.name, email: t.email, token: randomToken(24) }));
      for (const l of links) {
        // Each contact gets their own link: removing them from your contacts revokes it immediately.
        await tx`INSERT INTO trip_contacts (journey_id, contact_id, share_token_hash, share_token_enc)
                 VALUES (${row.id}, ${l.contactId}, ${hashToken("invite", `trip:${l.token}`)}, ${encryptText(l.token, "share_token")})`;
      }
      if (links.length) await tx`UPDATE journeys SET contact_state = 'accepted' WHERE id = ${row.id}`;
      return { row, links };
    });
  } catch (err) {
    if ((err as { constraint_name?: string }).constraint_name === "journeys_one_open_per_actor") throw conflict("trip_active", "You already have a trip running.");
    throw err;
  }

  // Emails after commit, in parallel; each contact's delivery is recorded so the app never claims they can follow if they can't.
  const minutesToEta = Math.round((eta.getTime() - now.getTime()) / 60_000);
  await Promise.all(
    created.links.map(async (l) => {
      const mail = tripSharedEmail({ contactName: l.name, ownerName: user.name.split(" ")[0], destination: input.to.name, minutesToEta, liveUrl: new URL(`/t/${l.token}`, getEnv().APP_BASE_URL).toString() });
      const sent = await emailContact(l.email, mail.subject, mail.text).catch(() => ({ ok: false }));
      if (sent.ok) await sql`UPDATE trip_contacts SET notified_at = now() WHERE journey_id = ${created.row.id} AND contact_id = ${l.contactId}`;
    }),
  );
  return toView(sql, created.row, now);
}

export async function currentTrip(sql: postgres.Sql, userId: string, now: Date): Promise<TripView | null> {
  const [row] = await sql<Row[]>`
    SELECT ${sql.unsafe(COLS)} FROM journeys
    WHERE user_id = ${userId} AND (state IN ('active', 'missed') OR purge_at > ${now})
    ORDER BY (state IN ('active', 'missed')) DESC, created_at DESC LIMIT 1`;
  return row ? toView(sql, row, now) : null;
}

export async function tripById(sql: postgres.Sql, userId: string, id: string, now: Date): Promise<TripView> {
  const [row] = await sql<Row[]>`SELECT ${sql.unsafe(COLS)} FROM journeys WHERE id = ${id} AND user_id = ${userId}`;
  if (!row) throw notFound("Trip not found.");
  return toView(sql, row, now);
}

/** Record a live point; auto-arrive after dwelling near the destination. */
export async function addLocation(sql: postgres.Sql, userId: string, id: string, p: { lat: number; lon: number; accuracy?: number }, clock: Clock): Promise<{ arrived: boolean }> {
  const now = clock.now();
  return sql.begin(async (tx) => {
    const [j] = await tx<{ state: JourneyState; dest_lat: number; dest_lon: number; near_dest_since: Date | null }[]>`
      SELECT state, dest_lat, dest_lon, near_dest_since FROM journeys WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
    if (!j) throw notFound("Trip not found.");
    if (j.state !== "active" && j.state !== "missed") return { arrived: false };
    await tx`INSERT INTO trip_locations (journey_id, lat, lon, accuracy_m, at) VALUES (${id}, ${p.lat}, ${p.lon}, ${p.accuracy ?? null}, ${now})`;
    await tx`DELETE FROM trip_locations WHERE journey_id = ${id} AND id NOT IN (SELECT id FROM trip_locations WHERE journey_id = ${id} ORDER BY at DESC LIMIT ${KEEP_POINTS})`;
    // Vague fixes never start, continue or complete an arrival: a wrong "arrived" would cancel the missed-arrival alert.
    const precise = p.accuracy === undefined || p.accuracy <= ARRIVAL_MAX_ACCURACY_M;
    if (!precise) {
      await tx`UPDATE journeys SET last_location_at = ${now} WHERE id = ${id}`;
      return { arrived: false };
    }
    const near = haversineMeters(p, { lat: j.dest_lat, lon: j.dest_lon }) <= ARRIVAL_RADIUS_M;
    if (near && j.near_dest_since && now.getTime() - new Date(j.near_dest_since).getTime() >= ARRIVAL_DWELL_MS) {
      await tx`UPDATE journeys SET state = 'arrived', closed_at = ${now}, purge_at = ${purgeAt(now)}, last_location_at = ${now} WHERE id = ${id}`;
      await tx`DELETE FROM trip_locations WHERE journey_id = ${id}`;
      return { arrived: true };
    }
    await tx`UPDATE journeys SET last_location_at = ${now}, near_dest_since = ${near ? (j.near_dest_since ?? now) : null} WHERE id = ${id}`;
    return { arrived: false };
  });
}

/**
 * What someone holding a live link sees. Links are per trusted contact (revoked when the
 * contact is removed) or the traveller's own "Share link". While the trip is open: first
 * name, destination, ETA and the latest point only. After it closes: just "arrived/ended"
 * and the first name for a short while (so a worried contact sees the good news), then nothing.
 */
export async function sharedTrip(sql: postgres.Sql, token: string, now: Date) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const hash = hashToken("invite", `trip:${token}`);
  type J = { id: string; state: JourneyState; dest_name: string; dest_lat: number; dest_lon: number; eta_at: Date; closed_at: Date | null; name: string; via_contact: boolean };
  const [j] = await sql<J[]>`
    SELECT j.id, j.state, j.dest_name, j.dest_lat, j.dest_lon, j.eta_at, j.closed_at, u.name, false AS via_contact
    FROM journeys j JOIN users u ON u.id = j.user_id WHERE j.share_token_hash = ${hash}
    UNION ALL
    SELECT j.id, j.state, j.dest_name, j.dest_lat, j.dest_lon, j.eta_at, j.closed_at, u.name, true AS via_contact
    FROM trip_contacts tc JOIN journeys j ON j.id = tc.journey_id JOIN users u ON u.id = j.user_id
    JOIN contacts c ON c.id = tc.contact_id AND c.accepted_at IS NOT NULL
    WHERE tc.share_token_hash = ${hash}
    LIMIT 1`;
  if (!j) return null;
  const name = j.name.split(" ")[0];
  const open = j.state === "active" || j.state === "missed";
  if (!open) {
    const closedFor = j.closed_at ? now.getTime() - new Date(j.closed_at).getTime() : Infinity;
    return closedFor <= CLOSED_LINK_GRACE_MS ? { state: j.state, name } : null;
  }
  const [loc] = await sql<{ lat: number; lon: number; at: Date }[]>`SELECT lat, lon, at FROM trip_locations WHERE journey_id = ${j.id} ORDER BY at DESC LIMIT 1`;
  return {
    state: j.state,
    name,
    destination: j.dest_name,
    dest: { lat: j.dest_lat, lon: j.dest_lon },
    etaAt: new Date(j.eta_at).toISOString(),
    /** Trusted contacts get the missed-arrival email; people the traveller shared the link with directly don't. */
    alertsViewer: j.via_contact,
    location: loc ? { lat: loc.lat, lon: loc.lon, at: new Date(loc.at).toISOString(), ageSeconds: Math.round((now.getTime() - new Date(loc.at).getTime()) / 1000) } : null,
  };
}
