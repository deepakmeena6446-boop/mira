// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TripView } from "@/server/trips";
import { UNKNOWN_COUNTRY } from "@/domain/country-context";
import { newPlanDraft, newPlanLeg, type PlanDraft } from "@/domain/plan-state";

const mocks = vi.hoisted(() => ({ api: vi.fn(), setLocation: vi.fn(), setCountry: vi.fn(), toast: vi.fn(), now: Date.now(), fix: null as PositionCallback | null, plan: null as PlanDraft | null, setPlan: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.push, refresh: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
vi.mock("@/lib/location-store", () => ({ setLocation: mocks.setLocation, requestLocation: vi.fn(), useClock: () => new Date(mocks.now) }));
vi.mock("@/lib/locale-store", () => ({ setCountry: mocks.setCountry, useCountry: () => ({ iso: "IN", timezone: "Asia/Kolkata" }) }));
vi.mock("@/lib/plan-store", () => ({ usePlanDraft: () => mocks.plan, setPlanDraft: mocks.setPlan }));
vi.mock("@/lib/use-chrome-top", () => ({ useChromeTop: () => {} }));
vi.mock("@/lib/use-wide", () => ({ useWide: () => false }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("@/components/map/WorldMap", () => ({ WorldMap: () => <div>Map equivalent</div> }));
vi.mock("@/components/app/BottomSheet", () => ({ BottomSheet: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/app/HelpCluster", () => ({ HelpCluster: ({ onUnsafe }: { onUnsafe: () => void }) => <button onClick={onUnsafe}>I feel unsafe</button> }));
vi.mock("@/components/app/EmergencyPill", () => ({ EmergencyPill: () => <button>Emergency options</button> }));
vi.mock("@/components/app/AfterArrival", () => ({ AfterArrival: () => null }));
vi.mock("@/components/app/UnsafeSheet", () => ({ UnsafeSheet: ({ open, tell }: { open: boolean; tell: { onTell: () => Promise<unknown> } | null }) => open ? <div role="dialog" aria-label="Right now">{tell ? <button onClick={() => void tell.onTell()}>Tell chosen people</button> : <span>No selected contact action</span>}</div> : null }));

import { TripScreen } from "@/app/(app)/trip/TripScreen";

const noor = "11111111-1111-4111-8111-111111111111", ava = "22222222-2222-4222-8222-222222222222";
let trip: TripView;
const show = () => render(<TripScreen initial={trip} initialNet={{ worker: true, email: true }} tiles={{ url: "", attribution: "", provider: "osm" }} emailAlerts canTell />);
beforeEach(() => {
  mocks.now = Date.now(); mocks.fix = null; mocks.api.mockReset(); mocks.setLocation.mockReset(); mocks.setCountry.mockReset(); mocks.toast.mockReset(); mocks.plan = null; mocks.setPlan.mockReset(); mocks.push.mockReset();
  trip = { id: "33333333-3333-4333-8333-333333333333", state: "active", destination: { name: "Fictional event", lat: 28.69, lon: 77.21 }, etaAt: new Date(mocks.now + 30 * 60_000).toISOString(), expiresAt: new Date(mocks.now + 60 * 60_000).toISOString(), routeMeters: null, extended: false, alert: "none", shareUrl: "http://localhost/t/a-fictional-token", sharedWith: [], mode: "ride", autoArrival: true, checkRequestedAt: null, lastLocation: null, closedAt: null, purgeAt: null, tz: "Asia/Kolkata", createdAt: new Date(mocks.now).toISOString() };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition: vi.fn((callback: PositionCallback) => { mocks.fix = callback; return 1; }), clearWatch: vi.fn(), getCurrentPosition: vi.fn() } });
  mocks.api.mockImplementation(async (path: string, options?: { body?: { contactId?: string; ownerLink?: boolean } }) => {
    if (path === "/api/me") return { ok: true, data: { contacts: [{ id: noor, name: "Fictional Noor", status: "accepted", phone: null }, { id: ava, name: "Fictional Ava", status: "accepted", phone: null }] } };
    if (path === "/api/geo/reverse") return { ok: true, data: { label: "Fictional area", country: { ...UNKNOWN_COUNTRY, iso: "IN", timezone: "Asia/Kolkata" } } };
    if (path === "/api/geo/help") return { ok: true, data: { helpPoints: [], evidence: { state: "ready" } } };
    if (path.endsWith("/location")) return { ok: true, data: { arrived: false } };
    if (path.endsWith("/revoke")) trip = { ...trip, shareUrl: options?.body?.ownerLink ? null : trip.shareUrl, sharedWith: trip.sharedWith.filter((contact) => contact.id !== options?.body?.contactId) };
    return { ok: true, data: { trip, told: [], failed: [], unconfirmed: [], whatsapp: [] } };
  });
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("active journey consent and fresh position controls", () => {
  it("a journey closed on another device stops showing as live, says so, and leaves (audit P18-001 / P15-001)", async () => {
    show(); await act(async () => {});
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path: string, options?: unknown) => path === "/api/trips/current" ? { ok: true, status: 200, data: { trip: null } } : original(path, options));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/trips"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(/closed on another device.*nobody will be alerted/), "info");
  });

  it("after a miss, receipts name only who was actually alerted; people added later are said not to be (audit P0-4)", async () => {
    const person = (id: string, name: string, alertDelivery: TripView["alert"]) => ({ id, name, notified: true, viaEmail: true, whatsapp: null, linkDelivery: "sent" as const, alertDelivery, checkDelivery: "none" as const });
    // The alerted contact was removed after the miss; Chitra was added afterwards and never alerted.
    trip = { ...trip, state: "missed", alert: "sent", etaAt: new Date(mocks.now - 15 * 60_000).toISOString(), sharedWith: [person(noor, "Fictional Chitra", "none")] };
    show(); await act(async () => {});
    const box = screen.getByRole("alert");
    expect(box).toHaveTextContent("accepted the missed-check-in message for someone who is no longer on this journey");
    expect(box).toHaveTextContent("Fictional Chitra hasn't been alerted — call or message them directly.");
    expect(box).not.toHaveTextContent(/message for Fictional Chitra/);
    expect(document.body).not.toHaveTextContent(/Mira attempts an email to Fictional Chitra/);
  });

  it("an arrived event reviews the return without starting or sharing, preserving the old event and explicit choices", async () => {
    const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, point: { lat, lon: 77.21 } } });
    mocks.plan = { ...newPlanDraft(new Date(mocks.now), "Asia/Kolkata"), activity: "Fictional event", origin: { kind: "named", ...place("Fictional home", 28.69) }, destination: place("Fictional event", 28.70), departureLocal: "2026-10-03T18:00", recipientIds: [noor], journeyMode: "location", legs: [{ ...newPlanLeg(), label: "Return after event", origin: place("Fictional event", 28.70), destination: place("Fictional home", 28.69), departureLocal: "2026-10-03T23:30", timeZone: "Asia/Kolkata" }] };
    trip = { ...trip, state: "arrived", destination: { name: "Fictional event", lat: 28.70, lon: 77.21 } };
    show(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Review return journey" }));
    expect(mocks.push).toHaveBeenCalledWith("/plan");
    expect(mocks.setPlan).toHaveBeenCalledWith(expect.objectContaining({ activity: "Return after event", timeZone: "Asia/Kolkata", recipientIds: [noor], journeyMode: "location", legs: [expect.objectContaining({ label: "Fictional event", departureLocal: "2026-10-03T18:00" })] }));
    expect(mocks.api.mock.calls.some(([path]) => /trips.*\/(share|checkon|location)$/.test(String(path)))).toBe(false);
  });

  it("ending early does not show an arrival return action", async () => {
    trip = { ...trip, state: "ended" };
    show(); await act(async () => {});
    expect(screen.queryByRole("button", { name: "Review return journey" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan the return journey" })).toBeNull();
  });

  it("an incomplete return points to the return editor instead of promoting or starting it", async () => {
    mocks.plan = { ...newPlanDraft(new Date(mocks.now), "Asia/Kolkata"), legs: [newPlanLeg()] };
    trip = { ...trip, state: "arrived" };
    show(); await act(async () => {});
    expect(screen.queryByRole("button", { name: "Review return journey" })).toBeNull();
    expect(screen.getByRole("link", { name: "Plan the return journey" })).toHaveAttribute("href", "/plan");
    expect(mocks.setPlan).not.toHaveBeenCalled();
  });

  it("adds only checked recipients after a named confirmation and exposes link revocation", async () => {
    show(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Manage who follows" }));
    const choice = await screen.findByRole("checkbox", { name: /Fictional Noor/ });
    fireEvent.click(choice);
    expect(mocks.api.mock.calls.filter(([path]) => String(path).endsWith("/share"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm chosen recipients" }));
    // Wait for the completed UI transition, rather than racing the promise after the API invocation.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm chosen recipients" })).toBeNull(), { timeout: 5000 });
    expect(mocks.api).toHaveBeenCalledWith(`/api/trips/${trip.id}/share`, { body: { recipientIds: [noor], idempotencyKey: expect.any(String) } });
    fireEvent.click(screen.getByRole("button", { name: "Invalidate copied live link" }));
    expect(mocks.api.mock.calls.filter(([path]) => String(path).endsWith("/revoke"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm invalidate copied live link" }));
    expect(await screen.findByRole("button", { name: "Create a new private live link" })).toBeInTheDocument();
  }, 15_000);

  it("a private urgent action cannot expand Circle; a selected urgent action sends no recipient default", async () => {
    const view = show(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "I feel unsafe" }));
    expect(screen.queryByRole("button", { name: "Tell chosen people" })).toBeNull();
    view.unmount();
    trip.sharedWith = [{ id: noor, name: "Fictional Noor", notified: true, viaEmail: true, whatsapp: null, linkDelivery: "sent", alertDelivery: "none", checkDelivery: "none" }];
    show(); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "I feel unsafe" }));
    fireEvent.click(screen.getByRole("button", { name: "Tell chosen people" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(`/api/trips/${trip.id}/checkon`, { body: { idempotencyKey: expect.any(String) } }));
  });

  it("uses acquisition time for country proof and rejects stale GPS callbacks instead of uploading them", async () => {
    show(); await act(async () => {});
    const point = { latitude: 28.6951, longitude: 77.2143, accuracy: 10 };
    await act(async () => { mocks.fix!({ timestamp: mocks.now - 10 * 60_000, coords: point } as GeolocationPosition); });
    expect(mocks.api.mock.calls.filter(([path]) => String(path).endsWith("/location"))).toHaveLength(0);
    expect(mocks.setCountry).not.toHaveBeenCalled();
    await act(async () => { mocks.fix!({ timestamp: mocks.now - 5_000, coords: point } as GeolocationPosition); });
    expect(mocks.setLocation).toHaveBeenLastCalledWith(expect.objectContaining({ lat: point.latitude, lon: point.longitude }), mocks.now - 5_000);
    expect(mocks.setCountry).toHaveBeenCalledWith(expect.objectContaining({ iso: "IN" }), { point: { lat: point.latitude, lon: point.longitude }, checkedAt: mocks.now - 5_000 });
    expect(screen.getByRole("button", { name: "I'm here" })).toBeInTheDocument();
  });
});
