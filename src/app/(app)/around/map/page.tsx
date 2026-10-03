import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { tileConfig } from "@/server/providers/geo/tiles";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { smtpConfigured } from "@/server/config/env";
import { MapScreen } from "./MapScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Map · Around" };

/** The full map (docs/phase2-ux/00 §5). The previous map screen stays at /around/map/classic until its flows are retired. */
export default async function MapPage() {
  const sql = getSql();
  const user = await getUser(sql);
  const [places, tiles] = await Promise.all([user ? listPlaces(sql, user.id) : Promise.resolve([]), tileConfig()]);
  return <MapScreen emailAlerts={smtpConfigured()} places={places} tiles={tiles} />;
}
