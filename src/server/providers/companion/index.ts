import "server-only";
import type postgres from "postgres";
import type { User } from "@/server/session/user";
import { getEnv } from "@/server/config/env";
import { providerModes } from "@/server/providers/modes";
import { placeholderMira } from "./placeholder";
import { claudeMira, DEFAULT_MIRA_MODEL } from "./claude";
import { miraTools } from "./tools";
import { MIRA_DAILY_TOKEN_DEFAULT, recordTokens, tokenBudgetSpent } from "./budget";
import type { MiraContext, MiraEvent, MiraTurn } from "./types";
import { errCode } from "@/server/log/err-code";
import { CAPABILITIES_QUESTION } from "./signals";

export type { MiraCard, MiraContext, MiraEvent, MiraTurn } from "./types";
export { MIRA_PERSONA } from "./persona";

/** Said once when the day's token budget is spent; the scripted Mira answers after it. */
export const RESTING_NOTE = "Mira is resting for today — here's what I can still do. ";

const CAPABILITIES_REPLY = "I can find nearby places and Help Points, prepare a journey, show mapped street lighting and recent Safety updates when available, and help you report a street problem privately. After you start a journey, you can send its live link to someone you trust. If you're in immediate danger, use the Emergency button.";

const log = (event: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ t: new Date().toISOString(), src: "web", event, ...extra }));

/**
 * Companion factory: Claude when ANTHROPIC_API_KEY is set (see claude.ts), otherwise the
 * scripted placeholder. Both use the same tools and cards. Mira never leaves someone
 * without a reply: if Claude fails, times out or the day's token budget is spent, the
 * placeholder answers instead. Only text, card and done events leave this function.
 */
export async function* respond(sql: postgres.Sql, user: User, message: string, history: MiraTurn[], ctx: MiraContext, modelAllowed = true): AsyncGenerator<MiraEvent> {
  // A capabilities question needs a factual product answer, not a model-generated safety verdict.
  if (CAPABILITIES_QUESTION.test(message)) {
    yield { type: "text", delta: CAPABILITIES_REPLY };
    yield { type: "done" };
    return;
  }
  const firstName = user.name.split(" ")[0];
  const tools = miraTools(sql, user, ctx);
  const fallback = () => placeholderMira(message, history, tools, firstName);
  const env = getEnv();
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!modelAllowed) { yield { type: "text", delta: RESTING_NOTE }; return yield* fallback(); }
  if (providerModes().companion !== "claude" || !apiKey) return yield* fallback();

  const max = Number(env.MIRA_DAILY_TOKEN_MAX ?? MIRA_DAILY_TOKEN_DEFAULT);
  if (await tokenBudgetSpent(sql, max, new Date()).catch(() => false)) {
    log("mira.token_budget_spent", { max });
    yield { type: "text", delta: RESTING_NOTE };
    return yield* fallback();
  }
  let tokens = 0;
  try {
    for await (const ev of withFallback(claudeMira({ apiKey, model: env.MIRA_MODEL ?? DEFAULT_MIRA_MODEL, message, history, tools, firstName }), fallback)) {
      if (ev.type === "usage") tokens += ev.inputTokens + ev.outputTokens;
      else yield ev;
    }
  } finally {
    if (tokens) await recordTokens(sql, tokens, new Date()).catch(() => log("mira.token_record_failed"));
  }
}

/**
 * Runs the primary engine; on any failure (error, timeout) the scripted engine answers.
 * Before anything was said, the fallback simply replaces it. Mid-reply, a short line
 * bridges to the fallback's answer, and history keeps only that.
 */
export async function* withFallback(primary: AsyncGenerator<MiraEvent>, fallback: () => AsyncGenerator<MiraEvent>): AsyncGenerator<MiraEvent> {
  let spoke = false; // any text reached her
  let sos = false; // the Emergency card is already on screen
  try {
    for await (const ev of primary) {
      if (ev.type === "text") spoke = true;
      if (ev.type === "card" && ev.card.type === "sos") sos = true;
      yield ev;
    }
    return;
  } catch (err) {
    // Name/status only: error messages can echo request content.
    log("mira.claude_failed", { error: errCode(err), status: (err as { status?: number })?.status ?? null, spoke });
  }
  if (spoke) yield { type: "text", delta: " — sorry, I lost my connection for a moment. Here's what I can still do: " };
  let said = "";
  for await (const ev of fallback()) {
    if (ev.type === "card" && ev.card.type === "sos" && sos) continue; // already shown
    if (ev.type === "text" && !ev.private) said += ev.delta;
    // The half reply was never scrubbed for history: keep only the fallback's answer.
    if (ev.type === "done" && spoke) yield { type: "history", text: `(My reply was interrupted.) ${said.trim()}`.trim() };
    yield ev;
  }
}
