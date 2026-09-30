import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { notesNear } from "@/server/notes";

export const dynamic = "force-dynamic";

/** Public thresholded summaries only. The raw report and contribution tables never feed this route. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "community:nearby:m", max: 240, windowMs: 60_000 }], now);
  const p = await readJson(req, point, 256);
  return json({ notes: await notesNear(sql, p) });
});
