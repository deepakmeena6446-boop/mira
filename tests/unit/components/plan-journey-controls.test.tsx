// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanJourneyControls } from "@/components/app/PlanJourneyControls";
import { LocalCheckInScreen } from "@/app/(app)/trip/local/LocalCheckInScreen";
import { newPlanDraft, intentFromDraft, parsePlanSession } from "@/domain/plan-state";
import { clearPlanDraft, currentPlanDraft, setPlanDraft } from "@/lib/plan-store";
import { rememberLocationChoice } from "@/lib/location-store";
import { endLocalCheckIn, startLocalJourney, startLocalCheckIn, updateLocalJourney, markLocalProgress, readLocalCheckIn, readLocalJourney } from "@/lib/local-check-in-store";

const mocks = vi.hoisted(() => ({ api: vi.fn(), location: vi.fn(), fresh: vi.fn(), push: vi.fn(), refresh: vi.fn(), unsafe: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
vi.mock("@/lib/location-store", async (original) => ({ ...await original<typeof import("@/lib/location-store")>(), requestLocation: mocks.location, freshLocation: mocks.fresh }));
vi.mock("@/components/app/RoutePreview", () => ({ RoutePreview: () => <div>Chosen route</div> }));
vi.mock("@/components/app/EmergencyPill", () => ({ EmergencyPill: () => <a href="tel:112">Emergency options</a> }));
vi.mock("@/components/app/UnsafeSheet", () => ({ UnsafeSheet: (props: { open: boolean; change: { label: string; onReview: () => void } | null }) => { mocks.unsafe(props); return props.open && props.change ? <div role="dialog"><button onClick={props.change.onReview}>{props.change.label}</button></div> : null; } }));

const now = new Date("2026-10-03T18:00:00Z");
const noor = "11111111-1111-4111-8111-111111111111", ava = "22222222-2222-4222-8222-222222222222";
const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, point: { lat, lon: 77.21 } } });
const contacts = [{ id: noor, name: "Fictional Noor", status: "accepted", phone: null }, { id: ava, name: "Fictional Ava", status: "accepted", phone: null }];
const fix = (lat = 28.69) => ({ status: "ok", at: Date.now(), point: { lat, lon: 77.21, accuracy: 10 }, area: null });
function show(signedIn = false) { return render(<PlanJourneyControls plan={intentFromDraft(currentPlanDraft()!)!} option={null} signedIn={signedIn} emailAlerts />); }
const posts = () => mocks.api.mock.calls.filter(([path]) => path === "/api/trips");
const prepare = () => fireEvent.click(screen.getByRole("button", { name: "Start manual journey" }));
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Confirm start" }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  mocks.api.mockReset(); mocks.location.mockReset(); mocks.fresh.mockReset(); mocks.push.mockReset(); mocks.refresh.mockReset(); mocks.unsafe.mockReset();
  endLocalCheckIn(); clearPlanDraft(); sessionStorage.clear();
  setPlanDraft({ ...newPlanDraft(now, "UTC"), activity: "Fictional event arrival", origin: { kind: "named", ...place("Fictional home", 28.69) }, destination: place("Fictional event", 28.70), mode: "ride", departureLocal: "2026-10-03T18:00", timeZone: "UTC" });
  mocks.location.mockImplementation(async () => fix());
  mocks.api.mockImplementation(async (path: string) => path === "/api/me/contacts" ? { ok: true, data: { contacts } } : { ok: true, data: { trip: { id: "33333333-3333-4333-8333-333333333333" } } });
});
afterEach(() => { cleanup(); endLocalCheckIn(); clearPlanDraft(); sessionStorage.clear(); vi.useRealTimers(); });

describe("chosen journey explicit consent and stable retry", () => {
  it("'I feel unsafe' on a private journey shows Help Points from one fresh fix when location is on, and drops it on close", async () => {
    const plan = intentFromDraft(currentPlanDraft()!)!;
    startLocalJourney(plan, null, 60);
    rememberLocationChoice(true);
    const hospital = { id: "osm:node/1", name: "Dr. Ram Manohar Lohia Hospital", cls: "hospital", lat: 28.692, lon: 77.21, open24h: true, hours: null, source: "osm" };
    mocks.fresh.mockImplementation(async () => fix());
    mocks.api.mockImplementation(async (path: string) => path === "/api/geo/help" ? { ok: true, data: { helpPoints: [hospital], evidence: { state: "ready", data: [hospital], sources: [] } } } : path === "/api/me" ? { ok: true, data: { user: null } } : { ok: false, message: "unexpected" });
    try {
      render(<LocalCheckInScreen />); await act(async () => {});
      expect(mocks.fresh).not.toHaveBeenCalled(); // no GPS until she opens the sheet
      fireEvent.click(screen.getByRole("button", { name: "I need options" }));
      await act(async () => {});
      expect(mocks.fresh).toHaveBeenCalledOnce();
      expect(mocks.api).toHaveBeenCalledWith("/api/geo/help", expect.objectContaining({ body: expect.objectContaining({ lat: 28.69, lon: 77.21 }) }));
      expect(mocks.unsafe).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, me: { lat: 28.69, lon: 77.21 }, helpPoints: [hospital], helpLoading: false, helpFailed: false }));
      act(() => mocks.unsafe.mock.lastCall![0].onClose());
      expect(mocks.unsafe).toHaveBeenLastCalledWith(expect.objectContaining({ open: false, me: null, helpPoints: [] }));
      expect(posts()).toHaveLength(0);
    } finally { localStorage.clear(); }
  });
  it("the active private screen reflects the update receipt and offers immediate same-workspace review from support", async () => {
    const plan = intentFromDraft(currentPlanDraft()!)!;
    const entry = startLocalJourney(plan, null, 60)!;
    vi.setSystemTime(new Date(now.getTime() + 10 * 60_000));
    updateLocalJourney(plan, null, 20, entry);
    render(<LocalCheckInScreen />); await act(async () => {});
    expect(screen.getByText(/Journey update confirmed at/)).toHaveTextContent("The original start is unchanged; nobody was notified");
    expect(screen.getByRole("link", { name: "Review or change this journey" })).toHaveAttribute("href", "/plan/legs");
    fireEvent.click(screen.getByRole("button", { name: "I need options" }));
    expect(mocks.unsafe).toHaveBeenLastCalledWith(expect.objectContaining({ me: null, share: null, tell: null }));
    fireEvent.click(screen.getByRole("button", { name: "Review or change journey" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(mocks.push).toHaveBeenCalledWith("/plan/legs");
    expect(readLocalCheckIn()).toEqual({ ...entry, dueAt: Date.now() + 20 * 60_000 });
    expect(mocks.location).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
  });
  it("reviewing or cancelling a private update changes nothing; confirmation requires a manually checked continued origin", async () => {
    const oldPlan = intentFromDraft(currentPlanDraft()!)!;
    const entry = startLocalJourney(oldPlan, null, 60)!; markLocalProgress(75);
    vi.setSystemTime(new Date(now.getTime() + 40 * 60_000));
    setPlanDraft({ ...currentPlanDraft()!, activity: "Fictional revised destination", destination: place("Fictional station", 28.71), journeyMode: "location", recipientIds: [noor] });
    show(true); await act(async () => {});
    expect(screen.getByRole("radio", { name: "Use foreground location" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Private manual journey" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Review journey update" }));
    expect(readLocalCheckIn()).toEqual(entry); expect(readLocalJourney()?.plan).toEqual(oldPlan);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readLocalJourney()?.progress).toBe(75);
    fireEvent.click(screen.getByRole("button", { name: "Review journey update" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm journey update" }));
    expect(screen.getByRole("status")).toHaveTextContent("Manually confirm the origin");
    expect(readLocalCheckIn()).toEqual(entry);
    fireEvent.click(screen.getByRole("checkbox", { name: /I manually confirmed the origin/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Remaining check-in (minutes)" }), { target: { value: "20" } });
    // Changing the reviewed interval invalidates the origin acknowledgement too.
    fireEvent.click(screen.getByRole("checkbox", { name: /I manually confirmed the origin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review journey update" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm journey update" }));
    expect(readLocalCheckIn()).toEqual({ ...entry, dueAt: Date.now() + 20 * 60_000 });
    expect(readLocalJourney()).toMatchObject({ plan: { activity: "Fictional revised destination", destination: { query: "Fictional station" } }, progress: 0, checkedInAt: null, updatedAt: Date.now() });
    expect(currentPlanDraft()).toMatchObject({ journeyMode: "manual", recipientIds: [] });
    expect(mocks.push).toHaveBeenCalledWith("/trip/local");
    expect(mocks.location).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
  });
  it("a saved active timer without guidance can be updated only after review, with no GPS or trip post", async () => {
    const entry = startLocalCheckIn(180)!;
    expect(readLocalJourney()).toBeNull();
    show(); await act(async () => {});
    fireEvent.click(screen.getByRole("checkbox", { name: /I manually confirmed the origin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review journey update" }));
    expect(readLocalJourney()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm journey update" }));
    expect(readLocalJourney()).toMatchObject({ plan: { activity: "Fictional event arrival" }, updatedAt: Date.now() });
    expect(readLocalCheckIn()?.startedAt).toBe(entry.startedAt);
    expect(mocks.location).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
  });
  it("a private update refuses an excessive remaining interval or a timer changed after review", async () => {
    const plan = intentFromDraft(currentPlanDraft()!)!;
    const entry = startLocalJourney(plan, null, 235)!;
    vi.setSystemTime(new Date(now.getTime() + 220 * 60_000));
    show(); await act(async () => {});
    fireEvent.click(screen.getByRole("checkbox", { name: /I manually confirmed the origin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review journey update" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm journey update" }));
    expect(screen.getByRole("status")).toHaveTextContent("235 minutes from its original start");
    expect(readLocalCheckIn()).toEqual(entry);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Remaining check-in (minutes)" }), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I manually confirmed the origin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review journey update" }));
    await act(async () => { updateLocalJourney(plan, null, 5, entry); });
    const changed = readLocalCheckIn();
    fireEvent.click(screen.getByRole("button", { name: "Confirm journey update" }));
    expect(readLocalCheckIn()).toEqual(changed);
    expect(screen.getByRole("status")).toHaveTextContent("reviewed journey changed");
    expect(mocks.location).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("keeps an arrival deadline and derives manual departure from the user's ETA without a service provider", async () => {
    setPlanDraft({ ...currentPlanDraft()!, timeKind: "arrive_by", departureLocal: "2026-10-03T18:30" });
    show(); await act(async () => {});
    expect(screen.getByText(/depart about 2026-10-03 18:00/)).toBeInTheDocument();
    prepare(); confirm();
    expect(readLocalJourney()?.plan).toMatchObject({ timeKind: "arrive_by", departure: { local: "2026-10-03T18:30", timeZone: "UTC" } });
    expect(mocks.location).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0);
  });
  it("unavailable place search permits only a directly confirmed, explicitly unverified private manual plan", async () => {
    setPlanDraft({ ...currentPlanDraft()!, origin: { kind: "named", query: "Fictional terminal", resolution: null }, destination: { query: "Fictional hotel", resolution: null } });
    show(); await act(async () => {}); prepare(); confirm();
    expect(readLocalJourney()).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Confirm the named places directly");
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirmed the named places directly/ }));
    prepare(); confirm();
    expect(readLocalJourney()?.plan.origin).toEqual({ kind: "named", query: "Fictional terminal" });
    expect(mocks.location).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Open navigation provider/ })).toHaveAttribute("href", expect.stringContaining("destination=Fictional%20hotel"));
  });
  it("a unique arrival and manual duration determine departure even across a repeated DST hour", async () => {
    vi.setSystemTime(new Date("2026-11-01T06:30:00Z"));
    setPlanDraft({ ...currentPlanDraft()!, timeKind: "arrive_by", departureLocal: "2026-11-01T02:30", timeZone: "America/New_York" });
    show(); await act(async () => {});
    fireEvent.change(screen.getByRole("spinbutton", { name: "Check in after (minutes)" }), { target: { value: "60" } });
    expect(screen.getByText(/depart about 2026-11-01 01:30/)).toBeInTheDocument();
    prepare(); confirm();
    expect(readLocalJourney()?.plan.departure.local).toBe("2026-11-01T02:30");
    expect(mocks.push).toHaveBeenCalledWith("/trip/local");
    expect(mocks.location).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0);
  });
  it("a guest manual start needs a separate confirmation and uses no GPS, account, or trip API", async () => {
    show(); await act(async () => {});
    expect(readLocalJourney()).toBeNull();
    prepare();
    expect(readLocalJourney()).toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.location).not.toHaveBeenCalled();
    confirm();
    expect(readLocalJourney()).toMatchObject({ plan: { activity: "Fictional event arrival" }, progress: 0 });
    expect(mocks.push).toHaveBeenCalledWith("/trip/local");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.location).not.toHaveBeenCalled();
  });

  it("a journey already running is said plainly and never swapped in for this one (audit P0-3)", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path === "/api/me/contacts" ? { ok: true, data: { contacts } }
      : path === "/api/trips" ? { ok: false, status: 409, code: "trip_active", message: "You already have a trip running.", network: false }
      : path === "/api/trips/current" ? { ok: true, data: { trip: { destination: { name: "Fictional gym" }, autoArrival: true } } }
      : { ok: true, data: {} });
    show(true); await screen.findByRole("radio", { name: "Use foreground location" });
    fireEvent.click(screen.getByRole("radio", { name: "Use foreground location" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Fictional Noor/ }));
    prepare(); confirm();
    expect(await screen.findByText(/You already have a journey running to Fictional gym\. Nothing new started, and nobody was told about this one/)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalledWith("/trip");
    expect(screen.getByRole("link", { name: "Open my current journey" })).toHaveAttribute("href", "/trip");
  });

  it("denied assisted location posts nothing and offers a separately confirmed private manual fallback", async () => {
    mocks.location.mockResolvedValue({ status: "denied", point: null, at: Date.now(), area: null });
    show(true); await screen.findByRole("radio", { name: "Use foreground location" });
    fireEvent.click(screen.getByRole("radio", { name: "Use foreground location" }));
    prepare();
    expect(mocks.location).not.toHaveBeenCalled();
    confirm();
    expect(await screen.findByText(/Retry or use the private manual journey/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: "Private manual journey" }));
    expect(currentPlanDraft()?.journeyMode).toBe("manual");
    prepare(); confirm();
    expect(readLocalJourney()).not.toBeNull();
    expect(mocks.location).toHaveBeenCalledOnce();
    expect(posts()).toHaveLength(0);
  });

  it("recipient choices survive the versioned draft and remount but cannot share or start before confirmation", async () => {
    let view = show(true);
    await act(async () => {});
    fireEvent.click(screen.getByRole("radio", { name: "Use foreground location" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Fictional Noor/ }));
    expect(screen.getByRole("checkbox", { name: /Fictional Ava/ })).not.toBeChecked();
    const restored = parsePlanSession(sessionStorage.getItem("mira.plan.v1"), Date.now());
    expect(restored).toMatchObject({ journeyMode: "location", recipientIds: [noor] });
    expect(posts()).toHaveLength(0); expect(mocks.location).not.toHaveBeenCalled();
    view.unmount(); view = show(true); await act(async () => {});
    expect(await screen.findByRole("checkbox", { name: /Fictional Noor/ })).toBeChecked();
    prepare();
    expect(screen.getByText(/Selected recipients: Fictional Noor/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0); expect(mocks.location).not.toHaveBeenCalled();
    confirm();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][1].body).toMatchObject({ recipientIds: [noor], share: true, tz: "UTC", idempotencyKey: expect.any(String) });
    expect(mocks.push).toHaveBeenCalledWith("/trip");
  });

  it("a failed response retries the identical start body and key despite a changed fresh position", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/api/me/contacts") return { ok: true, data: { contacts } };
      if (posts().length === 1) return { ok: false, network: true, message: "Fictional network response lost" };
      return { ok: true, data: { trip: { id: "33333333-3333-4333-8333-333333333333" } } };
    });
    mocks.location.mockResolvedValueOnce(fix(28.69)).mockResolvedValueOnce(fix(28.6901));
    show(true); await act(async () => {});
    fireEvent.click(screen.getByRole("radio", { name: "Use foreground location" }));
    prepare(); confirm();
    expect(await screen.findByText("Fictional network response lost")).toBeInTheDocument();
    const firstBody = structuredClone(posts()[0][1].body);
    expect(mocks.push).not.toHaveBeenCalled();
    confirm();
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1][1].body).toEqual(firstBody);
    expect(mocks.location).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith("/trip");
  });

  it("an older unconfirmed start checks its receipt before accepting another fresh start", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/api/me/contacts") return { ok: true, data: { contacts } };
      if (path === "/api/trips/current") return { ok: false, network: true, message: "offline" };
      return { ok: false, network: true, message: "Fictional network response lost" };
    });
    show(true); await act(async () => {});
    fireEvent.click(screen.getByRole("radio", { name: "Use foreground location" }));
    prepare(); confirm();
    await screen.findByText("Fictional network response lost");
    vi.setSystemTime(new Date(now.getTime() + 31_000));
    confirm();
    expect(await screen.findByText(/previous start is unconfirmed/)).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith("/api/trips/current");
    expect(posts()).toHaveLength(1);
    expect(mocks.location).toHaveBeenCalledOnce();
  });
});
