import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { newPlanDraft } from "@/domain/plan-state";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { DELETE as meDELETE } from "@/app/api/me/route";
import { GET as plansGET, POST as plansPOST } from "@/app/api/me/plans/route";
import { DELETE as planDELETE, PATCH as planPATCH } from "@/app/api/me/plans/[id]/route";
import { getSql } from "@/server/db/client";
import { purgeExpired } from "@/server/retention";
import { MAX_SAVED_PLANS } from "@/server/account/saved-plans";
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

  // Audit T3: update in place and the cap had no repository test (only an audit probe).
  it("updating a reopened plan keeps its id and restarts its 30 days; only its owner can, and only with a savable plan", async () => {
    const owner = newJar();
    switchJar(owner);
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Plan editor" }))).status).toBe(201);
    const saved = (await (await plansPOST(jsonRequest("/api/me/plans", { draft }))).json()).plan as { id: string; createdAt: string; expiresAt: string };
    await getSql()`UPDATE saved_plans SET expires_at = expires_at - interval '20 days' WHERE id = ${saved.id}`;
    const patch = (id: string, body: unknown) => planPATCH(jsonRequest(`/api/me/plans/${id}`, body, { method: "PATCH" }), { params: Promise.resolve({ id }) });

    const changed = { ...draft, activity: "Get to the gallery", departureLocal: "2026-10-04T18:30", mode: "transit" as const, savedId: saved.id };
    const r = await patch(saved.id, { draft: changed });
    expect(r.status).toBe(200);
    const updated = (await r.json()).plan as { id: string; draft: typeof changed; createdAt: string; expiresAt: string };
    expect(updated.id).toBe(saved.id);
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(new Date(updated.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(updated.draft).toMatchObject({ activity: "Get to the gallery", departureLocal: "2026-10-04T18:30", mode: "transit", savedId: saved.id });
    const listed = (await (await plansGET()).json()).plans as Array<{ id: string; draft: { activity: string } }>;
    expect(listed.map((p) => [p.id, p.draft.activity])).toEqual([[saved.id, "Get to the gallery"]]);
    // What's stored is the plan, never a brief: evidence is checked again whenever it's opened.
    const [{ draft_enc }] = await getSql()<{ draft_enc: string }[]>`SELECT draft_enc FROM saved_plans WHERE id = ${saved.id}`;
    expect(draft_enc).not.toContain("gallery");

    // A Google place or a GPS start can't come in through an update either; the stored copy is unchanged.
    const google = { ...changed, destination: { query: "Museum", resolution: { ...draft.destination.resolution, placeId: "g:secret" } } };
    expect((await patch(saved.id, { draft: google })).status).toBe(400);
    const gps = { ...changed, origin: { kind: "device" as const, use: "from_here" as const, point: { lat: 51.5, lon: -0.12 } } };
    expect((await patch(saved.id, { draft: gps })).status).toBe(400);
    expect(((await (await plansGET()).json()).plans as Array<{ draft: { activity: string } }>)[0].draft.activity).toBe("Get to the gallery");

    // Not hers, not a plan id, or gone: not found, and nothing changes.
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Someone else" }))).status).toBe(201);
    expect((await patch(saved.id, { draft: { ...changed, activity: "Hijacked" } })).status).toBe(404);
    expect((await patch("not-a-uuid", { draft: changed })).status).toBe(404);
    switchJar(owner);
    expect(((await (await plansGET()).json()).plans as Array<{ draft: { activity: string } }>)[0].draft.activity).toBe("Get to the gallery");
    await getSql()`UPDATE saved_plans SET expires_at = ${new Date(Date.now() - 1000)} WHERE id = ${saved.id}`;
    expect((await patch(saved.id, { draft: changed })).status).toBe(404);
  });

  it(`keeps at most ${MAX_SAVED_PLANS} plans: the next is refused until one is deleted, and an expired plan doesn't count`, async () => {
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Plan keeper" }))).status).toBe(201);
    const ids: string[] = [];
    for (let i = 0; i < MAX_SAVED_PLANS; i++) {
      const r = await plansPOST(jsonRequest("/api/me/plans", { draft: { ...draft, activity: `Plan ${i + 1}` } }));
      expect(r.status).toBe(201);
      ids.push(((await r.json()).plan as { id: string }).id);
    }
    const over = await plansPOST(jsonRequest("/api/me/plans", { draft: { ...draft, activity: "One too many" } }));
    expect(over.status).toBe(409);
    expect((await over.json()).error.code).toBe("too_many_saved_plans");
    expect((await (await plansGET()).json()).plans).toHaveLength(MAX_SAVED_PLANS);
    // Updating one at the cap is fine: it's the same plan.
    expect((await planPATCH(jsonRequest(`/api/me/plans/${ids[0]}`, { draft: { ...draft, activity: "Plan 1, changed" } }, { method: "PATCH" }), { params: Promise.resolve({ id: ids[0] }) })).status).toBe(200);
    expect((await planDELETE(jsonRequest(`/api/me/plans/${ids[1]}`, {}, { method: "DELETE" }), { params: Promise.resolve({ id: ids[1] }) })).status).toBe(200);
    expect((await plansPOST(jsonRequest("/api/me/plans", { draft: { ...draft, activity: "Room again" } }))).status).toBe(201);
    expect((await plansPOST(jsonRequest("/api/me/plans", { draft: { ...draft, activity: "Full again" } }))).status).toBe(409);
    await getSql()`UPDATE saved_plans SET expires_at = ${new Date(Date.now() - 1000)} WHERE id = ${ids[2]}`;
    expect((await plansPOST(jsonRequest("/api/me/plans", { draft: { ...draft, activity: "After one expired" } }))).status).toBe(201);
  });
});
