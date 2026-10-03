// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SafetyAccess } from "@/components/app/SafetyAccess";
import { clearLocation, setLocation } from "@/lib/location-store";
import { currentCountry } from "@/lib/locale-store";
import { countryContext } from "@/server/locale";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
const india = countryContext("IN");
beforeEach(() => { clearLocation(); mocks.api.mockReset(); });
afterEach(() => { cleanup(); clearLocation(); });
it("acquired location refreshes jurisdiction before support opens, without fetching help or contacts", async () => {
  mocks.api.mockImplementation(async (path: string) => ({ ok: true, data: path === "/api/geo/reverse" ? { country: india, label: "Fictional country lookup" } : path === "/api/geo/help" ? { helpPoints: [], evidence: { state: "empty" } } : { user: null, contacts: [], trip: null } }));
  setLocation({ lat: 28.69, lon: 77.21, accuracy: 10 });
  render(<SafetyAccess emailAlerts={false} />);
  expect(await screen.findByRole("link", { name: "Emergency call, 112" })).toHaveAttribute("href", "tel:112");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.api.mock.calls.map(([path]) => path)).toEqual(["/api/geo/reverse"]);
  expect(mocks.api).toHaveBeenCalledWith("/api/geo/reverse", { body: { lat: 28.69, lon: 77.21 } });
  fireEvent.click(screen.getByRole("button", { name: "I feel unsafe" }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/geo/help", { body: { lat: 28.69, lon: 77.21, country: "IN" } }));
});
it("no current fix causes no lookup and a late country response cannot revive a cleared location", async () => {
  let resolve!: (value: unknown) => void;
  mocks.api.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<SafetyAccess emailAlerts={false} />);
  expect(mocks.api).not.toHaveBeenCalled();
  await act(async () => setLocation({ lat: 28.69, lon: 77.21, accuracy: 10 }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
  await act(async () => { clearLocation(); resolve({ ok: true, data: { country: india, label: "Late fixture" } }); });
  expect(currentCountry().iso).toBeNull();
  expect(screen.queryByRole("link", { name: "Emergency call, 112" })).toBeNull();
  expect(screen.getByRole("button", { name: "Emergency options" })).toBeVisible();
});
