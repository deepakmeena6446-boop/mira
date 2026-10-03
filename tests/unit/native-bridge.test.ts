// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { nativeShell } from "@/lib/native-bridge";

afterEach(() => { delete (window as unknown as { MiraNative?: unknown }).MiraNative; });

describe("native shell seam (placeholder)", () => {
  it("claims nothing in a plain browser", async () => {
    const shell = nativeShell();
    expect(shell.available).toEqual({ backgroundLocation: false, pushNotifications: false });
    expect(await shell.startBackgroundLocation("j", "/u")).toBe(false);
  });
  it("ignores a half-injected shell and uses a complete one", async () => {
    (window as unknown as { MiraNative: unknown }).MiraNative = { available: { backgroundLocation: true } };
    expect(nativeShell().available.backgroundLocation).toBe(false);
    (window as unknown as { MiraNative: unknown }).MiraNative = { available: { backgroundLocation: true, pushNotifications: false }, startBackgroundLocation: async () => true, stopBackgroundLocation: async () => {} };
    expect(nativeShell().available.backgroundLocation).toBe(true);
    expect(await nativeShell().startBackgroundLocation("j", "/u")).toBe(true);
  });
});
