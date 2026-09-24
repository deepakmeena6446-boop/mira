import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openAiProvider, minimiseForProvider, type FetchLike } from "@/server/ai";
import { resetEnvCache } from "@/server/config/env";
import { getSql } from "@/server/db/client";
import { applyTestEnv } from "../setup/test-env";
import { jsonRequest } from "../helpers/http";
import { POST as suggestPOST } from "@/app/api/reports/suggest/route";

function okResponse(payload: unknown) {
  return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] }), { status: 200 });
}

describe("optional AI adapter (mock provider)", () => {
  beforeEach(async () => {
    await getSql()`DELETE FROM abuse_counters`;
  });
  afterAll(() => {
    applyTestEnv();
    resetEnvCache();
  });

  it("sends only minimised, pre-redacted text with store:false and a strict schema", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return okResponse({ category: "environment", time_of_day: "late" });
    };
    const p = openAiProvider({ apiKey: "k", model: "m", fetchImpl });
    const input = minimiseForProvider("Auto DL1RT4567 near house no. 12, call 9876543210. Dark at 11pm");
    const res = await p.suggest(input);
    expect(res).toEqual({ ok: true, suggestion: { category: "environment", timeBand: "late" } });
    const body = calls[0].body;
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(body.store).toBe(false);
    expect((body.text as { format: { strict: boolean } }).format.strict).toBe(true);
    const sent = JSON.stringify(body);
    expect(sent).not.toMatch(/DL1RT4567|9876543210|house no\. 12/);
    expect(sent).toContain("[removed]");
    expect(Object.keys(body).sort()).toEqual(["input", "instructions", "model", "store", "text"]);
    expect(sent).not.toMatch(/c\d+-\d+|28\.\d|77\.\d|actor|cookie/);
  });

  it("falls back on invalid output, refusal, provider error and timeout", async () => {
    const invalid = openAiProvider({ apiKey: "k", model: "m", fetchImpl: async () => okResponse({ category: "murder", time_of_day: "late" }) });
    expect(await invalid.suggest("x")).toEqual({ ok: false, reason: "invalid_output" });
    const extra = openAiProvider({ apiKey: "k", model: "m", fetchImpl: async () => okResponse({ category: "other", time_of_day: "late", verdict: "true" }) });
    expect((await extra.suggest("x")).ok).toBe(false);
    const refusal = openAiProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })),
    });
    expect(await refusal.suggest("x")).toEqual({ ok: false, reason: "refusal" });
    const down = openAiProvider({ apiKey: "k", model: "m", fetchImpl: async () => new Response("boom", { status: 500 }) });
    expect(await down.suggest("x")).toEqual({ ok: false, reason: "provider_error" });
    const slow = openAiProvider({
      apiKey: "k",
      model: "m",
      timeoutMs: 50,
      fetchImpl: (_u, init) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    });
    expect(await slow.suggest("x")).toEqual({ ok: false, reason: "timeout" });
  });

  it("is hidden without a key, without privacy-terms acceptance, and never called without consent", async () => {
    applyTestEnv();
    resetEnvCache();
    expect((await suggestPOST(jsonRequest("/api/reports/suggest", { narrative: "dark lane", consent: true }))).status).toBe(404);
    applyTestEnv({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" });
    resetEnvCache();
    expect((await suggestPOST(jsonRequest("/api/reports/suggest", { narrative: "dark lane", consent: true }))).status).toBe(404);
    applyTestEnv({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m", OPENAI_PRIVACY_TERMS_ACCEPTED: "true" });
    resetEnvCache();
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await suggestPOST(jsonRequest("/api/reports/suggest", { narrative: "dark lane", consent: false }));
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    // With consent but a failing provider, the response is a clean "no suggestion".
    spy.mockResolvedValueOnce(new Response("err", { status: 503 }));
    const failed = await suggestPOST(jsonRequest("/api/reports/suggest", { narrative: "dark lane at night", consent: true }));
    expect(await failed.json()).toEqual({ suggestion: null });
    spy.mockRestore();
  });

  it("model output cannot approve or publish anything", async () => {
    const [{ before }] = await getSql()`SELECT count(*)::int AS before FROM report_structured`;
    const [{ relBefore }] = await getSql()`SELECT count(*)::int AS "relBefore" FROM aggregate_releases`;
    const fetchImpl: FetchLike = async () => okResponse({ category: "harassment", time_of_day: "late" });
    await openAiProvider({ apiKey: "k", model: "m", fetchImpl }).suggest("text");
    const [{ after }] = await getSql()`SELECT count(*)::int AS after FROM report_structured`;
    const [{ rel }] = await getSql()`SELECT count(*)::int AS rel FROM aggregate_releases`;
    expect(after).toBe(before);
    expect(rel).toBe(relBefore);
  });
});
