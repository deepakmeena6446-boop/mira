import { z } from "zod";
import { countryContext, findCountry } from "@/server/locale";
import { handle, json, readJson } from "@/server/http/handler";
import { assertSameOrigin } from "@/server/http/csrf";
import { ApiError } from "@/server/http/errors";

export const dynamic = "force-dynamic";
const body = z.object({ iso: z.string().regex(/^[A-Z]{2}$/) }).strict();

/** Public reviewed country facts for a country explicitly selected for travel, never device location. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { iso } = await readJson(req, body, 128);
  if (!findCountry(iso)) throw new ApiError(404, "not_found", "Country is not in the reviewed registry.");
  return json(countryContext(iso), 200, { "cache-control": "no-store" });
});
