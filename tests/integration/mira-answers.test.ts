import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { POST as miraPOST } from "@/app/api/mira/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { jsonRequest } from "../helpers/http";
import { loadFixturePilot } from "../helpers/pilot";

const ask = async (message: string) => {
  const res = await miraPOST(jsonRequest("/api/mira", { message, context: { localTime: new Date().toISOString(), tzOffsetMin: -330, location: null } }));
  expect(res.status).toBe(200);
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.type === "text").map((e) => e.delta).join("");
};

describe("Mira answers a guest's emergency-number questions with every service (audit P05-004)", () => {
  beforeAll(async () => { applyTestEnv(); resetEnvCache(); await loadFixturePilot(getSql()); await getSql()`DELETE FROM abuse_counters`; });

  it("Japan: police and ambulance/fire, not just the first; Kenya: both numbers", async () => {
    switchJar(newJar());
    const japan = await ask("What's the emergency number in Japan?");
    expect(japan).toMatch(/110/);
    expect(japan).toMatch(/119/);
    const kenya = await ask("what number do I dial in Kenya");
    expect(kenya).toMatch(/999/);
    expect(kenya).toMatch(/112/);
  });
});
