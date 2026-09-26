import { describe, expect, it, vi } from "vitest";

// The database is down: every query throws. Readiness must say so with a 503, not hang or 500.
vi.mock("@/server/db/client", () => ({
  getSql: () => {
    const sql = () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    return sql;
  },
}));

import { GET as readyGET } from "@/app/api/health/ready/route";
import { GET as liveGET } from "@/app/api/health/live/route";

describe("health endpoints with the database down", () => {
  it("readiness is 503 {status: unavailable}, uncached", async () => {
    const res = await readyGET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "unavailable" });
  });
  it("liveness stays 200 (the Railway deploy healthcheck only needs the process up)", async () => {
    const res = liveGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
