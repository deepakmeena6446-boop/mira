import { z } from "zod";
import { movementIntentSchema, planEvidenceSchema } from "@/domain/plan-contract";
import { answerPlanQuestion } from "@/domain/plan-ask";
import { askToolIntent, immediateSupportIntent } from "@/domain/ask-routing";
import { resolvedDestination, resolvedOrigin } from "@/domain/plan-state";
import { haversineMeters } from "@/domain/pilot";
import { planOptionsFor } from "@/server/plan/options";
import { getSql } from "@/server/db/client";
import { handle, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import type { MiraEvent } from "@/server/providers/companion/types";
import { countryContext, findCountry } from "@/server/locale";
import { statusWords } from "@/domain/country-context";
import { recordDecisionOutcomeBestEffort } from "@/server/decision-outcomes";

export const dynamic = "force-dynamic";
const body = z.object({ message: z.string().trim().min(1).max(1000), plan: movementIntentSchema.nullable(), selectedOptionId: z.string().min(1).max(160).optional(), legs: z.array(movementIntentSchema.nullable()).max(2).optional(), countryIsos: z.array(z.string().regex(/^[A-Z]{2}$/).nullable()).max(3).optional() }).strict();

/** Guest and account plan questions are ephemeral: no history, model call or user-text log. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { message, plan, selectedOptionId, legs = [], countryIsos = [] } = await readJson(req, body, 8192);
  const urgent = Boolean(immediateSupportIntent(message));
  const sql = urgent ? null : getSql();
  const now = new Date();
  if (sql) {
    const key = dailyKey("ip", clientIp(req), now);
    await enforce(sql, [key], [{ bucket: "mira:plan:m", max: 20, windowMs: 60_000 }, { bucket: "mira:plan:d", max: 100, windowMs: 86_400_000 }], now);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: MiraEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        if (urgent) {
          send({ type: "card", card: { type: "sos", contacts: [] } });
          send({ type: "text", delta: "If you may be in danger, use Emergency now. It opens your device dialler; Mira does not call anyone for you." });
          send({ type: "done" });
          return;
        }
        const tool = askToolIntent(message);
        if (tool) {
          let reply: string;
          if (tool === "emergency_info") {
            const countryName = /\b(?:in|for)\s+([\p{L}\p{M} .'-]{2,80})\s*[?.!]*$/iu.exec(message)?.[1]?.trim();
            const country = countryName ? findCountry(countryName) : null;
            const context = country ? countryContext(country.iso2) : null;
            const primary = context?.emergency.primary;
            reply = context
              ? primary
                ? `For ${context.countryName}, MIRA's reviewed emergency profile lists ${primary.number} (${primary.label}). Coverage is ${statusWords(context.emergency.status)}${context.emergency.reviewed ? `, reviewed ${context.emergency.reviewed}` : ""}. ${primary.qualification ?? "Confirm the service and region before relying on it."} ${context.emergency.source ? `Source: ${context.emergency.source.title}.` : ""} This is destination information, not your current location. Open Emergency for direct dial options.`
                : `MIRA has no verified emergency number for ${context.countryName}. Check an official local source. Open Emergency for direct dial options at your current location.`
              : "I cannot identify a reviewed country from that question. Open Emergency for direct dial options at your current location, or name a country to check its reviewed profile. MIRA does not call for you.";
          } else if (tool === "nearby") {
            reply = "Open Around to look up a named place or explicitly use your current location. A plan's destination is not your present position, and I have not checked which places are open.";
          } else if (tool === "report") {
            reply = "You can open Report to describe a street issue privately. Nothing has been submitted; review the details before sending.";
          } else {
            reply = "MIRA helps you plan and review a movement, find places where sources permit, and choose when to start or share a journey. Emergency is always direct. No action has been taken from this question.";
          }
          send({ type: "text", delta: reply });
          send({ type: "done" });
          return;
        }
        const from = plan ? resolvedOrigin(plan) : null;
        const destination = plan ? resolvedDestination(plan) : null;
        const to = plan?.loop ? from : destination;
        const evidence = sql && plan && from && to && haversineMeters(from, to) <= 25_000
          ? await planOptionsFor(sql, from, to, plan.departure, now, plan) : null;
        if (evidence) {
          planEvidenceSchema.parse(evidence.daylight);
          if (evidence.daylight.status === "known" && !["dark", "daylight"].includes(String(evidence.daylight.value))) throw new Error("Invalid calculated daylight");
          planEvidenceSchema.parse(evidence.service);
          for (const option of evidence.options) for (const claim of option.evidence) planEvidenceSchema.parse(claim);
        }
        const answer = answerPlanQuestion(message, plan, evidence);
        const selected = evidence?.options.find((option) => option.id === selectedOptionId);
        const chosenLine = selectedOptionId ? selected
          ? `Your selected option, ${selected.label}, is about ${Math.round(selected.minutes)} minutes over ${(selected.meters / 1000).toFixed(1)} km in this checked response. Selection does not start or share it.`
          : "Your previous selected option is not present in this checked response. Review the current options before starting; I have not substituted another choice."
          : null;
        const travelLines: string[] = [];
        for (const [index, leg] of legs.entries()) {
          if (!leg) { travelLines.push(`Leg ${index + 2}: details are still being entered. Complete the named places, local time and time zone in Plan.`); continue; }
          const legFrom = resolvedOrigin(leg);
          const legTo = resolvedDestination(leg);
          const tooFar = Boolean(legFrom && legTo && haversineMeters(legFrom, legTo) > 25_000);
          const legEvidence = sql && legFrom && legTo && !tooFar
            ? await planOptionsFor(sql, legFrom, legTo, leg.departure, now, leg).catch(() => null) : null;
          const legAnswer = tooFar ? "This transfer is outside the imported local walking comparison. Route, late ride or transit service, hotel hours and airport or station facilities are unverified. Confirm directly with the operator or property and arrange a manual transfer." : answerPlanQuestion(message, leg, legEvidence).text.replaceAll("in Around", "in Plan");
          travelLines.push(`Leg ${index + 2} (${leg.activity}, ${leg.departure.local} ${leg.departure.timeZone}): ${legAnswer}`);
        }
        const countryLines = countryIsos.map((iso, index) => {
          if (!iso || !findCountry(iso)) return null;
          const ctx = countryContext(iso);
          const known = ctx.emergency.primary ? `Reviewed option ${ctx.emergency.primary.number} (${ctx.emergency.primary.label}); confirm service and region before relying on it.` : "No local emergency number verified by MIRA; check an official local source.";
          return `Leg ${index + 1} destination ${ctx.countryName}: emergency information ${statusWords(ctx.emergency.status)}${ctx.emergency.reviewed ? `, reviewed ${ctx.emergency.reviewed}` : ""}. ${known} This is destination planning, not your current emergency location.`;
        }).filter((line): line is string => Boolean(line));
        send({ type: "text", delta: [chosenLine, answer.text, ...travelLines, ...countryLines].filter(Boolean).join("\n\n") });
        send({ type: "card", card: { type: "plan_brief", next: answer.next, state: evidence?.state ?? "not_checked", checkedAt: evidence?.checkedAt ?? now.toISOString(), source: evidence?.source ?? null, sourceAt: evidence?.sourceAt ?? null, scope: evidence?.scope ?? null, options: evidence?.options.map(({ id, label, minutes, meters }) => ({ id, label, minutes, meters })) ?? [], daylight: evidence?.daylight ?? null } });
        send({ type: "done" });
        if (sql) await recordDecisionOutcomeBestEffort(sql, evidence?.state === "ready" ? "plan_answer_ready" : "plan_answer_partial", now);
      } catch {
        send({ type: "text", delta: "I couldn't check the plan just now. Your plan stays in this tab; open Plan to retry. Emergency remains available." });
        send({ type: "done" });
        if (sql) await recordDecisionOutcomeBestEffort(sql, "plan_answer_partial", now);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
