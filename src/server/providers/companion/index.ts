import "server-only";
import type postgres from "postgres";
import type { User } from "@/server/session/user";
import { placeholderMira } from "./placeholder";
import { miraTools } from "./tools";
import type { MiraContext, MiraEvent, MiraTurn } from "./types";

export type { MiraCard, MiraContext, MiraEvent, MiraTurn } from "./types";
export { MIRA_PERSONA } from "./persona";

/**
 * Companion factory. Placeholder engine today; a Claude adapter (claude-opus-5, low
 * effort, streaming, client tools over `miraTools`, cached MIRA_PERSONA prefix, server
 * fallbacks) plugs in here when ANTHROPIC_API_KEY is configured.
 */
export function respond(sql: postgres.Sql, user: User, message: string, history: MiraTurn[], ctx: MiraContext): AsyncGenerator<MiraEvent> {
  return placeholderMira(message, history, miraTools(sql, user, ctx), user.name.split(" ")[0]);
}
