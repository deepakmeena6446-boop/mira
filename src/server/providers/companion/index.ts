import "server-only";
import type postgres from "postgres";
import type { User } from "@/server/session/user";
import { getEnv } from "@/server/config/env";
import { providerModes } from "@/server/providers/modes";
import { placeholderMira } from "./placeholder";
import { claudeMira } from "./claude";
import { miraTools } from "./tools";
import type { MiraContext, MiraEvent, MiraTurn } from "./types";

export type { MiraCard, MiraContext, MiraEvent, MiraTurn } from "./types";
export { MIRA_PERSONA } from "./persona";

/**
 * Companion factory: Claude when ANTHROPIC_API_KEY is set (see claude.ts), otherwise the
 * scripted placeholder. Both use the same tools and cards. If Claude fails before saying
 * anything (network, rate limit, outage), the placeholder answers instead — Mira never
 * leaves someone without a reply.
 */
export function respond(sql: postgres.Sql, user: User, message: string, history: MiraTurn[], ctx: MiraContext): AsyncGenerator<MiraEvent> {
  const firstName = user.name.split(" ")[0];
  const tools = miraTools(sql, user, ctx);
  const fallback = () => placeholderMira(message, history, tools, firstName);
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (providerModes().companion !== "claude" || !apiKey) return fallback();
  return withFallback(claudeMira({ apiKey, message, history, tools, firstName }), fallback);
}

async function* withFallback(primary: AsyncGenerator<MiraEvent>, fallback: () => AsyncGenerator<MiraEvent>): AsyncGenerator<MiraEvent> {
  let emitted = false;
  try {
    for await (const ev of primary) {
      if (ev.type === "text" || ev.type === "card") emitted = true;
      yield ev;
    }
  } catch (err) {
    // Name/status only: error messages can echo request content.
    console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event: "mira.claude_failed", error: err instanceof Error ? err.name : "unknown", status: (err as { status?: number })?.status ?? null, emitted }));
    if (emitted) throw err; // mid-reply: the route adds a short apology
    yield* fallback();
  }
}
