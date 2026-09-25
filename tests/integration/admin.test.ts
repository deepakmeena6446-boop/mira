import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { POST as loginPOST } from "@/app/api/admin/login/route";
import { POST as logoutPOST } from "@/app/api/admin/logout/route";
import { GET as listGET } from "@/app/api/admin/reports/route";
import { GET as detailGET, PATCH as detailPATCH } from "@/app/api/admin/reports/[id]/route";
import { POST as reportPOST } from "@/app/api/reports/route";
import { POST as nearbyPOST } from "@/app/api/geo/nearby/route";
import { TEST_ADMIN_PASSWORD } from "../setup/test-env";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { getRequest, jsonRequest } from "../helpers/http";
import { loadFixturePilot, fixturePlaceId } from "../helpers/pilot";

let placeId = "";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown, origin?: string | null) => detailPATCH(jsonRequest(`/api/admin/reports/${id}`, body, { method: "PATCH", origin }), ctx(id));

async function submitReport(narrative: string, category = "environment") {
  const res = await reportPOST(
    jsonRequest("/api/reports", { idempotencyKey: randomUUID(), involvement: "witnessed", category, placeId, recency: "today", timeBand: "late", narrative }),
  );
  expect(res.status).toBe(201);
  const [row] = await getSql()`SELECT id FROM reports_private ORDER BY created_at DESC, id DESC LIMIT 1`;
  return row.id as string;
}

async function adminJar() {
  const jar = newJar();
  switchJar(jar);
  const res = await loginPOST(jsonRequest("/api/admin/login", { password: TEST_ADMIN_PASSWORD }));
  expect(res.status).toBe(200);
  return jar;
}

describe("moderation", () => {
  beforeAll(async () => {
    await loadFixturePilot(getSql());
    placeId = await fixturePlaceId(getSql(), "Fixture Pharmacy");
  });
  beforeEach(async () => {
    const sql = getSql();
    await sql`DELETE FROM abuse_counters`;
    await sql`DELETE FROM reports_private`;
    await sql`DELETE FROM admin_audit`;
    await sql`DELETE FROM admin_sessions`;
    await sql`DELETE FROM aggregate_releases`;
  });

  it("rejects unauthenticated and actor-cookie requests", async () => {
    switchJar(newJar());
    expect((await listGET(getRequest("/api/admin/reports"))).status).toBe(401);
    const actorJar = newJar();
    switchJar(actorJar);
    const id = await submitReport("light broken");
    expect([...actorJar.keys()]).toEqual(["mira_actor"]);
    expect((await listGET(getRequest("/api/admin/reports"))).status).toBe(401);
    expect((await detailGET(getRequest(`/api/admin/reports/${id}?text=1`), ctx(id))).status).toBe(401);
    expect((await patch(id, { action: "approve", structured: { category: "environment", tags: [], timeBand: "late" } })).status).toBe(401);
  });

  it("throttles password guessing", async () => {
    switchJar(newJar());
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await loginPOST(jsonRequest("/api/admin/login", { password: `wrong-${i}` }))).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    // Even the right password is refused while throttled.
    expect((await loginPOST(jsonRequest("/api/admin/login", { password: TEST_ADMIN_PASSWORD }))).status).toBe(429);
  });

  it("requires same-origin for login and moderation actions", async () => {
    switchJar(newJar());
    expect((await loginPOST(jsonRequest("/api/admin/login", { password: TEST_ADMIN_PASSWORD }, { origin: "https://evil.example" }))).status).toBe(403);
    const jar = await adminJar();
    switchJar(newJar());
    const id = await submitReport("light broken");
    switchJar(jar);
    expect((await patch(id, { action: "hold", reason: "unclear" }, "https://evil.example")).status).toBe(403);
  });

  it("processes a report: PII blocks approval until redacted; transitions are idempotent", async () => {
    switchJar(newJar());
    const id = await submitReport("Auto DL1RT4567 driver shouted, streetlight broken");
    await adminJar();

    const list = await (await listGET(getRequest("/api/admin/reports?status=held"))).json();
    expect(list.reports.map((r: { id: string }) => r.id)).toContain(id);
    expect(JSON.stringify(list)).not.toContain("DL1RT");

    const structured = { category: "environment", tags: ["poor_lighting"], timeBand: "late" };
    const blocked = await patch(id, { action: "approve", structured });
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).error.code).toBe("pii_unresolved");

    expect((await patch(id, { action: "redact" })).status).toBe(200);
    const detail = await (await detailGET(getRequest(`/api/admin/reports/${id}?text=1`), ctx(id))).json();
    expect(detail.report.text).toBe("Auto [removed] driver shouted, streetlight broken");
    expect(detail.report.piiFlags).toEqual([]);

    expect((await patch(id, { action: "approve", structured: { ...structured, tags: ["call me 9876"] } })).status).toBe(422);
    const ok = await (await patch(id, { action: "approve", structured })).json();
    expect(ok).toEqual({ status: "approved", changed: true });
    const again = await (await patch(id, { action: "approve", structured })).json();
    expect(again).toEqual({ status: "approved", changed: false });
    expect((await patch(id, { action: "reject", reason: "duplicate" })).status).toBe(409);

    const [s] = await getSql()`SELECT category, tags, time_band FROM report_structured WHERE report_id = ${id}`;
    expect(s).toMatchObject({ category: "environment", tags: ["poor_lighting"], time_band: "late" });

    const audit = await getSql()`SELECT action, reason_code, report_id FROM admin_audit ORDER BY created_at`;
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["login", "redact", "open_text", "approve"]));
    expect(JSON.stringify(audit)).not.toMatch(/streetlight|DL1RT|shouted/i);
  });

  it("rejects with a fixed reason code and deletes the private text", async () => {
    switchJar(newJar());
    const id = await submitReport("spam spam spam");
    await adminJar();
    expect((await patch(id, { action: "reject" })).status).toBe(422);
    expect((await patch(id, { action: "reject", reason: "a free-text reason naming someone" })).status).toBe(422);
    expect((await patch(id, { action: "reject", reason: "abusive_or_spam" })).status).toBe(200);
    const [row] = await getSql()`SELECT status, encrypted_text, expires_at FROM reports_private WHERE id = ${id}`;
    expect(row.status).toBe("rejected");
    expect(row.encrypted_text).toBeNull();
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600_000 + 5000);
  });

  it("does not change public output after a single approval", async () => {
    switchJar(newJar());
    const before = await (await nearbyPOST(jsonRequest("/api/geo/nearby", { lat: 28.6901, lon: 77.2111 }))).json();
    const id = await submitReport("very dark stretch");
    await adminJar();
    await patch(id, { action: "approve", structured: { category: "environment", tags: ["poor_lighting"], timeBand: "late" } });
    const after = await (await nearbyPOST(jsonRequest("/api/geo/nearby", { lat: 28.6901, lon: 77.2111 }))).json();
    expect(after).toEqual(before);
    const [{ n }] = await getSql()`SELECT count(*)::int AS n FROM aggregate_releases`;
    expect(n).toBe(0);
  });

  it("expires admin sessions and supports logout", async () => {
    await adminJar();
    expect((await listGET(getRequest("/api/admin/reports"))).status).toBe(200);
    await getSql()`UPDATE admin_sessions SET expires_at = now() - interval '1 minute'`;
    expect((await listGET(getRequest("/api/admin/reports"))).status).toBe(401);
    await adminJar();
    expect((await logoutPOST(jsonRequest("/api/admin/logout", {}))).status).toBe(200);
    expect((await listGET(getRequest("/api/admin/reports"))).status).toBe(401);
  });
});
