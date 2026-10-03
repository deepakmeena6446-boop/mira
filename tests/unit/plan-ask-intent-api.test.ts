import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/http";
import { movementIntentSchema } from "@/domain/plan-contract";
const mock = vi.hoisted(() => ({ sql: vi.fn(), options: vi.fn(), enforce: vi.fn(), outcome: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getSql: mock.sql }));
vi.mock("@/server/plan/options", () => ({ planOptionsFor: mock.options }));
vi.mock("@/server/ratelimit", () => ({ clientIp: () => "fictional-ip", dailyKey: () => "coarse-key", enforce: mock.enforce }));
vi.mock("@/server/decision-outcomes", () => ({ recordDecisionOutcomeBestEffort: mock.outcome }));
import { POST } from "@/app/api/mira/plan/route";
const plan = movementIntentSchema.parse({ version: 2, activity: "Run", origin: { kind: "named", query: "North Gate", resolution: { source: "search", point: { lat: 28.69, lon: 77.21 } } }, destination: null, loop: true, departure: { local: "2026-10-03T04:45", timeZone: "Asia/Kolkata" }, mode: "walk", constraints: [], timeKind: "depart_at", loopTarget: { kind: "duration", value: 30 }, paceMinutesPerKm: 6 });
const evidence = { state: "ready", checkedAt: "2026-10-03T00:00:00Z", source: "Fixture graph", sourceAt: "2026-10-01T00:00:00Z", scope: "fixture loop", options: [{ id: "loop-0", label: "Mapped run loop", minutes: 30, meters: 5000, geometry: [[77.21, 28.69], [77.22, 28.70], [77.21, 28.69]], evidence: [] }], daylight: { status: "known", claim: "Calculated daylight", value: "dark", scope: { kind: "area", ref: "fixture" }, source: { id: "solar", label: "Solar calculation", observedAt: "2026-10-03T00:00:00Z", expiresAt: null } }, service: { status: "unknown", claim: "Service", scope: { kind: "route", ref: "fixture" }, reason: "unsupported", retryable: false }, detail: "One fixture loop" };
beforeEach(() => { mock.sql.mockReset().mockReturnValue({ fixture: true }); mock.options.mockReset().mockResolvedValue(evidence); mock.enforce.mockReset().mockResolvedValue(undefined); mock.outcome.mockReset().mockResolvedValue(undefined); });
describe("Ask uses the full movement intent and immediate support boundary", () => {
  it("acknowledges the checked selection without replacing a missing prior choice", async () => {
    const chosen = await POST(jsonRequest("/api/mira/plan", { message: "Explain my choice", plan, selectedOptionId: "loop-0" }));
    expect(await chosen.text()).toContain("Your selected option, Mapped run loop, is about 30 minutes");
    const missing = await POST(jsonRequest("/api/mira/plan", { message: "Explain my choice", plan, selectedOptionId: "old-loop" }));
    expect(await missing.text()).toContain("I have not substituted another choice");
  });
  it("passes loop target and pace to the same evidence resolver as the plan UI", async () => {
    const response = await POST(jsonRequest("/api/mira/plan", { message: "What run can I choose?", plan }));
    const raw = await response.text(); expect(response.status).toBe(200); expect(raw).toContain("Mapped run loop"); expect(raw).not.toContain("mapped loop is not available");
    expect(mock.options).toHaveBeenCalledWith(expect.anything(), { lat: 28.69, lon: 77.21 }, { lat: 28.69, lon: 77.21 }, plan.departure, expect.any(Date), plan);
  });
  it("ordinary unease produces immediate support before database, quota or graph access", async () => {
    mock.sql.mockImplementation(() => { throw new Error("unexpected DB"); });
    const response = await POST(jsonRequest("/api/mira/plan", { message: "I feel uncomfortable", plan: null }));
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({ type: "card", card: { type: "sos" } }); expect(mock.sql).not.toHaveBeenCalled(); expect(mock.options).not.toHaveBeenCalled(); expect(mock.outcome).not.toHaveBeenCalled();
  });
  it("does not upgrade a provider's unsupported daylight value into a safety fact", async () => {
    mock.options.mockResolvedValue({ ...evidence, daylight: { ...evidence.daylight, value: "safe" } });
    const response = await POST(jsonRequest("/api/mira/plan", { message: "How is my loop?", plan })); const raw = await response.text();
    expect(raw).toContain("couldn't check the plan"); expect(raw).not.toContain("Calculated daylight at departure is safe");
  });
});
