import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { listContacts } from "@/server/account/contacts";
import { providerModes } from "@/server/providers/modes";
import { smtpConfigured } from "@/server/config/env";
import { emailHint } from "@/server/account/email-auth";
import { MeScreen } from "./MeScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Me" };

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const sql = getSql();
  const user = await getUser(sql);
  const [places, contacts] = user ? await Promise.all([listPlaces(sql, user.id), listContacts(sql, user.id)]) : [[], []];
  const [row] = user ? await sql<{ email_enc: string | null }[]>`SELECT email_enc FROM users WHERE id = ${user.id}` : [];
  return (
    <MeScreen
      user={user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl, durable: user.durable, emailHint: emailHint(row?.email_enc ?? null), helpExclude: user.helpExclude } : null}
      places={places}
      contacts={contacts}
      modes={providerModes()}
      emailAlerts={smtpConfigured()}
      saved={(await searchParams).saved === "1"}
    />
  );
}
