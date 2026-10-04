import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listNotifications } from "@/server/providers/notify";
import { smtpConfigured } from "@/server/config/env";
import { InboxScreen } from "./InboxScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Updates" };

export default async function InboxPage() {
  const sql = getSql();
  const user = await getUser(sql);
  return <InboxScreen signedIn={Boolean(user)} initial={user ? await listNotifications(sql, user.id) : []} emailAlerts={smtpConfigured()} />;
}
