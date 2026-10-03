import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/http";
const calls = vi.hoisted(() => ({ legacy: vi.fn(), intent: vi.fn(), metric: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getSql: () => "audit-sql" }));
vi.mock("@/server/ratelimit", () => ({ clientIp: () => "fictional", dailyKey: () => "bounded", enforce: async () => {} }));
vi.mock("@/server/plan/options", () => ({ planOptionsFor: calls.legacy, planOptionsForIntent: calls.intent }));
vi.mock("@/server/decision-outcomes", () => ({ recordDecisionOutcomeBestEffort: calls.metric }));
import { POST } from "@/app/api/plan/options/route";
const point = { lat: 28.69, lon: 77.21 };
const departure = { local: "2026-10-07T04:45", timeZone: "Asia/Kolkata" };
const intent = { version: 2, activity: "Run", origin: { kind: "named", query: "Fictional gate", resolution: { source: "search", point } }, destination: null, loop: true, departure, timeKind: "arrive_by", mode: "walk", loopTarget: { kind: "duration", value: 20 }, paceMinutesPerKm: 7, constraints: ["no stairs"] };

describe("full plan-option API boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); calls.legacy.mockResolvedValue({ state: "missing", options: [] }); calls.intent.mockResolvedValue({ state: "ready", options: [] }); });
  it("passes complete intent assumptions to the request-scoped resolver without writing a draft", async () => {
    const response = await POST(jsonRequest("/api/plan/options", { intent }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls.intent).toHaveBeenCalledWith("audit-sql", intent, expect.any(Date));
    expect(calls.legacy).not.toHaveBeenCalled();
    expect(calls.metric).toHaveBeenCalledWith("audit-sql", "plan_option_ready", expect.any(Date));
  });
  it("keeps the older coordinate/time client compatible", async () => {
    const to = { lat: 28.692, lon: 77.212 };
    const response = await POST(jsonRequest("/api/plan/options", { from: point, to, departure }));
    expect(response.status).toBe(200);
    expect(calls.legacy).toHaveBeenCalledWith("audit-sql", point, to, departure, expect.any(Date));
    expect(calls.metric).toHaveBeenCalledWith("audit-sql", "plan_option_partial", expect.any(Date));
  });
  it("allows a long remote ride/transit manual plan while retaining the pedestrian comparison limit", async () => {
    const transfer = { ...intent, loop: false, mode: "ride", destination: { kind: "named", query: "Fictional remote hotel", resolution: { source: "search", point: { lat: 51, lon: 1 } } } };
    expect((await POST(jsonRequest("/api/plan/options", { intent: transfer }))).status).toBe(200);
    expect((await POST(jsonRequest("/api/plan/options", { intent: { ...transfer, mode: "walk" } }))).status).toBe(400);
  });
  it("refuses unresolved origins, injected fields and unbounded loop/pace inputs", async () => {
    for (const invalid of [{ ...intent, origin: { kind: "named", query: "Fictional unresolved" } }, { ...intent, share: true }, { ...intent, paceMinutesPerKm: 0 }, { ...intent, loopTarget: { kind: "distance", value: 100_000 } }]) {
      const response = await POST(jsonRequest("/api/plan/options", { intent: invalid }));
      expect(response.status).toBe(400);
    }
    expect(calls.intent).not.toHaveBeenCalled();
    expect(calls.metric).not.toHaveBeenCalled();
  });
});
