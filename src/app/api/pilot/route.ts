import { getSql } from "@/server/db/client";
import { handle, json } from "@/server/http/handler";
import { getPilotInfo } from "@/server/know";

export const dynamic = "force-dynamic";

/** Public pilot metadata: bounds, source/licence and tile configuration. */
export const GET = handle(async () => json(await getPilotInfo(getSql())));
