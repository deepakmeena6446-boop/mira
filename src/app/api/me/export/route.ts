import { getSql } from "@/server/db/client";
import { handle } from "@/server/http/handler";
import { requireUser } from "@/server/session/user";
import { exportAccount } from "@/server/account/export";

export const dynamic = "force-dynamic";

/** Download everything Mira keeps for you, as one JSON file. */
export const GET = handle(async () => {
  const sql = getSql();
  const user = await requireUser(sql);
  const now = new Date();
  const body = JSON.stringify(await exportAccount(sql, user.id, now), null, 2);
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="mira-data-${now.toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
});
