import { TabBar } from "@/components/app/TabBar";
import { SignInNotice } from "@/components/app/SignInNotice";
import { LocationOnOpen } from "@/components/app/LocationOnOpen";
import { EarlyTaps } from "@/components/app/EarlyTaps";
import { JourneyDock, type DockTrip } from "@/components/mira/JourneyDock";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { currentTrip } from "@/server/trips";
import { systemClock } from "@/server/clock";

/** Live journey for the dock, if any. A failed lookup shows no dock (the journey screen still works). */
async function dockTrip(): Promise<DockTrip | null> {
  try {
    const sql = getSql();
    const user = await getUser(sql);
    if (!user) return null;
    const trip = await currentTrip(sql, user.id, systemClock.now());
    if (!trip || (trip.state !== "active" && trip.state !== "missed")) return null;
    return { state: trip.state, destination: trip.autoArrival ? trip.destination.name : null, etaAt: trip.etaAt, following: trip.sharedWith.filter((c) => c.notified).map((c) => c.name) };
  } catch {
    return null;
  }
}

/** Consumer app shell: full-bleed screens, a docked tab bar, and the open journey one tap away. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const trip = await dockTrip();
  return (
    <>
      <main id="main" tabIndex={-1} className="min-h-dvh outline-none lg:pl-[88px]">
        {children}
      </main>
      <JourneyDock trip={trip} />
      <TabBar />
      <SignInNotice />
      <LocationOnOpen />
      <EarlyTaps />
    </>
  );
}
