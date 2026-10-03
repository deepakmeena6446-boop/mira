import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { notifyConfirmedContributions } from "@/server/contributions/receipts";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";

describe("Phase 4: contributors hear when others agree", () => {
  beforeAll(() => { applyTestEnv(); resetEnvCache(); });
  afterAll(() => { applyTestEnv(); resetEnvCache(); });

  it("announces newly confirmed contributions once, in one calm item, and never pending or uncounted ones", async () => {
    const sql = getSql();
    switchJar(newJar());
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Isha" }))).status).toBe(201);
    const [{ id }] = await sql<{ id: string }[]>`SELECT id FROM users WHERE name = 'Isha' ORDER BY created_at DESC LIMIT 1`;
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    await sql`INSERT INTO contribution_receipts (user_id, kind, status, verified_by, day, counted, decided_at)
      VALUES (${id}, 'place_status', 'verified', 'corroboration', ${day}, true, ${now}),
             (${id}, 'lighting', 'verified', 'corroboration', ${day}, true, ${now}),
             (${id}, 'lighting', 'verified', 'corroboration', ${day}, false, ${now}),
             (${id}, 'place_status', 'pending', null, ${day}, false, null)`;

    expect(await notifyConfirmedContributions(sql, now)).toBeGreaterThanOrEqual(1);
    const items = await sql<{ kind: string; title: string; body: string; href: string }[]>`SELECT kind, title, body, href FROM notifications WHERE user_id = ${id} AND kind = 'contribution_confirmed'`;
    expect(items).toEqual([{ kind: "contribution_confirmed", title: "2 things you added were confirmed", body: "Someone else saw the same thing. It now helps the next person — thank you.", href: "/contribute" }]);

    // Said once: a second run announces nothing new for her.
    await notifyConfirmedContributions(sql, new Date(now.getTime() + 60_000));
    expect((await sql`SELECT 1 FROM notifications WHERE user_id = ${id} AND kind = 'contribution_confirmed'`).length).toBe(1);
  });
});
