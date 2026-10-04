import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { recordHeartbeat } from "@/server/health/worker";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as placesPOST } from "@/app/api/me/places/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { POST as tripActionPOST } from "@/app/api/trips/[id]/[action]/route";
import { PATCH as prefsPATCH } from "@/app/api/me/prefs/route";
import { GET as habitsGET, DELETE as habitsDELETE } from "@/app/api/me/habits/route";
import { GET as exportGET } from "@/app/api/me/export/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const HOME = { lat: 28.6901, lon: 77.2111 };
const START = { lat: 28.6927, lon: 77.2131 };
const action = (id: string, a: string) => tripActionPOST(jsonRequest(`/api/trips/${id}/${a}`, {}), { params: Promise.resolve({ id, action: a }) });

describe("Phase 3: forget one habit, download your data", () => {
  beforeAll(async () => { applyTestEnv(); resetEnvCache(); await loadFixturePilot(getSql()); });
  afterAll(() => { applyTestEnv(); resetEnvCache(); });
  beforeEach(async () => {
    const sql = getSql();
    await sql`DELETE FROM abuse_counters`;
    await recordHeartbeat(sql, "companion-worker", new Date(), "test", new Date());
    await recordHeartbeat(sql, "job:journeys", new Date(), "test", new Date());
  });

  it("forgets exactly one remembered pattern and exports everything kept, without coordinates leaking from habits", async () => {
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Noor" }))).status).toBe(201);
    const placeId = (await (await placesPOST(jsonRequest("/api/me/places", { label: "Home", emoji: "🏠", ...HOME }))).json()).place.id as string;
    await prefsPATCH(jsonRequest("/api/me/prefs", { rememberHabits: true }, { method: "PATCH" }));
    for (const hour of [8, 21]) {
      const trip = (await (await tripsPOST(jsonRequest("/api/trips", { from: START, to: { ...HOME, name: "Home" }, recipientIds: [], tz: "Asia/Kolkata", savedPlaceId: placeId, startHour: hour }))).json()).trip;
      await action(trip.id, "arrive");
    }
    expect((await (await habitsGET()).json()).habits).toHaveLength(2);

    // One pattern goes; the other stays. An unknown or malformed key is a 404, never "forget all".
    const one = await habitsDELETE(jsonRequest(`/api/me/habits?place=${placeId}&mode=walk&hour=21`, {}, { method: "DELETE" }));
    expect(await one.json()).toEqual({ forgotten: 1 });
    expect((await (await habitsGET()).json()).habits.map((h: { startHour: number }) => h.startHour)).toEqual([8]);
    expect((await habitsDELETE(jsonRequest(`/api/me/habits?place=${placeId}&mode=walk&hour=21`, {}, { method: "DELETE" }))).status).toBe(404);
    expect((await habitsDELETE(jsonRequest(`/api/me/habits?place=not-a-uuid&mode=walk&hour=8`, {}, { method: "DELETE" }))).status).toBe(404);
    expect((await (await habitsGET()).json()).habits).toHaveLength(1);

    // The export is a file of what You, Journeys and Updates show — and says what it leaves out.
    const res = await exportGET();
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="mira-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = await res.json();
    expect(data.account).toMatchObject({ name: "Noor", keptAcrossDevices: false });
    expect(data.places).toEqual([expect.objectContaining({ label: "Home", lat: HOME.lat, lon: HOME.lon })]);
    expect(data.whatMiraRemembers).toEqual(["Home · walking · around 8 am · 1 time"]);
    expect(data.journeys.lastDay).toHaveLength(2);
    expect(data.about).toMatch(/no location history/);
  });

  it("refuses to export without an account", async () => {
    switchJar(newJar());
    expect((await exportGET()).status).toBe(401);
  });
});
