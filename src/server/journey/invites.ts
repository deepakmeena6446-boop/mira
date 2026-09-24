import "server-only";
import type postgres from "postgres";
import { displayName } from "@/domain/know-copy";
import { hashToken } from "@/server/crypto";
import { ApiError } from "@/server/http/errors";

export type InviteStatus = "valid" | "accepted" | "expired" | "revoked" | "invalid";

export interface InviteView {
  status: InviteStatus;
  etaAt?: string;
  expiresAt?: string;
  placeName?: string | null;
}

type InviteRow = {
  journey_id: string;
  accepted_at: Date | null;
  revoked_at: Date | null;
  expires_at: Date;
  state: string;
  eta_at: Date;
  place_id: string | null;
};

async function find(sql: postgres.Sql | postgres.TransactionSql, token: string, lock = false): Promise<InviteRow | null> {
  if (!token || token.length > 128) return null;
  const hash = hashToken("invite", token);
  const rows = lock
    ? await sql<InviteRow[]>`SELECT i.journey_id, i.accepted_at, i.revoked_at, i.expires_at, j.state, j.eta_at, j.place_id
        FROM contact_invites i JOIN journeys j ON j.id = i.journey_id WHERE i.token_hash = ${hash} FOR UPDATE OF i, j`
    : await sql<InviteRow[]>`SELECT i.journey_id, i.accepted_at, i.revoked_at, i.expires_at, j.state, j.eta_at, j.place_id
        FROM contact_invites i JOIN journeys j ON j.id = i.journey_id WHERE i.token_hash = ${hash}`;
  return rows[0] ?? null;
}

function statusOf(r: InviteRow | null, now: Date): InviteStatus {
  if (!r) return "invalid";
  if (r.revoked_at) return "revoked";
  if (new Date(r.expires_at) <= now || !["active", "missed"].includes(r.state)) return "expired";
  if (r.accepted_at) return "accepted";
  return "valid";
}

/**
 * What the invitee may see: ETA, alert scope and expiry, plus a public place name only
 * if the traveller picked one from the map. Never a map, origin, label or route.
 */
export async function viewInvite(sql: postgres.Sql, token: string, now: Date): Promise<InviteView> {
  const r = await find(sql, token);
  const status = statusOf(r, now);
  if (!r || status === "invalid" || status === "revoked" || status === "expired") return { status };
  let placeName: string | null = null;
  if (r.place_id) {
    const [p] = await sql<{ name: string | null; kind: string }[]>`SELECT name, tags->>'mira:kind' AS kind FROM places WHERE id = ${r.place_id}`;
    if (p) placeName = displayName(p.name, p.kind ?? "Place");
  }
  return { status, etaAt: new Date(r.eta_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), placeName };
}

export async function acceptInvite(sql: postgres.Sql, token: string, now: Date): Promise<InviteStatus> {
  return sql.begin(async (tx): Promise<InviteStatus> => {
    const r = await find(tx, token, true);
    const status = statusOf(r, now);
    if (status === "accepted") return "accepted";
    if (status !== "valid" || !r) throw new ApiError(410, `invite_${status}`, "This invitation can no longer be accepted.");
    await tx`UPDATE contact_invites SET accepted_at = ${now} WHERE journey_id = ${r.journey_id}`;
    await tx`UPDATE journeys SET contact_state = 'accepted' WHERE id = ${r.journey_id} AND contact_state = 'invite_pending'`;
    return "accepted";
  });
}
