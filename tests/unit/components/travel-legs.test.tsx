// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { newPlanDraft, newPlanLeg, type PlanDraft } from "@/domain/plan-state";
import { UNKNOWN_COUNTRY } from "@/domain/country-context";

const mocks = vi.hoisted(() => ({ api: vi.fn(), set: vi.fn(), review: vi.fn(), next: null as ((draft: PlanDraft) => void) | null }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
vi.mock("@/lib/plan-store", () => ({ setPlanDraft: (draft: PlanDraft) => { mocks.set(draft); mocks.next?.(draft); } }));
import { TravelLegs } from "@/app/(app)/plan/TravelLegs";

const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, placeId: `o:${query}`, point: { lat, lon: 77.21 } } });
const event = (): PlanDraft => ({ ...newPlanDraft(new Date("2026-10-03T12:30:00Z"), "Asia/Kolkata"), activity: "Fictional event arrival", timeKind: "arrive_by", timeHint: "6 PM", returnTimeHint: "11:30 PM", origin: { kind: "named", ...place("Fictional home", 28.69) }, destination: place("Fictional venue", 28.70), recipientIds: ["11111111-1111-4111-8111-111111111111"], journeyMode: "location", constraints: "step free", departureLocal: "2026-10-03T18:00" });
function Harness({ initial }: { initial: PlanDraft }) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { mocks.next = setDraft; return () => { mocks.next = null; }; }, []);
  return <TravelLegs draft={draft} countries={[{ iso: "IN", name: "India" }, { iso: "GB", name: "United Kingdom" }]} onReview={mocks.review} />;
}
beforeEach(() => { mocks.api.mockReset(); mocks.set.mockReset(); mocks.review.mockReset(); mocks.next = null; mocks.api.mockResolvedValue({ ok: true, data: UNKNOWN_COUNTRY }); });
afterEach(() => { cleanup(); mocks.next = null; });

describe("progressive event return and editable travel legs", () => {
  it("prefills reverse places and the explicit zone, keeps the separate time hint, and reviews without starting or navigating", async () => {
    render(<Harness initial={event()} />);
    expect(screen.getByText(/Return requested: 11:30 PM/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add return leg" }));
    expect(screen.getByLabelText("Leg 2 from")).toHaveValue("Fictional venue");
    expect(screen.getByLabelText("Leg 2 to")).toHaveValue("Fictional home");
    expect(screen.getByLabelText("Leg 2 IANA time zone")).toHaveValue("Asia/Kolkata");
    expect(screen.getByLabelText("Leg 2 local departure")).toHaveValue("");
    expect(screen.getByText(/Requested for this leg: 11:30 PM/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review leg 2 options" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Leg 2 local departure"), { target: { value: "2026-10-03T23:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Done editing leg 2" }));
    expect(screen.queryByLabelText("Leg 2 purpose")).toBeNull();
    expect(screen.getByText(/Places and timing complete/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review leg 2 options" }));
    const selected: PlanDraft = mocks.set.mock.calls.at(-1)![0];
    expect(mocks.review).toHaveBeenCalledOnce();
    expect(selected).toMatchObject({ activity: "Return to Fictional home", origin: { query: "Fictional venue" }, destination: { query: "Fictional home" }, timeZone: "Asia/Kolkata", timeHint: "11:30 PM", returnTimeHint: null, recipientIds: event().recipientIds, journeyMode: "location" });
    expect(selected.legs?.[0]).toMatchObject({ label: "Fictional event arrival", departureLocal: "2026-10-03T18:00", timeZone: "Asia/Kolkata", timeKind: "arrive_by", timeHint: "6 PM", returnTimeHint: "11:30 PM" });
    expect(mocks.api.mock.calls.some(([path]) => /trips|location|route|options/.test(path))).toBe(false);
  }, 15_000);

  it("collapses completed legs, retains other legs during editing, and requires ambiguity resolution after failed search", async () => {
    const first = { ...newPlanLeg(), label: "Hotel transfer", origin: place("Fictional airport", 28.71), destination: place("Fictional hotel", 28.72), departureLocal: "2026-10-04T01:00", timeZone: "Asia/Kolkata", constraints: "luggage" };
    const second = { ...newPlanLeg(), label: "Station transfer", origin: place("Fictional station", 51.50), destination: place("Fictional museum", 51.51), departureLocal: "2026-10-05T09:00", timeZone: "Europe/London" };
    render(<Harness initial={{ ...event(), legs: [first, second] }} />);
    expect(screen.queryByLabelText("Leg 2 purpose")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add travel leg" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit leg 3" }));
    fireEvent.change(screen.getByLabelText("Leg 3 to"), { target: { value: "Ambiguous fictional hotel" } });
    mocks.api.mockResolvedValueOnce({ ok: false, network: true, message: "offline" });
    fireEvent.click(screen.getByRole("button", { name: "Find destination for leg 3" }));
    expect(await screen.findByText(/Your typed name stays here/)).toBeInTheDocument();
    expect(screen.getByLabelText("Leg 3 to")).toHaveValue("Ambiguous fictional hotel");
    expect(screen.getByRole("button", { name: "Review leg 3 options" })).toBeDisabled();
    const unchanged: PlanDraft = mocks.set.mock.calls.at(-1)![0];
    expect(unchanged.activity).toBe(event().activity);
    expect(unchanged.legs?.[0]).toEqual(first);
    mocks.api.mockResolvedValueOnce({ ok: true, data: { places: [{ id: "o:east", name: "Fictional hotel east", kind: "hotel", lat: 51.52, lon: -0.1 }, { id: "o:west", name: "Fictional hotel west", kind: "hotel", lat: 51.53, lon: -0.1 }] } });
    fireEvent.click(screen.getByRole("button", { name: "Find destination for leg 3" }));
    const east = await screen.findByRole("button", { name: "Fictional hotel east · hotel" });
    expect(screen.getByRole("button", { name: "Review leg 3 options" })).toBeDisabled();
    fireEvent.click(east);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review leg 3 options" })).toBeEnabled());
    expect(mocks.api).toHaveBeenLastCalledWith("/api/geo/search", { body: { q: "Ambiguous fictional hotel", near: null, deep: true, source: "osm" } });
  });

  it("refuses ambiguous local times and lets the user correct a leg without overwriting the event", async () => {
    const leg = { ...newPlanLeg(), label: "Late London transfer", origin: place("Fictional station", 51.50), destination: place("Fictional hotel", 51.51), departureLocal: "2026-10-25T01:30", timeZone: "Europe/London" };
    render(<Harness initial={{ ...event(), legs: [leg] }} />);
    const editor = within(screen.getByRole("region", { name: "Leg 2" }));
    expect(editor.getByRole("button", { name: "Review leg 2 options" })).toBeDisabled();
    await act(async () => fireEvent.change(editor.getByLabelText("Leg 2 local departure"), { target: { value: "2026-10-25T03:30" } }));
    expect(editor.getByRole("button", { name: "Review leg 2 options" })).toBeEnabled();
    const next: PlanDraft = mocks.set.mock.calls.at(-1)![0];
    expect(next.departureLocal).toBe("2026-10-03T18:00");
    expect(next.legs?.[0].timeZone).toBe("Europe/London");
  });
});
