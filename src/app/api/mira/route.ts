import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { requireUser } from "@/server/session/user";
import { respond, type MiraCard, type MiraTurn } from "@/server/providers/companion";
import type { MiraEvent } from "@/server/providers/companion/types";

export const dynamic = "force-dynamic";

const body = z
  .object({
    message: z.string().trim().min(1).max(1000),
    context: z
      .object({
        localTime: z.iso.datetime({ offset: true }),
        tzOffsetMin: z.number().int().min(-840).max(840),
        location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict().nullable(),
        // Locality name the device read from its map tiles; display text only.
        area: z.string().trim().max(60).regex(/^[^\p{Cc}<>]*$/u).nullable().optional(),
      })
      .strict(),
  })
  .strict();

type Stored = { text: string; cards?: MiraCard[] };

/**
 * Cards kept in history carry nothing about where the person was: nearby-place lists
 * (coordinates + distances from them) aren't stored, and trip cards drop the walking time.
 */
function storableCard(card: MiraCard): MiraCard | null {
  if (card.type === "places") return null;
  if (card.type === "trip") return { type: "trip", destination: card.destination, minutes: null, contacts: card.contacts };
  return card;
}

/** Chat history (last 50 turns). */
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  const rows = await sql<{ id: number; role: "user" | "assistant"; content: Stored }[]>`
    SELECT id, role, content FROM (SELECT * FROM mira_messages WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 50) m ORDER BY id`;
  return json({ messages: rows.map((r) => ({ id: r.id, role: r.role, text: r.content.text, cards: r.content.cards ?? [] })) });
});

/** Clear history. */
export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  await sql`DELETE FROM mira_messages WHERE user_id = ${user.id}`;
  return json({ ok: true });
});

/** Send a message; streams NDJSON events: text deltas, cards, done. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  await enforce(sql, [dailyKey("actor", user.id, now)], [{ bucket: "mira:m", max: 20, windowMs: 60_000 }, { bucket: "mira:d", max: 400, windowMs: 86_400_000 }], now);
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "mira:ip:m", max: 300, windowMs: 60_000 }], now);
  const { message, context } = await readJson(req, body, 8192);
  const recent = await sql<{ role: "user" | "assistant"; content: Stored }[]>`
    SELECT role, content FROM (SELECT * FROM mira_messages WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 12) m ORDER BY id`;
  const history: MiraTurn[] = recent.map((r) => ({ role: r.role, text: r.content.text }));
  await sql`INSERT INTO mira_messages (user_id, role, content) VALUES (${user.id}, 'user', ${sql.json({ text: message })})`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = ""; // what's stored: location-derived text and cards are left out (history is not a location log)
      let scrubbed: string | null = null; // Claude supplies its own scrubbed version via a "history" event
      const cards: MiraCard[] = [];
      let open = true;
      const send = (ev: MiraEvent) => {
        if (!open) return; // the client went away; keep going so the turn is still stored
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        for await (const ev of respond(sql, user, message, history, context)) {
          if (ev.type === "history") {
            scrubbed = ev.text;
            continue; // server-only
          }
          if (ev.type === "text" && !ev.private) text += ev.delta;
          if (ev.type === "card") {
            const kept = storableCard(ev.card);
            if (kept) cards.push(kept);
          }
          send(ev);
        }
      } catch {
        const sorry = "Sorry — I lost my train of thought. Could you say that again?";
        text = text ? `${text.trimEnd()} ${sorry}` : sorry;
        send({ type: "text", delta: sorry });
        send({ type: "done" });
      }
      await sql`INSERT INTO mira_messages (user_id, role, content) VALUES (${user.id}, 'assistant', ${sql.json({ text: (scrubbed ?? text).trim(), cards })})`.catch(() => {});
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
