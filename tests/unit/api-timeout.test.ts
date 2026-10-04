import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

describe("api() gives up on a hung call (audit L06-007)", () => {
  it("answers 'taking too long' as a network-style result, so retries keep their key", async () => {
    vi.stubGlobal("fetch", (_: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
    const r = await api("/api/geo/help", { body: {}, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, code: "timeout", network: true });
  });
  it("still rethrows the caller's own abort", async () => {
    vi.stubGlobal("fetch", (_: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const ctrl = new AbortController();
    const p = api("/api/geo/search", { body: {}, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
