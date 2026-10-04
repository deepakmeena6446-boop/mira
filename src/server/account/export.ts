import "server-only";
import type postgres from "postgres";
import { listPlaces } from "@/server/account/places";
import { listContacts } from "@/server/account/contacts";
import { listSavedPlans } from "@/server/account/saved-plans";
import { getPrefs, listHabits } from "@/server/account/habits";
import { listNotifications } from "@/server/providers/notify";
import { tripsOverview } from "@/server/trips";

/**
 * Everything Mira keeps for one account, in one readable file (docs/phase3/00 §2). Nothing here is
 * new data: it is exactly what You, Journeys and Updates already show, plus the chat and the
 * structured parts of private reports. Report text stays encrypted for moderation — the file says so.
 */
export async function exportAccount(sql: postgres.Sql, userId: string, now = new Date()) {
  const [[user], places, contacts, plans, habits, prefs, notifications, trips, chat, reports] = await Promise.all([
    sql<{ name: string; created_at: Date; durable: boolean }[]>`SELECT name, created_at, (email_hash IS NOT NULL) AS durable FROM users WHERE id = ${userId}`,
    listPlaces(sql, userId),
    listContacts(sql, userId),
    listSavedPlans(sql, userId, now),
    listHabits(sql, userId),
    getPrefs(sql, userId),
    listNotifications(sql, userId),
    tripsOverview(sql, userId, now),
    sql<{ role: string; content: unknown; created_at: Date }[]>`SELECT role, content, created_at FROM mira_messages WHERE user_id = ${userId} ORDER BY id`,
    sql<{ category: string; involvement: string; recency_bucket: string; status: string; created_at: Date; expires_at: Date; has_text: boolean }[]>`
      SELECT category, involvement, recency_bucket, status, created_at, expires_at, encrypted_text IS NOT NULL AS has_text FROM reports_private WHERE user_id = ${userId} ORDER BY created_at`,
  ]);
  return {
    about: "Your data from Mira, as of this moment. Mira keeps no location history: finished journeys are deleted a day after they end.",
    exportedAt: now.toISOString(),
    account: user ? { name: user.name, createdAt: user.created_at.toISOString(), keptAcrossDevices: user.durable } : null,
    preferences: prefs,
    places: places.map((p) => ({ label: p.label, emoji: p.emoji, address: p.address, lat: p.lat, lon: p.lon })),
    circle: contacts.map((c) => ({ name: c.name, status: c.status, phone: c.phone, email: c.emailHint })),
    savedPlans: plans.map((p) => ({ savedAt: p.createdAt, deletedAfter: p.expiresAt, plan: { ...p.draft, savedId: undefined } })),
    whatMiraRemembers: habits.map((h) => h.text),
    journeys: { open: trips.active ? { to: trips.active.destination.name, eta: trips.active.etaAt, state: trips.active.state } : null, lastDay: trips.recent.map((t) => ({ to: t.destination, state: t.state, closedAt: t.closedAt })) },
    updates: notifications.map((n) => ({ title: n.title, body: n.body, at: n.created_at, read: Boolean(n.read_at) })),
    chatWithMira: chat.map((m) => ({ role: m.role, content: m.content, at: m.created_at.toISOString() })),
    privateReports: reports.map((r) => ({ category: r.category, involvement: r.involvement, when: r.recency_bucket, status: r.status, sentAt: r.created_at.toISOString(), deletedAfter: r.expires_at.toISOString(), text: r.has_text ? "Kept encrypted for moderators only; not included in this file." : null })),
  };
}
