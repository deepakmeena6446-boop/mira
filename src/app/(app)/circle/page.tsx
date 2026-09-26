import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listContacts } from "@/server/account/contacts";
import { smtpConfigured } from "@/server/config/env";
import { CircleScreen } from "./CircleScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Circle" };

export default async function CirclePage() {
  const sql = getSql();
  const user = await getUser(sql);
  const contacts = user ? await listContacts(sql, user.id) : [];
  return <CircleScreen user={user ? { name: user.name } : null} contacts={contacts} emailAlerts={smtpConfigured()} />;
}
