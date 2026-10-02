import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { recordHeartbeat } from "@/server/health/worker";
import { fixedClock } from "@/server/clock";
import { processJourneys } from "@/server/journey/worker";
import { addLocation, sharedTrip } from "@/server/trips";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as meGET } from "@/app/api/me/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as actionPOST } from "@/app/api/trips/[id]/[action]/route";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";

describe("Phase 0 current journey privacy and retention", () => {
  it("deletes live points on explicit end, limits the closed link, then hard-deletes at six hours", async () => {
    switchJar(newJar());
    const sql = getSql();
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Phase Zero" }))).status).toBe(201);
    const { user } = await (await meGET()).json();
    await recordHeartbeat(sql, "phase-zero-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());

    const started = await tripsPOST(jsonRequest("/api/trips", {
      from: { lat: 28.6901, lon: 77.2111 }, mode: "ride", etaMinutes: 30, share: false,
    }));
    expect(started.status).toBe(201);
    const { trip } = await started.json();
    expect(trip.sharedWith).toEqual([]);
    const token = new URL(trip.shareUrl).pathname.split("/").at(-1)!;
    await addLocation(sql, user.id, trip.id, { lat: 28.6902, lon: 77.2112 }, fixedClock(new Date()));
    expect(await sharedTrip(sql, token, new Date())).toMatchObject({ location: { lat: 28.6902, lon: 77.2112 } });

    const ended = await actionPOST(jsonRequest(`/api/trips/${trip.id}/end`, {}), { params: Promise.resolve({ id: trip.id, action: "end" }) });
    expect(ended.status).toBe(200);
    const { trip: closed } = await ended.json();
    expect(closed.state).toBe("ended");
    expect(closed.lastLocation).toBeNull();
    expect(new Date(closed.purgeAt).getTime() - new Date(closed.closedAt).getTime()).toBe(6 * 60 * 60_000);
    const [{ points }] = await sql<{ points: number }[]>`SELECT count(*)::int AS points FROM trip_locations WHERE journey_id = ${trip.id}`;
    expect(points).toBe(0);
    expect(await sharedTrip(sql, token, new Date(closed.closedAt))).toEqual({ state: "ended", name: "Phase" });
    expect(await sharedTrip(sql, token, new Date(new Date(closed.closedAt).getTime() + 31 * 60_000))).toBeNull();

    await processJourneys(sql, fixedClock(new Date(closed.purgeAt)), null);
    const [{ remaining }] = await sql<{ remaining: number }[]>`SELECT count(*)::int AS remaining FROM journeys WHERE id = ${trip.id}`;
    expect(remaining).toBe(0);
  });
});
