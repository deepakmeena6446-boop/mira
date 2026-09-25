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

/** ETA = walking estimate + a relaxed buffer, clamped to the journey rules (5 min–4 h). */
export function etaFor(minutes: number, now: Date): Date {
  const buffered = Math.ceil(minutes * 1.25) + 5;
  const ms = Math.min(MAX_JOURNEY_MS - 60_000, Math.max(MIN_ETA_MS, buffered * 60_000));
  return new Date(now.getTime() + ms);
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
  sharedWith: Array<{ name: string }>;
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
    sql<{ name: string }[]>`SELECT c.name FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id WHERE tc.journey_id = ${r.id} ORDER BY c.name`,
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
  if (route.minutes * 60_000 > MAX_JOURNEY_MS) throw new ApiError(400, "too_far", "That's more than a 4-hour walk. Try sharing a closer stop.");
  const eta = etaFor(route.minutes, now);
  const token = randomToken(24);
  let row: Row | undefined;
  try {
    [row] = await sql<Row[]>`
      INSERT INTO journeys (owner_actor_hash, idempotency_key, user_id, destination_label_enc, dest_lat, dest_lon, dest_name, route_meters,
                            eta_at, created_at, share_token_hash, share_token_enc, contact_state)
      VALUES (${tripOwnerHash(user.id)}, ${randomToken(12)}, ${user.id}, ${encryptText(input.to.name, "journey_destination")}, ${input.to.lat}, ${input.to.lon},
              ${input.to.name}, ${route.meters}, ${eta}, ${now}, ${hashToken("invite", `trip:${token}`)}, ${encryptText(token, "share_token")}, 'none')
      RETURNING ${sql.unsafe(COLS)}`;
  } catch (err) {
    if ((err as { constraint_name?: string }).constraint_name === "journeys_one_open_per_actor") throw conflict("trip_active", "You already have a trip running.");
    throw err;
  }
  await sql`INSERT INTO trip_locations (journey_id, lat, lon) VALUES (${row!.id}, ${input.from.lat}, ${input.from.lon})`;
  await sql`UPDATE journeys SET last_location_at = ${now} WHERE id = ${row!.id}`;

  if (input.share) {
    const targets = await shareTargets(sql, user.id);
    const link = new URL(`/t/${token}`, getEnv().APP_BASE_URL).toString();
    for (const t of targets) {
      await sql`INSERT INTO trip_contacts (journey_id, contact_id) VALUES (${row!.id}, ${t.id}) ON CONFLICT DO NOTHING`;
      const mail = tripSharedEmail({ contactName: t.name, ownerName: user.name.split(" ")[0], destination: input.to.name, minutesToEta: Math.round((eta.getTime() - now.getTime()) / 60_000), liveUrl: link });
      const sent = await emailContact(t.email, mail.subject, mail.text);
      if (sent.ok) await sql`UPDATE trip_contacts SET notified_at = now() WHERE journey_id = ${row!.id} AND contact_id = ${t.id}`;
    }
    if (targets.length) await sql`UPDATE journeys SET contact_state = 'accepted' WHERE id = ${row!.id}`;
  }
  return toView(sql, row!, now);
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

/** What a contact sees via the share link: first name, destination, ETA, last point. */
export async function sharedTrip(sql: postgres.Sql, token: string, now: Date) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [j] = await sql<{ id: string; state: JourneyState; dest_name: string; dest_lat: number; dest_lon: number; eta_at: Date; name: string }[]>`
    SELECT j.id, j.state, j.dest_name, j.dest_lat, j.dest_lon, j.eta_at, u.name FROM journeys j JOIN users u ON u.id = j.user_id
    WHERE j.share_token_hash = ${hashToken("invite", `trip:${token}`)}`;
  if (!j) return null;
  const open = j.state === "active" || j.state === "missed";
  if (!open) return { state: j.state, name: j.name.split(" ")[0], destination: j.dest_name };
  const [loc] = await sql<{ lat: number; lon: number; at: Date }[]>`SELECT lat, lon, at FROM trip_locations WHERE journey_id = ${j.id} ORDER BY at DESC LIMIT 1`;
  return {
    state: j.state,
    name: j.name.split(" ")[0],
    destination: j.dest_name,
    dest: { lat: j.dest_lat, lon: j.dest_lon },
    etaAt: new Date(j.eta_at).toISOString(),
    location: loc ? { lat: loc.lat, lon: loc.lon, at: new Date(loc.at).toISOString(), ageSeconds: Math.round((now.getTime() - new Date(loc.at).getTime()) / 1000) } : null,
  };
}
