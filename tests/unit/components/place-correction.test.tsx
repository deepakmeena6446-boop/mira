// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
vi.mock("@/lib/usage-signal", () => ({ recordUsage: () => {} }));

import { PlaceCorrection } from "@/components/app/PlaceCorrection";

// Sprint mira-companion-48h review (issue 4): a correction belongs to the place it was made about.
const A = { name: "Hindu College", lat: 28.6889, lon: 77.2107 };
const B = { name: "Vishwavidyalaya Metro Gate No. 3", lat: 28.6951, lon: 77.2143 };
const ok = { ok: true, data: { outcome: "pending", placeName: "x" } };
const view = (place: typeof A) => <PlaceCorrection place={place} canCorrect signedIn country="IN" />;

afterEach(() => { cleanup(); mocks.api.mockReset(); });

describe("PlaceCorrection across places", () => {
  it("a response that arrives after switching from A to B never appears under B", async () => {
    let resolve!: (v: unknown) => void;
    mocks.api.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { rerender } = render(view(A));
    fireEvent.click(screen.getByRole("button", { name: "Correct this information" }));
    fireEvent.click(screen.getByRole("button", { name: "The opening hours are wrong" }));
    expect(mocks.api).toHaveBeenCalledWith("/api/contribute/correction", { body: expect.objectContaining({ name: A.name, claim: "hours_wrong" }) });
    expect(screen.getByRole("button", { name: "Sending…" })).toBeTruthy();

    rerender(view(B));
    // B starts fresh: closed, nothing sending, no result.
    expect(screen.getByRole("button", { name: "Correct this information" })).toBeTruthy();
    expect(screen.queryByText(/Sending/)).toBeNull();
    await act(async () => { resolve(ok); });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/waiting for someone else to confirm/)).toBeNull();

    // And B can be corrected on its own.
    mocks.api.mockResolvedValueOnce(ok);
    fireEvent.click(screen.getByRole("button", { name: "Correct this information" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "The entrance is closed" })); });
    expect(mocks.api).toHaveBeenLastCalledWith("/api/contribute/correction", { body: expect.objectContaining({ name: B.name, claim: "entrance_closed" }) });
    expect(screen.getByRole("status").textContent).toMatch(/waiting for someone else to confirm/);
  });

  it("a completed correction for A is not shown once B is selected", async () => {
    mocks.api.mockResolvedValueOnce(ok);
    const { rerender } = render(view(A));
    fireEvent.click(screen.getByRole("button", { name: "Correct this information" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "The place has closed down or moved" })); });
    expect(screen.getByRole("status").textContent).toMatch(/waiting for someone else to confirm/);
    rerender(view(B));
    expect(screen.queryByRole("status")).toBeNull();
    // Back to A is a new look at A, not a replay of the old result.
    rerender(view(A));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a failed submission for A doesn't leave its error under B", async () => {
    let resolve!: (v: unknown) => void;
    mocks.api.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { rerender } = render(view(A));
    fireEvent.click(screen.getByRole("button", { name: "Correct this information" }));
    fireEvent.click(screen.getByRole("button", { name: "It's not this kind of place" }));
    rerender(view(B));
    await act(async () => { resolve({ ok: false, status: 0, code: "network", message: "x", network: true }); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
