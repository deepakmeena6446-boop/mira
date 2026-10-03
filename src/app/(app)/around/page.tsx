import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { smtpConfigured } from "@/server/config/env";
import { tileConfig } from "@/server/providers/geo/tiles";
import { AroundNow } from "./AroundNow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Around" };

/** Around (docs/phase1-ux/01 §3). `?check=1` opens "Check a place" straight away (from Home). */
export default async function AroundPage({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  const sql = getSql();
  const [params, user] = await Promise.all([searchParams, getUser(sql)]);
  const [places, tiles] = await Promise.all([user ? listPlaces(sql, user.id) : Promise.resolve([]), tileConfig()]);
  return <AroundNow signedIn={Boolean(user)} emailAlerts={smtpConfigured()} places={places} tiles={tiles} openSearch={params.check === "1"} />;
}
