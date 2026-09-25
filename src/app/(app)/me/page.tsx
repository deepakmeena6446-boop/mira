import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { listContacts } from "@/server/account/contacts";
import { providerModes } from "@/server/providers/modes";
import { MeScreen } from "./MeScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Me" };

export default async function MePage() {
  const sql = getSql();
  const user = await getUser(sql);
  const [places, contacts] = user ? await Promise.all([listPlaces(sql, user.id), listContacts(sql, user.id)]) : [[], []];
  return (
    <MeScreen
      user={user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null}
      places={places}
      contacts={contacts}
      modes={providerModes()}
    />
  );
}
