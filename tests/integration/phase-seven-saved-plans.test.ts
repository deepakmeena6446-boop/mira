import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { newPlanDraft } from "@/domain/plan-state";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { DELETE as meDELETE } from "@/app/api/me/route";
import { GET as plansGET, POST as plansPOST } from "@/app/api/me/plans/route";
import { DELETE as planDELETE } from "@/app/api/me/plans/[id]/route";
import { getSql } from "@/server/db/client";
import { purgeExpired } from "@/server/retention";
import { applyTestEnv } from "../setup/test-env";
import { jsonRequest } from "../helpers/http";
import { newJar, switchJar } from "../helpers/cookie-jar";

const draft = {
  ...newPlanDraft(new Date("2026-10-02T08:00:00Z"), "UTC"),
  activity: "Get to the museum",
  origin: { kind: "named" as const, query: "Station", resolution: { source: "search" as const, name: "Station", placeId: "osm:station", point: { lat: 51.5, lon: -0.12 } } },
  destination: { query: "Museum", resolution: { source: "search" as const, name: "Museum", placeId: "osm:museum", point: { lat: 51.51, lon: -0.11 } } },
  departureLocal: "2026-10-03T09:00",
};

describe("Phase 7 explicit saved plan privacy", () => {
  beforeAll(() => { applyTestEnv(); });

  it("requires account consent, encrypts the plan, scopes access, deletes and expires it", async () => {
    switchJar(newJar());
    expect((await plansPOST(jsonRequest("/api/me/plans", { draft }))).status).toBe(401);
    expect((await plansGET()).status).toBe(401);

    const owner = newJar();
    switchJar(owner);
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Plan owner" }))).status).toBe(201);
    const result = await plansPOST(jsonRequest("/api/me/plans", { draft }));
    expect(result.status).toBe(201);
    const saved = (await result.json()).plan as { id: string; draft: typeof draft; expiresAt: string };
    expect(saved.draft.activity).toBe("Get to the museum");
    const [row] = await getSql()<{ draft_enc: string }[]>`SELECT draft_enc FROM saved_plans WHERE id = ${saved.id}`;
    expect(row.draft_enc).not.toContain("museum");
    expect(row.draft_enc).not.toContain("51.5");
    expect((await (await plansGET()).json()).plans).toHaveLength(1);

    const stranger = newJar();
    switchJar(stranger);
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Other person" }))).status).toBe(201);
    expect((await (await plansGET()).json()).plans).toHaveLength(0);
    expect((await planDELETE(jsonRequest(`/api/me/plans/${saved.id}`, {}, { method: "DELETE" }), { params: Promise.resolve({ id: saved.id }) })).status).toBe(404);
    switchJar(owner);

    const gps = { ...draft, origin: { kind: "device" as const, use: "from_here" as const, point: { lat: 51.5, lon: -0.12 } } };
    expect((await plansPOST(jsonRequest("/api/me/plans", { draft: gps }))).status).toBe(400);
    const google = { ...draft, destination: { query: "Museum", resolution: { ...draft.destination.resolution, placeId: "g:secret" } } };
    expect((await plansPOST(jsonRequest("/api/me/plans", { draft: google }))).status).toBe(400);

    expect((await planDELETE(jsonRequest(`/api/me/plans/${saved.id}`, {}, { method: "DELETE" }), { params: Promise.resolve({ id: saved.id }) })).status).toBe(200);
    expect((await (await plansGET()).json()).plans).toHaveLength(0);

    const again = (await (await plansPOST(jsonRequest("/api/me/plans", { draft }))).json()).plan as { id: string };
    await getSql()`UPDATE saved_plans SET expires_at = ${new Date(Date.now() - 1000)} WHERE id = ${again.id}`;
    expect((await (await plansGET()).json()).plans).toHaveLength(0);
    await purgeExpired(getSql(), new Date());
    expect((await getSql()<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_plans WHERE id = ${again.id}`)[0].n).toBe(0);

    const last = (await (await plansPOST(jsonRequest("/api/me/plans", { draft }))).json()).plan as { id: string };
    expect((await meDELETE(jsonRequest("/api/me", {}, { method: "DELETE" }))).status).toBe(200);
    expect((await getSql()<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_plans WHERE id = ${last.id}`)[0].n).toBe(0);
  });
});
