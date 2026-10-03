import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/http";
import { deterministicIntentHints } from "@/domain/plan-intent";
const mock = vi.hoisted(() => ({ sql: vi.fn(), enforce: vi.fn(), extraction: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getSql: mock.sql }));
vi.mock("@/server/ratelimit", () => ({ clientIp: () => "10.20.30.40", dailyKey: () => "coarse-key", enforce: mock.enforce }));
vi.mock("@/server/providers/companion/intent", () => ({ ephemeralIntentHints: mock.extraction }));
import { POST } from "@/app/api/mira/intent/route";
beforeEach(() => { mock.sql.mockReset().mockReturnValue({ fixture: true }); mock.enforce.mockReset().mockResolvedValue(undefined); mock.extraction.mockReset().mockImplementation(async (_sql, message: string) => ({ hints: deterministicIntentHints(message), source: "deterministic" })); });
describe("ephemeral movement intent API", () => {
  it("returns source-bound hints under coarse rate controls without a persistence context", async () => {
    const message = "Run from North Gate for 30 min at 4:45 AM";
    const response = await POST(jsonRequest("/api/mira/intent", { message }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ source: "deterministic", support: null, hints: { origin: "North Gate", timeHint: "4:45 AM", loop: true, mode: "walk" } });
    expect(mock.enforce).toHaveBeenCalledOnce(); expect(mock.extraction.mock.calls[0]).toHaveLength(3);
  });
  it("SOS and ordinary unease bypass the database, quota and model entirely", async () => {
    mock.sql.mockImplementation(() => { throw new Error("DB should be unreachable"); });
    for (const message of ["Someone is following me", "I feel uncomfortable", "SOS", "I am uneasy"]) {
      const response = await POST(jsonRequest("/api/mira/intent", { message }));
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ hints: null, source: "deterministic" });
    }
    expect(mock.sql).not.toHaveBeenCalled(); expect(mock.enforce).not.toHaveBeenCalled(); expect(mock.extraction).not.toHaveBeenCalled();
  });
  it("rejects coordinates/context/action fields and keeps product questions outside extraction", async () => {
    const invalid = await POST(jsonRequest("/api/mira/intent", { message: "Run", location: { lat: 1, lon: 2 }, share: true }));
    expect(invalid.status).toBe(400); expect(mock.extraction).not.toHaveBeenCalled();
    const informational = await POST(jsonRequest("/api/mira/intent", { message: "What can you do?" }));
    expect(await informational.json()).toEqual({ hints: null, source: "deterministic", modelAttempted: false, support: null }); expect(mock.sql).not.toHaveBeenCalled();
  });
});
