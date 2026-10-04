// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn(), fresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
vi.mock("@/lib/location-store", async (original) => ({ ...await original<typeof import("@/lib/location-store")>(), freshLocation: mocks.fresh }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));

import { GoSheet, type GoTarget } from "@/app/(app)/plan/GoSheet";

const target: GoTarget = { intent: null, mode: "walk", loop: false, to: { name: "Fictional gate", lat: 28.69, lon: 77.21 }, start: null, minutes: 12, geometry: null, fastest: true };
const trip = { id: "33333333-3333-4333-8333-333333333333" };
const posts = () => mocks.api.mock.calls.filter(([path]) => path === "/api/trips");
let fixes = 0;

beforeEach(() => {
  mocks.api.mockReset(); mocks.push.mockReset(); fixes = 0;
  // Each fix lands a few metres apart, like a real phone: a retry must not resend a *new* start point.
  mocks.fresh.mockImplementation(async () => ({ status: "ok", at: Date.now(), point: { lat: 28.6951 + fixes++ * 0.0001, lon: 77.2143, accuracy: 10 }, area: null }));
});
afterEach(() => cleanup());

describe("Go with Mira: a lost reply to Start (audit P09-001)", () => {
  it("says the start is unconfirmed, then Start again resends the identical request and opens the one journey", async () => {
    let first = true;
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/api/me/contacts") return { ok: true, data: { contacts: [] } };
      if (path === "/api/trips") {
        if (first) { first = false; return { ok: false, status: 0, code: "network", message: "We couldn't reach Mira", network: true }; }
        return { ok: true, status: 200, data: { trip } };
      }
      return { ok: true, data: {} };
    });
    render(<GoSheet open onClose={() => {}} target={target} signedIn emailAlerts onSignIn={() => {}} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Start — just me" }));
    expect(await screen.findByText(/can't confirm your journey started\. It may have/)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start — just me" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/trip"));
    expect(posts()).toHaveLength(2);
    expect(posts()[1][1].body).toEqual(posts()[0][1].body); // same key, same start point
    expect(mocks.fresh).toHaveBeenCalledTimes(1);
  });
});

describe("Go with Mira uses the time she planned (audit P13-002)", () => {
  beforeEach(() => mocks.api.mockImplementation(async (path: string) => (path === "/api/me/contacts" ? { ok: true, data: { contacts: [] } } : { ok: true, status: 200, data: { trip } })));
  it("an arrive-by time becomes the check-in, and is sent as the ETA", async () => {
    const ride: GoTarget = { ...target, mode: "ride", minutes: null, plannedAt: { kind: "arrive_by", at: Date.now() + 50 * 60_000 } };
    render(<GoSheet open onClose={() => {}} target={ride} signedIn emailAlerts onSignIn={() => {}} />);
    await act(async () => {});
    expect(screen.getByText(/Your plan says arrive by .*, so your check-in is set to then\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start — just me" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][1].body.etaMinutes).toBeGreaterThanOrEqual(49);
    expect(posts()[0][1].body.etaMinutes).toBeLessThanOrEqual(50);
  });
  it("a plan for later says that Start begins now", async () => {
    render(<GoSheet open onClose={() => {}} target={{ ...target, plannedAt: { kind: "depart_at", at: Date.now() + 6 * 3_600_000 } }} signedIn emailAlerts onSignIn={() => {}} />);
    await act(async () => {});
    expect(screen.getByText(/Starting now begins the journey now/)).toBeInTheDocument();
  });
});
