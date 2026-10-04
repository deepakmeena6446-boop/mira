import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { clientIp, dailyKey, enforce } from "@/server/ratelimit";
import { countryContext, countryRegistry, findCountry } from "@/server/locale";

export const dynamic = "force-dynamic";

/**
 * Countries she can choose for Emergency when Mira doesn't know where she is (location off; audit P03-003).
 * No ?iso: every country's code and name, for the chooser. ?iso=IN: that country's reviewed Country Context —
 * the same cited profile a location lookup gives, or "not verified" (never a guessed or "worldwide" number).
 */
export const GET = handle(async (req: Request) => {
  const sql = getSql();
  const now = new Date();
  await enforce(sql, [dailyKey("ip", clientIp(req), now)], [{ bucket: "geo:country:m", max: 120, windowMs: 60_000 }], now);
  const iso = new URL(req.url).searchParams.get("iso");
  if (!iso) return json({ countries: countryRegistry().map((c) => ({ iso: c.iso2, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)) });
  const entry = /^[A-Z]{2}$/.test(iso) ? findCountry(iso) : null;
  if (!entry) throw badRequest("unknown_country", "That isn't a country Mira knows.");
  return json({ country: countryContext(entry.iso2) });
});
