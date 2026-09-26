// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ api }));

import { AfterArrival, CHECK_RETRY_DELAYS_MS } from "@/components/app/AfterArrival";

const trip = { id: "11111111-1111-4111-8111-111111111111", state: "arrived", mode: "walk", autoArrival: true };
const ready = { id: "check-1", journeyId: trip.id, question: "Was this place open?", options: [{ value: "yes", label: "Yes" }], expiresAt: new Date(Date.now() + 60_000).toISOString() };
const response = (journeyCheck: "ready" | "pending" | "none" | "failed", checks: unknown[] = []) => ({ ok: true, data: { journeyCheck, checks } });
const show = () => render(<AfterArrival trip={trip} route={null} hour={12} onDone={() => {}} />);

async function nextAttempt(i: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_RETRY_DELAYS_MS[i]); });
}

afterEach(() => { cleanup(); vi.useRealTimers(); api.mockReset(); });

describe("after-arrival journey check", () => {
  it("shows a preparing state immediately, then a ready single question", async () => {
    let finish!: (v: ReturnType<typeof response>) => void;
    api.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show();
    expect(screen.getByText(/Preparing/)).toBeInTheDocument();
    await act(async () => { finish(response("ready", [ready])); });
    expect(screen.getAllByText("Was this place open?")).toHaveLength(1);
  });

  it("retries delayed and transient preparation, then shows the question", async () => {
    vi.useFakeTimers();
    api.mockResolvedValueOnce(response("pending")).mockResolvedValueOnce({ ok: false, network: true }).mockResolvedValueOnce(response("ready", [ready]));
    show();
    await act(async () => {});
    expect(screen.getByText(/Preparing/)).toBeInTheDocument();
    await nextAttempt(1);
    await nextAttempt(2);
    expect(screen.getAllByText("Was this place open?")).toHaveLength(1);
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("distinguishes a definitive no-check from an expired question", async () => {
    api.mockResolvedValueOnce(response("none"));
    show();
    expect(await screen.findByText("Nothing needed from you this time.")).toBeInTheDocument();
    cleanup();
    api.mockResolvedValueOnce(response("none", [{ ...ready, expiresAt: new Date(Date.now() - 1000).toISOString() }]));
    show();
    expect(await screen.findByText("Nothing needed from you this time.")).toBeInTheDocument();
    expect(screen.queryByText("Was this place open?")).not.toBeInTheDocument();
  });

  it("stops after bounded retries and points to Contribute", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue(response("pending"));
    show();
    await act(async () => {});
    for (let i = 1; i < CHECK_RETRY_DELAYS_MS.length; i++) await nextAttempt(i);
    expect(screen.getByText(/check later in Contribute/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Contribute" })).toHaveAttribute("href", "/contribute");
    expect(api).toHaveBeenCalledTimes(CHECK_RETRY_DELAYS_MS.length);
  });

  it("prioritizes the one night-walk lighting question without a provider request", () => {
    show();
    cleanup();
    render(<AfterArrival trip={trip} route={[[77.1, 28.6], [77.2, 28.7], [77.3, 28.8]]} hour={22} onDone={() => {}} />);
    expect(screen.getAllByText("Was the way lit?")).toHaveLength(1);
    expect(api).toHaveBeenCalledTimes(1);
  });
});
