import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { placeLabel } from "@/server/http/person-name";
import { EXPIRE_AFTER_ETA_MS, MAX_JOURNEY_MS, MIN_ETA_MS, displayAlertState, purgeAt, validateNewEta, type AlertState, type JourneyState } from "@/domain/journey";
import { haversineMeters } from "@/domain/pilot";
import { decryptText, encryptText, hashToken, hmacHex, randomToken } from "@/server/crypto";
import { ApiError, conflict, notFound } from "@/server/http/errors";
import { getEnv } from "@/server/config/env";
import type { Clock } from "@/server/clock";
import { getGeo } from "@/server/providers/geo";
import { emailContact } from "@/server/providers/notify";
import { MAX_CONTACTS } from "@/domain/limits";
import { checkOnMeMessage, journeyMessage, whatsappLink } from "@/domain/phone";
import { tooMany } from "@/server/http/errors";
import { checkOnMeEmail, tripSharedEmail } from "@/server/mail/templates";
import type { User } from "@/server/session/user";
import { hourIn, isValidTimeZone } from "@/lib/time";
import { onTripArrived } from "@/server/trips/on-arrival";
import { captureCheckEvidence } from "@/server/contributions";

export const ARRIVAL_RADIUS_M = 75;
export const ARRIVAL_DWELL_MS = 45_000;
export const KEEP_POINTS = 20;
/** Fixes vaguer than this (cell/Wi-Fi positioning) never count towards auto-arrival. */
export const ARRIVAL_MAX_ACCURACY_M = 50;
/** After a trip closes, its links show only "arrived/ended" + first name for this long, then nothing. */
export const CLOSED_LINK_GRACE_MS = 30 * 60_000;

export const JOURNEY_MODES = ["walk", "ride", "transit", "other"] as const;
export type JourneyMode = (typeof JOURNEY_MODES)[number];

export const startTripSchema = z
  .object({
    from: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict(),
    /** Omitted = "just share where I am": no destination to arrive at (ends with I'm here / End). */
    to: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), name: placeLabel(80) }).strict().optional(),
    /** Contacts are linked only after an affirmative choice on this start. */
    share: z.boolean().default(false),
    recipientIds: z.array(z.guid()).max(MAX_CONTACTS).default([]),
    idempotencyKey: z.guid().optional(),
    /** Walking minutes of the route option she chose, when it isn't the fastest (clamped on the server). */
    routeMinutes: z.number().int().min(1).max(240).optional(),
    /** Auto/cab, metro/bus or other: MIRA can't estimate those, so she gives the ETA. */
    mode: z.enum(JOURNEY_MODES).default("walk"),
    etaMinutes: z.number().int().min(5).max(235).optional(),
    /**
     * Her phone's IANA time zone, so emails and the live link show times in her local time.
     * An unknown zone never blocks a journey: it's dropped and times are shown in UTC, labelled.
     */
    tz: z
      .string()
      .max(64)
      .optional()
      .transform((v) => (isValidTimeZone(v) ? v : undefined)),
    /** The destination is one of her saved places (must be hers). Enables habit learning on arrival. */
    savedPlaceId: z.guid().optional(),
    /** Local start hour on her phone (0–23), for habits. Derived from `tz` when omitted. */
    startHour: z.number().int().min(0).max(23).optional(),
  })
  .strict()
  .refine((v) => !v.share || v.recipientIds.length > 0, { message: "Choose the contacts for this journey before sharing.", path: ["recipientIds"] })
  .refine((v) => (v.mode === "walk" && v.to) || v.etaMinutes !== undefined, { message: "Choose when you expect to arrive.", path: ["etaMinutes"] });

/** A "share where I am" journey lasts this long unless she changes it. */
export const SHARE_ONLY_MINUTES = 30;

/** A chosen alternative can make the ETA later than the fastest walk, but not absurdly so. */
export const ROUTE_CHOICE_MAX_STRETCH = 1.6;

export function chosenMinutes(fastest: number, chosen: number | undefined): number {
  if (chosen === undefined) return fastest;
  return Math.min(Math.max(chosen, fastest), Math.ceil(fastest * ROUTE_CHOICE_MAX_STRETCH));
}

const liveLink = (token: string) => new URL(`/t/${token}`, getEnv().APP_BASE_URL).toString();

/** Validate the explicitly selected accepted email or WhatsApp contacts owned by this user. */
export async function recipientTargets(sql: postgres.Sql | postgres.TransactionSql, userId: string, ids: string[]): Promise<Array<{ id: string; name: string; email: string | null; phone: string | null }>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await sql<{ id: string; name: string; encrypted_email: string | null; accepted_at: Date | null; phone_enc: string | null }[]>`
    SELECT id, name, encrypted_email, accepted_at, phone_enc FROM contacts WHERE user_id = ${userId} AND id IN ${sql(unique)}`;
  if (rows.length !== unique.length || rows.some((r) => !r.accepted_at && !r.phone_enc)) throw new ApiError(400, "invalid_recipients", "Choose only your accepted email or WhatsApp contacts.");
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.accepted_at && r.encrypted_email ? decryptText(r.encrypted_email, "contact_email") : null, phone: r.phone_enc ? decryptText(r.phone_enc, "contact_phone") : null }));
}

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
  /**
   * Her Circle on this journey. `viaEmail`: MIRA emails them (an accepted email contact); `notified`: that
   * email was accepted by the provider. `whatsapp`: a wa.me link with their own live link, for her to send
   * (open journeys only). MIRA can't know whether she pressed Send in WhatsApp, so nothing claims it.
   */
  sharedWith: Array<{ id: string; name: string; notified: boolean; viaEmail: boolean; whatsapp: string | null; linkDelivery: AlertState; alertDelivery: AlertState; checkDelivery: AlertState }>;
  mode: JourneyMode;
  /** False for "share where I am" journeys (no destination to arrive at). */
  autoArrival: boolean;
  checkRequestedAt: string | null;
  lastLocation: { lat: number; lon: number; at: string } | null;
  closedAt: string | null;
  purgeAt: string | null;
  /** Her phone's time zone at start (null: unknown, times shown in UTC). */
  tz: string | null;
  createdAt: string;
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
  mode: JourneyMode;
  auto_arrival: boolean;
  check_requested_at: Date | null;
  tz: string | null;
  created_at: Date;
};

async function toView(sql: postgres.Sql, r: Row, now: Date): Promise<TripView> {
  const [contacts, [loc]] = await Promise.all([
    sql<{ id: string; name: string; notified: boolean; via_email: boolean; phone_enc: string | null; share_token_enc: string | null; link_delivery: AlertState; alert_delivery: AlertState | "sending"; check_delivery: AlertState }[]>`
      SELECT c.id, c.name, tc.notified_at IS NOT NULL AS notified, (c.accepted_at IS NOT NULL AND c.encrypted_email IS NOT NULL) AS via_email, c.phone_enc, tc.share_token_enc, tc.link_delivery, tc.alert_delivery, tc.check_delivery
      FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id WHERE tc.journey_id = ${r.id} AND tc.revoked_at IS NULL ORDER BY c.name`,
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
    sharedWith: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      notified: c.notified,
      viaEmail: c.via_email,
      linkDelivery: c.link_delivery === "claimed" ? "unconfirmed" : c.link_delivery,
      alertDelivery: displayAlertState(c.alert_delivery === "sending" ? "claimed" : c.alert_delivery, r.alert_claimed_at ? new Date(r.alert_claimed_at) : null, now),
      checkDelivery: c.check_delivery === "claimed" ? "unconfirmed" : c.check_delivery,
      whatsapp:
        open && c.phone_enc && c.share_token_enc
          ? whatsappLink(decryptText(c.phone_enc, "contact_phone"), journeyMessage(liveLink(decryptText(c.share_token_enc, "share_token")), r.auto_arrival ? r.dest_name : null, r.mode))
          : null,
    })),
    lastLocation: loc ? { lat: loc.lat, lon: loc.lon, at: new Date(loc.at).toISOString() } : null,
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    purgeAt: r.purge_at ? new Date(r.purge_at).toISOString() : null,
    mode: r.mode,
    autoArrival: r.auto_arrival,
    checkRequestedAt: r.check_requested_at ? new Date(r.check_requested_at).toISOString() : null,
    tz: r.tz,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** A revoked or closed grant is checked again immediately before external delivery. */
async function deliveryConsent(sql: postgres.Sql, journeyId: string, contactId: string): Promise<boolean> {
  const [grant] = await sql`SELECT 1 FROM trip_contacts tc JOIN journeys j ON j.id = tc.journey_id
    WHERE tc.journey_id = ${journeyId} AND tc.contact_id = ${contactId} AND tc.revoked_at IS NULL AND j.state IN ('active', 'missed')`;
  return Boolean(grant);
}

const COLS = "id, state, dest_lat, dest_lon, dest_name, eta_at, route_meters, extended, alert_state, alert_claimed_at, share_token_enc, closed_at, purge_at, mode, auto_arrival, check_requested_at, tz, created_at";

export async function startTrip(sql: postgres.Sql, user: User, input: z.infer<typeof startTripSchema>, clock: Clock): Promise<TripView> {
  const now = clock.now();
  const requestHash = hmacHex("trip-start", JSON.stringify({ ...input, idempotencyKey: undefined, recipientIds: [...new Set(input.recipientIds)].sort() }));
  if (input.idempotencyKey) {
    const [previous] = await sql<(Row & { start_request_hash: string })[]>`SELECT ${sql.unsafe(COLS)}, start_request_hash FROM journeys WHERE user_id = ${user.id} AND idempotency_key = ${input.idempotencyKey}`;
    if (previous) {
      if (previous.start_request_hash !== requestHash) throw conflict("idempotency_conflict", "This start request was already used for a different journey.");
      return toView(sql, previous, now);
    }
  }
  const to = input.to ?? { ...input.from, name: "Where I am" };
  const walking = input.mode === "walk" && input.to;
  let eta: Date;
  let routeMeters: number | null = null;
  if (walking) {
    const route = await getGeo().walk(input.from, to);
    const minutes = chosenMinutes(route.minutes, input.routeMinutes);
    if (tooLongForTrip(minutes)) throw new ApiError(400, "too_far", "That's more than a 3-hour walk. Try sharing a closer stop.");
    eta = etaFor(minutes, now);
    routeMeters = route.meters;
  } else {
    // Her own ETA (auto, cab, metro, or just sharing where she is). The missed-arrival grace still applies.
    eta = new Date(now.getTime() + (input.etaMinutes ?? SHARE_ONLY_MINUTES) * 60_000);
    const err = validateNewEta(now, eta);
    if (err) throw new ApiError(400, "invalid_eta", err);
  }
  // A saved place must be hers. One that was deleted meanwhile (another tab) just isn't linked.
  let savedPlaceId: string | null = null;
  if (input.savedPlaceId) {
    const [p] = await sql<{ user_id: string }[]>`SELECT user_id FROM saved_places WHERE id = ${input.savedPlaceId}`;
    if (p && p.user_id !== user.id) throw new ApiError(400, "unknown_saved_place", "That isn't one of your saved places.", { fields: ["savedPlaceId"] });
    if (p) savedPlaceId = input.savedPlaceId;
  }
  const tz = input.tz ?? null;
  const startHour = input.startHour ?? (tz ? hourIn(now, tz) : null);
  const ownerToken = randomToken(24); // the traveller's own "Share link" (they choose who gets it)
  let created: { row: Row; links: Array<{ contactId: string; name: string; email: string | null; token: string }> };
  try {
    // One transaction: the trip, its first point and every contact link exist together, or not at all.
    created = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`trip-start:${user.id}`}))`;
      if (input.idempotencyKey) {
        const [previous] = await tx<(Row & { start_request_hash: string })[]>`SELECT ${sql.unsafe(COLS)}, start_request_hash FROM journeys WHERE user_id = ${user.id} AND idempotency_key = ${input.idempotencyKey}`;
        if (previous) {
          if (previous.start_request_hash !== requestHash) throw conflict("idempotency_conflict", "This start request was already used for a different journey.");
          return { row: previous, links: [] };
        }
      }
      const targets = await recipientTargets(tx, user.id, input.recipientIds);
      const [row] = await tx<Row[]>`
        INSERT INTO journeys (owner_actor_hash, idempotency_key, user_id, destination_label_enc, dest_lat, dest_lon, dest_name, route_meters,
                              eta_at, created_at, share_token_hash, share_token_enc, contact_state, last_location_at, mode, auto_arrival,
                              tz, saved_place_id, start_hour, start_request_hash)
        VALUES (${tripOwnerHash(user.id)}, ${input.idempotencyKey ?? randomToken(12)}, ${user.id}, ${encryptText(to.name, "journey_destination")}, ${to.lat}, ${to.lon},
                ${to.name}, ${routeMeters}, ${eta}, ${now}, ${hashToken("invite", `trip:${ownerToken}`)}, ${encryptText(ownerToken, "share_token")}, 'none', ${now},
                ${input.mode}, ${Boolean(input.to)}, ${tz}, ${savedPlaceId}, ${startHour}, ${requestHash})
        RETURNING ${sql.unsafe(COLS)}`;
      await tx`INSERT INTO trip_locations (journey_id, lat, lon, at) VALUES (${row.id}, ${input.from.lat}, ${input.from.lon}, ${now})`;
      const links = targets.map((t) => ({ contactId: t.id, name: t.name, email: t.email, token: randomToken(24) }));
      for (const l of links) {
        // Each contact gets their own link: removing them from your contacts revokes it immediately.
        await tx`INSERT INTO trip_contacts (journey_id, contact_id, share_token_hash, share_token_enc, link_delivery)
                 VALUES (${row.id}, ${l.contactId}, ${hashToken("invite", `trip:${l.token}`)}, ${encryptText(l.token, "share_token")}, ${l.email ? "claimed" : "not_attempted"})`;
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
      if (!l.email) return; // WhatsApp contact: she sends the link herself from the journey screen
      if (!await deliveryConsent(sql, created.row.id, l.contactId)) return;
      const mail = tripSharedEmail({ contactName: l.name, ownerName: user.name.split(" ")[0], destination: input.to?.name ?? "where they are", minutesToEta, etaAt: eta, tz, liveUrl: new URL(`/t/${l.token}`, getEnv().APP_BASE_URL).toString(), mode: input.to ? input.mode : "other" });
      const sent = await emailContact(l.email, mail.subject, mail.text).catch(() => ({ ok: false }));
      await sql`UPDATE trip_contacts SET link_delivery = ${sent.ok ? "sent" : "definite" in sent && sent.definite ? "failed" : "unconfirmed"}, notified_at = ${sent.ok ? now : null} WHERE journey_id = ${created.row.id} AND contact_id = ${l.contactId} AND revoked_at IS NULL`;
    }),
  );
  return toView(sql, created.row, now);
}

/** How often she can ask her people to check on her during one journey. */
export const CHECK_ON_ME_EVERY_MS = 5 * 60_000;

/** Insert a bounded owner-only action receipt while the journey row is locked. */
async function claimAction(tx: postgres.TransactionSql, id: string, action: "share" | "checkon" | "change", key: string | undefined, request: unknown, now: Date): Promise<boolean> {
  if (!key) return true;
  const hash = hmacHex("trip-action", JSON.stringify(request));
  const [previous] = await tx<{ request_hash: string }[]>`SELECT request_hash FROM trip_action_receipts WHERE journey_id = ${id} AND action = ${action} AND key = ${key}`;
  if (previous) {
    if (previous.request_hash !== hash) throw conflict("idempotency_conflict", "This action request was already used with different choices.");
    return false;
  }
  await tx`INSERT INTO trip_action_receipts (journey_id, action, key, request_hash, created_at) VALUES (${id}, ${action}, ${key}, ${hash}, ${now})`;
  return true;
}

async function lockOpenTrip(tx: postgres.TransactionSql, userId: string, id: string) {
  const [trip] = await tx<(Row & { check_requested_at: Date | null })[]>`SELECT ${tx.unsafe(COLS)} FROM journeys WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
  if (!trip) throw notFound("Trip not found.");
  if (trip.state !== "active" && trip.state !== "missed") throw conflict("trip_closed", "This journey has already ended.");
  return trip;
}

/** Share only the explicitly named recipients. Existing live links are not resent automatically. */
export async function shareTrip(sql: postgres.Sql, user: User, id: string, recipientIds: string[], clock: Clock, idempotencyKey?: string): Promise<TripView> {
  const now = clock.now();
  const result = await sql.begin(async (tx) => {
    const trip = await lockOpenTrip(tx, user.id, id);
    if (!await claimAction(tx, id, "share", idempotencyKey, [...new Set(recipientIds)].sort(), now)) return { trip, links: [] };
    const targets = await recipientTargets(tx, user.id, recipientIds);
    const links: Array<{ contactId: string; name: string; email: string | null; token: string }> = [];
    for (const target of targets) {
      const [existing] = await tx<{ revoked_at: Date | null; link_delivery: AlertState; share_token_enc: string | null }[]>`SELECT revoked_at, link_delivery, share_token_enc FROM trip_contacts WHERE journey_id = ${id} AND contact_id = ${target.id}`;
      if (existing && !existing.revoked_at && existing.link_delivery !== "failed") continue;
      const token = existing && !existing.revoked_at && existing.share_token_enc ? decryptText(existing.share_token_enc, "share_token") : randomToken(24);
      await tx`INSERT INTO trip_contacts (journey_id, contact_id, share_token_hash, share_token_enc, link_delivery)
        VALUES (${id}, ${target.id}, ${hashToken("invite", `trip:${token}`)}, ${encryptText(token, "share_token")}, ${target.email ? "claimed" : "not_attempted"})
        ON CONFLICT (journey_id, contact_id) DO UPDATE SET revoked_at = NULL, share_token_hash = EXCLUDED.share_token_hash, share_token_enc = EXCLUDED.share_token_enc,
        notified_at = NULL, link_delivery = EXCLUDED.link_delivery, alert_delivery = 'none', check_delivery = 'none'`;
      links.push({ contactId: target.id, name: target.name, email: target.email, token });
    }
    return { trip, links };
  });
  for (const link of result.links) {
    if (!link.email) continue;
    if (!await deliveryConsent(sql, id, link.contactId)) continue;
    const mail = tripSharedEmail({ contactName: link.name, ownerName: user.name.split(" ")[0], destination: result.trip.dest_name, minutesToEta: Math.max(0, Math.round((new Date(result.trip.eta_at).getTime() - now.getTime()) / 60_000)), etaAt: new Date(result.trip.eta_at), tz: result.trip.tz, liveUrl: liveLink(link.token), mode: result.trip.auto_arrival ? result.trip.mode : "other" });
    const sent = await emailContact(link.email, mail.subject, mail.text).catch(() => ({ ok: false, definite: false }));
    await sql`UPDATE trip_contacts SET link_delivery = ${sent.ok ? "sent" : sent.definite ? "failed" : "unconfirmed"}, notified_at = ${sent.ok ? now : null} WHERE journey_id = ${id} AND contact_id = ${link.contactId} AND revoked_at IS NULL`;
  }
  return tripById(sql, user.id, id, now);
}

/** Revoke a recipient on this trip without deleting their saved contact, or invalidate a copied owner link. */
export async function revokeTripShare(sql: postgres.Sql, userId: string, id: string, input: { contactId?: string; ownerLink?: boolean }, clock: Clock): Promise<TripView> {
  await sql.begin(async (tx) => {
    await lockOpenTrip(tx, userId, id);
    if (input.ownerLink) await tx`UPDATE journeys SET share_token_enc = NULL, share_token_hash = ${hashToken("invite", randomToken(32))} WHERE id = ${id}`;
    else await tx`UPDATE trip_contacts SET revoked_at = ${clock.now()} WHERE journey_id = ${id} AND contact_id = ${input.contactId!}`;
  });
  return tripById(sql, userId, id, clock.now());
}

/** Create a fresh private owner link after explicit request; no contacts receive it. */
export async function createTripLink(sql: postgres.Sql, userId: string, id: string, clock: Clock): Promise<TripView> {
  await sql.begin(async (tx) => {
    const trip = await lockOpenTrip(tx, userId, id);
    if (trip.share_token_enc) return;
    const token = randomToken(24);
    await tx`UPDATE journeys SET share_token_enc = ${encryptText(token, "share_token")}, share_token_hash = ${hashToken("invite", `trip:${token}`)} WHERE id = ${id}`;
  });
  return tripById(sql, userId, id, clock.now());
}

/** Ask only already-selected recipients, or explicitly select named contacts in the same confirmation. */
export async function tellMyPeopleNow(sql: postgres.Sql, user: User, id: string, clock: Clock, input: { recipientIds?: string[]; idempotencyKey?: string } = {}): Promise<{ told: string[]; failed: string[]; unconfirmed: string[]; whatsapp: Array<{ name: string; url: string }> }> {
  const now = clock.now();
  const links = await sql.begin(async (tx) => {
    const trip = await lockOpenTrip(tx, user.id, id);
    const selected = input.recipientIds ?? (await tx<{ contact_id: string }[]>`SELECT contact_id FROM trip_contacts WHERE journey_id = ${id} AND revoked_at IS NULL`).map((row) => row.contact_id);
    if (!await claimAction(tx, id, "checkon", input.idempotencyKey, [...new Set(selected)].sort(), now)) return [];
    if (trip.check_requested_at && now.getTime() - new Date(trip.check_requested_at).getTime() < CHECK_ON_ME_EVERY_MS) throw tooMany("You asked a moment ago. Try calling them, or send your live link.");
    const targets = await recipientTargets(tx, user.id, selected);
    if (!targets.length) throw new ApiError(400, "choose_recipients", "Choose who you want to ask to check on you.");
    await tx`UPDATE journeys SET check_requested_at = ${now} WHERE id = ${id}`;
    const out: Array<{ contactId: string; name: string; email: string | null; phone: string | null; token: string }> = [];
    for (const target of targets) {
      const [existing] = await tx<{ share_token_enc: string | null; revoked_at: Date | null }[]>`SELECT share_token_enc, revoked_at FROM trip_contacts WHERE journey_id = ${id} AND contact_id = ${target.id}`;
      const token = existing?.share_token_enc && !existing.revoked_at ? decryptText(existing.share_token_enc, "share_token") : randomToken(24);
      await tx`INSERT INTO trip_contacts (journey_id, contact_id, share_token_hash, share_token_enc, check_delivery)
        VALUES (${id}, ${target.id}, ${hashToken("invite", `trip:${token}`)}, ${encryptText(token, "share_token")}, ${target.email ? "claimed" : "not_attempted"})
        ON CONFLICT (journey_id, contact_id) DO UPDATE SET revoked_at = NULL, share_token_hash = EXCLUDED.share_token_hash, share_token_enc = EXCLUDED.share_token_enc, check_delivery = EXCLUDED.check_delivery`;
      out.push({ contactId: target.id, name: target.name, email: target.email, phone: target.phone, token });
    }
    return out;
  });
  const told: string[] = [], failed: string[] = [], unconfirmed: string[] = [];
  const whatsapp = links.filter((link) => link.phone).map((link) => ({ name: link.name, url: whatsappLink(link.phone!, checkOnMeMessage(liveLink(link.token))) })).sort((a, b) => a.name.localeCompare(b.name));
  for (const link of links) {
    if (!link.email) continue;
    if (!await deliveryConsent(sql, id, link.contactId)) continue;
    const mail = checkOnMeEmail({ ownerName: user.name.split(" ")[0], liveUrl: liveLink(link.token) });
    const sent = await emailContact(link.email, mail.subject, mail.text).catch(() => ({ ok: false, definite: false }));
    const delivery = sent.ok ? "sent" : sent.definite ? "failed" : "unconfirmed";
    (sent.ok ? told : sent.definite ? failed : unconfirmed).push(link.name);
    await sql`UPDATE trip_contacts SET check_delivery = ${delivery}, notified_at = CASE WHEN ${sent.ok} THEN COALESCE(notified_at, ${now}) ELSE notified_at END WHERE journey_id = ${id} AND contact_id = ${link.contactId} AND revoked_at IS NULL`;
  }
  console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: "trip.check_requested", trip: id, told: told.length, failed: failed.length, unconfirmed: unconfirmed.length, whatsapp: whatsapp.length }));
  return { told: told.sort(), failed: failed.sort(), unconfirmed: unconfirmed.sort(), whatsapp };
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

/** A confirmed change keeps the existing share recipients and token; it creates no notification. */
export async function changeTrip(sql: postgres.Sql, userId: string, id: string, input: { to: { lat: number; lon: number; name: string }; etaMinutes: number; idempotencyKey?: string }, clock: Clock): Promise<TripView> {
  const now = clock.now();
  await sql.begin(async (tx) => {
    const [row] = await tx<{ state: JourneyState; created_at: Date }[]>`SELECT state, created_at FROM journeys WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
    if (!row) throw notFound("Trip not found.");
    if (!await claimAction(tx, id, "change", input.idempotencyKey, { to: input.to, etaMinutes: input.etaMinutes }, now)) return;
    if (row.state !== "active") throw conflict("trip_not_active", "Only an active journey can change destination.");
    const eta = new Date(now.getTime() + input.etaMinutes * 60_000);
    const issue = validateNewEta(now, eta);
    if (issue || eta.getTime() > new Date(row.created_at).getTime() + MAX_JOURNEY_MS) throw conflict("trip_eta_invalid", issue ?? "A journey can last at most four hours from when it started.");
    await tx`UPDATE journeys SET dest_lat = ${input.to.lat}, dest_lon = ${input.to.lon}, dest_name = ${input.to.name}, destination_label_enc = ${encryptText(input.to.name, "journey_destination")}, eta_at = ${eta}, route_meters = NULL, near_dest_since = NULL WHERE id = ${id}`;
  });
  return tripById(sql, userId, id, now);
}

/** Record a live point; auto-arrive after dwelling near the destination. */
export async function addLocation(sql: postgres.Sql, userId: string, id: string, p: { lat: number; lon: number; accuracy?: number }, clock: Clock): Promise<{ arrived: boolean }> {
  const now = clock.now();
  const result = await sql.begin(async (tx) => {
    const [j] = await tx<{ state: JourneyState; dest_lat: number; dest_lon: number; near_dest_since: Date | null; auto_arrival: boolean }[]>`
      SELECT state, dest_lat, dest_lon, near_dest_since, auto_arrival FROM journeys WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
    if (!j) throw notFound("Trip not found.");
    if (j.state !== "active" && j.state !== "missed") return { arrived: false };
    await tx`INSERT INTO trip_locations (journey_id, lat, lon, accuracy_m, at) VALUES (${id}, ${p.lat}, ${p.lon}, ${p.accuracy ?? null}, ${now})`;
    await tx`DELETE FROM trip_locations WHERE journey_id = ${id} AND id NOT IN (SELECT id FROM trip_locations WHERE journey_id = ${id} ORDER BY at DESC LIMIT ${KEEP_POINTS})`;
    // Vague fixes never start, continue or complete an arrival: a wrong "arrived" would cancel the missed-arrival alert.
    const precise = p.accuracy === undefined || p.accuracy <= ARRIVAL_MAX_ACCURACY_M;
    // No destination ("share where I am"): nothing to arrive at; she ends it herself.
    if (!precise || !j.auto_arrival) {
      await tx`UPDATE journeys SET last_location_at = ${now} WHERE id = ${id}`;
      return { arrived: false };
    }
    const near = haversineMeters(p, { lat: j.dest_lat, lon: j.dest_lon }) <= ARRIVAL_RADIUS_M;
    if (near && j.near_dest_since && now.getTime() - new Date(j.near_dest_since).getTime() >= ARRIVAL_DWELL_MS) {
      await tx`UPDATE journeys SET state = 'arrived', closed_at = ${now}, purge_at = ${purgeAt(now)}, last_location_at = ${now} WHERE id = ${id}`;
      await captureCheckEvidence(tx, id, now); // Contribute (MIRA Checks): evidence captured before the points are deleted; never fails the arrival
      await tx`DELETE FROM trip_locations WHERE journey_id = ${id}`;
      return { arrived: true };
    }
    await tx`UPDATE journeys SET last_location_at = ${now}, near_dest_since = ${near ? (j.near_dest_since ?? now) : null} WHERE id = ${id}`;
    return { arrived: false };
  });
  if (result.arrived) {
    console.log(JSON.stringify({ t: now.toISOString(), src: "web", event: "trip.arrived", trip: id, by: "auto" }));
    await onTripArrived(sql, id, now); // after commit: best-effort, never undoes the arrival
  }
  return result;
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
  type J = { id: string; state: JourneyState; dest_name: string; dest_lat: number; dest_lon: number; eta_at: Date; closed_at: Date | null; name: string; via_contact: boolean; mode: JourneyMode; auto_arrival: boolean; check_requested_at: Date | null; tz: string | null; saved_place: boolean };
  const [j] = await sql<J[]>`
    SELECT j.id, j.state, j.dest_name, j.dest_lat, j.dest_lon, j.eta_at, j.closed_at, u.name, false AS via_contact, j.mode, j.auto_arrival, j.check_requested_at, j.tz, j.saved_place_id IS NOT NULL AS saved_place
    FROM journeys j JOIN users u ON u.id = j.user_id WHERE j.share_token_hash = ${hash}
    UNION ALL
    SELECT j.id, j.state, j.dest_name, j.dest_lat, j.dest_lon, j.eta_at, j.closed_at, u.name, (c.accepted_at IS NOT NULL AND c.encrypted_email IS NOT NULL) AS via_contact, j.mode, j.auto_arrival, j.check_requested_at, j.tz, j.saved_place_id IS NOT NULL AS saved_place
    FROM trip_contacts tc JOIN journeys j ON j.id = tc.journey_id JOIN users u ON u.id = j.user_id
    -- A contact's own link: an accepted email contact, or one she sends it to on WhatsApp. Removing the contact revokes it.
    JOIN contacts c ON c.id = tc.contact_id AND (c.accepted_at IS NOT NULL OR c.phone_enc IS NOT NULL)
    WHERE tc.share_token_hash = ${hash} AND tc.revoked_at IS NULL
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
    // A saved place (often Home) is shown to link holders only to ~100 m: the exact point is her address (audit P06-006).
    dest: j.saved_place ? { lat: Math.round(j.dest_lat * 1000) / 1000, lon: Math.round(j.dest_lon * 1000) / 1000 } : { lat: j.dest_lat, lon: j.dest_lon },
    destApprox: j.saved_place,
    etaAt: new Date(j.eta_at).toISOString(),
    /** The traveller's time zone (IANA), so the ETA is shown in her local time with its label. Null: unknown (shown in UTC). */
    tz: j.tz,
    /** Trusted contacts get the missed-arrival email; people the traveller shared the link with directly don't. */
    alertsViewer: j.via_contact,
    /** walk / ride / transit / other, or "here" when she's sharing where she is (no destination). */
    mode: j.auto_arrival ? j.mode : "here",
    /** She tapped "Tell my people now" in the last 30 minutes. */
    checkRequested: Boolean(j.check_requested_at && now.getTime() - new Date(j.check_requested_at).getTime() < 30 * 60_000),
    location: loc ? { lat: loc.lat, lon: loc.lon, at: new Date(loc.at).toISOString(), ageSeconds: Math.round((now.getTime() - new Date(loc.at).getTime()) / 1000) } : null,
  };
}

/** How long a finished journey can be listed in Trips: never longer than the journey itself exists (purged ≤ 24 h after closing). */
export const RECENT_TRIPS_MS = 24 * 3600_000;

export interface TripSummary {
  id: string;
  state: JourneyState;
  destination: string;
  mode: JourneyMode;
  autoArrival: boolean;
  createdAt: string;
  closedAt: string;
  tz: string | null;
  /** First names of the people it was shared with (whose link was delivered). */
  sharedWith: string[];
}

/**
 * The TRIPS tab: the open journey (if any), then journeys that closed in the last day and
 * haven't been purged yet. No coordinates, no route, no map: just what she needs to recall
 * "did I tell them I arrived?". Nothing older exists — journeys are deleted after closing.
 */
export async function tripsOverview(sql: postgres.Sql, userId: string, now: Date): Promise<{ active: TripView | null; recent: TripSummary[] }> {
  const [open] = await sql<Row[]>`
    SELECT ${sql.unsafe(COLS)} FROM journeys WHERE user_id = ${userId} AND state IN ('active', 'missed') ORDER BY created_at DESC LIMIT 1`;
  const recent = await sql<{ id: string; state: JourneyState; dest_name: string; mode: JourneyMode; auto_arrival: boolean; created_at: Date; closed_at: Date; tz: string | null; shared: string[] | null }[]>`
    SELECT j.id, j.state, j.dest_name, j.mode, j.auto_arrival, j.created_at, j.closed_at, j.tz,
           (SELECT array_agg(c.name ORDER BY c.name) FROM trip_contacts tc JOIN contacts c ON c.id = tc.contact_id
             WHERE tc.journey_id = j.id AND tc.notified_at IS NOT NULL AND tc.revoked_at IS NULL) AS shared
    FROM journeys j
    WHERE j.user_id = ${userId} AND j.state NOT IN ('active', 'missed')
      AND j.closed_at > ${new Date(now.getTime() - RECENT_TRIPS_MS)} AND (j.purge_at IS NULL OR j.purge_at > ${now})
    ORDER BY j.closed_at DESC LIMIT 20`;
  return {
    active: open ? await toView(sql, open, now) : null,
    recent: recent.map((r) => ({
      id: r.id,
      state: r.state,
      destination: r.dest_name,
      mode: r.mode,
      autoArrival: r.auto_arrival,
      createdAt: new Date(r.created_at).toISOString(),
      closedAt: new Date(r.closed_at).toISOString(),
      tz: r.tz,
      sharedWith: (r.shared ?? []).map((n) => n.split(" ")[0]),
    })),
  };
}
