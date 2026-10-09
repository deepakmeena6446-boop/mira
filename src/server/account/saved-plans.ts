import "server-only";
import type postgres from "postgres";
import { planDraftSchema, type PlanDraft } from "@/domain/plan-state";
import { saveEligibility } from "@/domain/plan-save";
import { decryptText, encryptText } from "@/server/crypto";
import { badRequest, conflict } from "@/server/http/errors";

export const SAVED_PLAN_DAYS = 30;
export const MAX_SAVED_PLANS = 10;
type Row = { id: string; draft_enc: string; created_at: Date; expires_at: Date };
export type SavedPlan = { id: string; draft: PlanDraft; createdAt: string; expiresAt: string };

function readable(row: Row): SavedPlan {
  return {
    id: row.id,
    // The draft carries its own saved id, so whoever opens it can update this copy later.
    draft: { ...planDraftSchema.parse(JSON.parse(decryptText(row.draft_enc, "saved_plan"))), savedId: row.id },
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

/**
 * Save only a complete, explicit named-origin plan. No device point or Google result is archived. The rules are
 * the shared saveEligibility (the plan screens show the same message before she taps Save); this is authoritative.
 */
function checkedDraft(input: PlanDraft): PlanDraft {
  const draft = planDraftSchema.parse(input);
  const eligible = saveEligibility(draft, { signedIn: true });
  if (!eligible.ok) throw badRequest(eligible.code, eligible.message);
  const { savedId: _drop, ...stored } = draft;
  void _drop;
  return stored;
}

export async function listSavedPlans(sql: postgres.Sql, userId: string, now = new Date()): Promise<SavedPlan[]> {
  const rows = await sql<Row[]>`SELECT id, draft_enc, created_at, expires_at FROM saved_plans WHERE user_id = ${userId} AND expires_at > ${now} ORDER BY created_at DESC`;
  return rows.map(readable);
}

export async function savePlan(sql: postgres.Sql, userId: string, input: PlanDraft, now = new Date()): Promise<SavedPlan> {
  const draft = checkedDraft(input);
  const expires = new Date(now.getTime() + SAVED_PLAN_DAYS * 86_400_000);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`saved-plans:${userId}`}))`;
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_plans WHERE user_id = ${userId} AND expires_at > ${now}`;
    if (n >= MAX_SAVED_PLANS) throw conflict("too_many_saved_plans", `You can keep up to ${MAX_SAVED_PLANS} saved plans. Delete one to save another.`);
    const [row] = await tx<Row[]>`INSERT INTO saved_plans (user_id, draft_enc, created_at, expires_at)
      VALUES (${userId}, ${encryptText(JSON.stringify(draft), "saved_plan")}, ${now}, ${expires})
      RETURNING id, draft_enc, created_at, expires_at`;
    return readable(row);
  });
}

/** Replace a saved plan the person reopened and changed; its 30 days restart from this save. */
export async function updateSavedPlan(sql: postgres.Sql, userId: string, id: string, input: PlanDraft, now = new Date()): Promise<SavedPlan | null> {
  const draft = checkedDraft(input);
  const expires = new Date(now.getTime() + SAVED_PLAN_DAYS * 86_400_000);
  const [row] = await sql<Row[]>`UPDATE saved_plans SET draft_enc = ${encryptText(JSON.stringify(draft), "saved_plan")}, expires_at = ${expires}
    WHERE user_id = ${userId} AND id = ${id} AND expires_at > ${now}
    RETURNING id, draft_enc, created_at, expires_at`;
  return row ? readable(row) : null;
}

export async function deleteSavedPlan(sql: postgres.Sql, userId: string, id: string): Promise<boolean> {
  const result = await sql`DELETE FROM saved_plans WHERE user_id = ${userId} AND id = ${id}`;
  return result.count > 0;
}
