import { getSql } from "@/server/db/client";
import { tileConfig } from "@/server/providers/geo/tiles";
import { systemClock } from "@/server/clock";
import { getUser } from "@/server/session/user";
import { listPlaces } from "@/server/account/places";
import { listContacts } from "@/server/account/contacts";
import { currentTrip } from "@/server/trips";
import { HomeScreen } from "./HomeScreen";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sql = getSql();
  const user = await getUser(sql);
  const [places, contacts, trip] = user
    ? await Promise.all([listPlaces(sql, user.id), listContacts(sql, user.id), currentTrip(sql, user.id, systemClock.now())])
    : [[], [], null];
  return (
    <HomeScreen
      user={user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null}
      places={places}
      contacts={contacts}
      trip={trip}
      tiles={tileConfig()}
    />
  );
}
