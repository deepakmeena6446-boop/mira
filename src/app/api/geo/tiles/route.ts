import { handle, json } from "@/server/http/handler";
import { tileConfig } from "@/server/providers/geo/tiles";

export const dynamic = "force-dynamic";
/** Basemap setup is requested only on inspection; it never blocks planning or urgent actions. */
export const GET = handle(async () => json({ tiles: await tileConfig() }));
