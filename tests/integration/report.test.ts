import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getSql } from "@/server/db/client";
import { prepareReport, reportInputSchema, submitReport } from "@/server/report/submit";
import { decryptText } from "@/server/crypto";
import { fixedClock, HOUR } from "@/server/clock";
import { ApiError } from "@/server/http/errors";
import { POST as knowPOST } from "@/app/api/know/route";
import { loadFixturePilot, fixturePlaceId } from "../helpers/pilot";
import { jsonRequest } from "../helpers/http";

const clock = fixedClock("2026-09-21T15:37:12Z");
let placeId = "";

function input(over: Record<string, unknown> = {}) {
  return reportInputSchema.parse({
    idempotencyKey: randomUUID(),
    involvement: "witnessed",
    category: "environment",
    placeId,
    recency: "today",
    timeBand: "late",
    narrative: "",
    ...over,
  });
}

async function submit(actor: string, over: Record<string, unknown> = {}) {
  const sql = getSql();
  return submitReport(sql, actor, await prepareReport(sql, input(over)), clock);
}

describe("REPORT private intake", () => {
  beforeAll(async () => {
    await loadFixturePilot(getSql());
    placeId = await fixturePlaceId(getSql(), "Fixture Pharmacy");
  });
  beforeEach(async () => {
    await getSql()`DELETE FROM reports_private`;
  });

  it("stores a normal report once, encrypted, with only a coarse cell and hour-level time", async () => {
    const r = await submit("actor-a", { narrative: "Streetlight near the gate not working" });
    expect(r).toMatchObject({ replay: false, held: false });
    const [row] = await getSql()`SELECT * FROM reports_private WHERE id = ${r.id}`;
    expect(row.encrypted_text).toMatch(/^v1\./);
    expect(row.encrypted_text).not.toContain("Streetlight");
    expect(decryptText(row.encrypted_text, "report_text")).toBe("Streetlight near the gate not working");
    expect(() => decryptText(row.encrypted_text, "contact_email")).toThrow(); // purpose-bound
    expect(row.coarse_cell_id).toMatch(/^c\d+-\d+$/);
    expect(new Date(row.created_at).toISOString()).toBe("2026-09-21T15:00:00.000Z");
    expect(new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()).toBe(30 * 24 * HOUR);
    expect(Object.keys(row)).not.toContain("place_id");
    expect(row.status).toBe("pending");
  });

  it("accepts Hindi/Hinglish text as written", async () => {
    const text = "मेट्रो गेट के पास एक आदमी घूर रहा था, bahut uncomfortable tha";
    const r = await submit("actor-a", { category: "harassment", narrative: text });
    const [row] = await getSql()`SELECT encrypted_text FROM reports_private WHERE id = ${r.id}`;
    expect(decryptText(row.encrypted_text, "report_text")).toBe(text);
  });

  it("works without a narrative", async () => {
    const r = await submit("actor-a", { category: "positive_condition", narrative: undefined });
    const [row] = await getSql()`SELECT encrypted_text, text_fingerprint FROM reports_private WHERE id = ${r.id}`;
    expect(row.encrypted_text).toBeNull();
    expect(row.text_fingerprint).toBeNull();
  });

  it("holds identifying content privately and stores only flag types", async () => {
    const r = await submit("actor-a", { narrative: "auto DL1RT4567 followed me, call 9876543210" });
    expect(r.held).toBe(true);
    const [row] = await getSql()`SELECT status, hold_reasons, redaction_flags FROM reports_private WHERE id = ${r.id}`;
    expect(row.status).toBe("held");
    expect(row.hold_reasons).toContain("identifying_content");
    expect(JSON.stringify(row.redaction_flags)).not.toMatch(/9876|DL1RT/);
  });

  it("is idempotent for a retried submission", async () => {
    const key = randomUUID();
    const a = await submit("actor-a", { idempotencyKey: key });
    const b = await submit("actor-a", { idempotencyKey: key });
    expect(b.replay).toBe(true);
    expect(b.id).toBe(a.id);
    const [{ n }] = await getSql()`SELECT count(*)::int AS n FROM reports_private`;
    expect(n).toBe(1);
  });

  it("rejects off-pilot places and oversized narratives before saving", async () => {
    const sql = getSql();
    await expect(prepareReport(sql, input({ placeId: "00000000-0000-0000-0000-000000000000" }))).rejects.toMatchObject({ status: 422, code: "outside_pilot" });
    await expect(prepareReport(sql, input({ narrative: "अ".repeat(1001) }))).rejects.toBeInstanceOf(ApiError);
    const ok = await prepareReport(sql, input({ narrative: "अ".repeat(1000) }));
    expect(ok.narrative.length).toBe(1000);
    expect(() => reportInputSchema.parse({ ...input(), extra: "x" })).toThrow();
  });

  it("holds a coordinated burst for review", async () => {
    let last = { held: false };
    for (let i = 0; i < 8; i++) last = await submit(`burst-actor-${i}`, { category: "harassment" });
    expect(last.held).toBe(true);
    const [row] = await getSql()`SELECT hold_reasons FROM reports_private WHERE actor_hash = 'burst-actor-7'`;
    expect(row.hold_reasons).toContain("burst");
  });

  it("does not change public KNOW output", async () => {
    const before = await (await knowPOST(jsonRequest("/api/know", { mode: "place", placeId, time: "late" }))).json();
    await submit("actor-b", { narrative: "Streetlight broken" });
    const after = await (await knowPOST(jsonRequest("/api/know", { mode: "place", placeId, time: "late" }))).json();
    expect(after.community).toEqual(before.community);
    expect(JSON.stringify(after)).not.toContain("Streetlight");
  });
});
