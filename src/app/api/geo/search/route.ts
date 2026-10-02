import { z } from "zod";
import { getSql } from "@/server/db/client";
import { handle, json, readJson } from "@/server/http/handler";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { point } from "@/server/http/geo-input";
import { getGeo } from "@/server/providers/geo";
import { placeholderGeo } from "@/server/providers/geo/placeholder";

export const dynamic = "force-dynamic";

const body = z.object({ q: z.string().max(80), near: point.nullable().optional(), deep: z.boolean().optional(), source: z.enum(["osm"]).optional() }).strict();

/** POST keeps the user's coordinates (and what they search for) out of URLs and logs. */
export const POST = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:search:m", max: 960, windowMs: 60_000 }], now);
  const { q, near, deep, source } = await readJson(req, body, 512);
  // Planned places may be stored briefly in a tab and shown over non-Google tiles.
  // Keep that path on OSM sources; public Nominatim is excluded from this path.
  const geo = source === "osm" ? placeholderGeo(sql) : getGeo();
  return json({ places: await geo.search(q, near ?? undefined, { deep: source === "osm" ? false : deep }) });
});
