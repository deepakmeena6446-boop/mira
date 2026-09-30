import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { smtpConfigured } from "@/server/config/env";
import { AroundScreen } from "./AroundScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Around" };

export default async function AroundPage() {
  const sql = getSql();
  const user = await getUser(sql);
  const places = user ? await listPlaces(sql, user.id) : [];
  return <AroundScreen places={places} emailAlerts={smtpConfigured()} />;
}
