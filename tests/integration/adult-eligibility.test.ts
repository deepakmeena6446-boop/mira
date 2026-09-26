import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { resetEnvCache } from "@/server/config/env";
import { validAdultAttestation } from "@/server/account/adult-eligibility";
import { POST as eligibilityPOST } from "@/app/api/auth/eligibility/route";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { GET as googleStartGET } from "@/app/api/auth/google/start/route";
import { applyTestEnv } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { getRequest, jsonRequest } from "../helpers/http";

describe("18+ public beta self-attestation", () => {
  beforeAll(() => { applyTestEnv({ NODE_ENV: "production" }); resetEnvCache(); });
  beforeEach(async () => { switchJar(newJar()); await getSql()`DELETE FROM abuse_counters`; });
  afterAll(() => { applyTestEnv(); resetEnvCache(); });

  it("requires an explicit adult confirmation before a production account is created", async () => {
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Asha" }))).status).toBe(403);
    expect((await eligibilityPOST(jsonRequest("/api/auth/eligibility", { adult: false }))).status).toBe(400);
    const jar = newJar();
    switchJar(jar);
    expect((await eligibilityPOST(jsonRequest("/api/auth/eligibility", { adult: true }))).status).toBe(200);
    expect(validAdultAttestation(jar.get("__Host-mira_adult"))).toBe(true);
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Asha" }))).status).toBe(201);
    expect([...jar.keys()].some((key) => key.includes("birth"))).toBe(false);
  });

  it("rejects a forged or expired attestation, including direct Google entry", async () => {
    const jar = newJar();
    switchJar(jar);
    await eligibilityPOST(jsonRequest("/api/auth/eligibility", { adult: true }));
    const sealed = jar.get("__Host-mira_adult")!;
    expect(validAdultAttestation(sealed, Date.now() + 366 * 86_400_000)).toBe(false);
    jar.set("__Host-mira_adult", sealed.slice(0, -1) + (sealed.endsWith("a") ? "b" : "a"));
    expect((await demoPOST(jsonRequest("/api/auth/demo", { name: "Asha" }))).status).toBe(403);
    await expect(googleStartGET(getRequest("/api/auth/google/start"))).rejects.toMatchObject({ status: 403 });
  });
});
