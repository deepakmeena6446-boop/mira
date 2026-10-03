// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { newPlanDraft, newPlanLeg, serializePlanSession, parsePlanSession, PLAN_SESSION_TTL_MS, type PlanDraft } from "@/domain/plan-state";
import { clearPlanDraft, currentPlanDraft } from "@/lib/plan-store";

const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ api: mocks.api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/app/SignInSheet", () => ({ SignInSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) => open ? <div role="dialog" aria-label="Sign in"><button onClick={onClose}>Close sign in</button></div> : null }));
import { SavedReturnReview } from "@/components/app/SavedReturnReview";

const now = new Date("2026-10-03T21:00:00+05:30");
const place = (query: string, lat: number) => ({ query, resolution: { source: "search" as const, name: query, point: { lat, lon: 77.21 } } });
const plan = (): PlanDraft => ({ ...newPlanDraft(now, "Asia/Kolkata"), activity: "Fictional dinner", origin: { kind: "named", ...place("Fictional home", 28.69) }, destination: place("Fictional venue", 28.70), departureLocal: "2026-10-03T21:00", constraints: "step free", journeyMode: "manual", recipientIds: ["11111111-1111-4111-8111-111111111111"], legs: [{ ...newPlanLeg(), label: "Return to Fictional home", origin: place("Fictional venue", 28.70), destination: place("Fictional home", 28.69), departureLocal: "2026-10-04T00:10", timeZone: "Asia/Kolkata", constraints: "luggage" }] });
const saved = () => ({ id: "fictional-saved-plan", draft: plan(), expiresAt: "2026-11-02T15:30:00Z" });
const answer = (plans = [saved()]) => ({ ok: true, data: { plans } });
const request = () => fireEvent.click(screen.getByRole("button", { name: "Choose a saved return plan" }));
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); mocks.api.mockReset(); mocks.push.mockReset(); clearPlanDraft(); sessionStorage.clear(); mocks.api.mockResolvedValue(answer()); });
afterEach(() => { cleanup(); clearPlanDraft(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("explicit account-saved return recovery after temporary draft expiry", () => {
  it("does no account read until requested, restores the chosen return after three hours, and does not start, share or preserve an old route selection", async () => {
    const expired = serializePlanSession(plan(), now.getTime());
    vi.setSystemTime(new Date(now.getTime() + 190 * 60_000));
    expect(parsePlanSession(expired, Date.now())).toBeNull();
    expect(currentPlanDraft()).toBeNull();
    render(<SavedReturnReview />);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    request();
    const review = await screen.findByRole("button", { name: "Review saved return: Return to Fictional home" });
    expect(screen.getByText("Fictional venue → Fictional home")).toBeInTheDocument();
    expect(screen.getByText("2026-10-04 00:10 (Asia/Kolkata)")).toBeInTheDocument();
    expect(currentPlanDraft()).toBeNull();
    fireEvent.click(review);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/plan?planStep=options"));
    expect(currentPlanDraft()).toMatchObject({ activity: "Return to Fictional home", origin: { query: "Fictional venue" }, destination: { query: "Fictional home" }, departureLocal: "2026-10-04T00:10", timeZone: "Asia/Kolkata", constraints: "luggage", journeyMode: "manual", recipientIds: plan().recipientIds, legs: [expect.objectContaining({ label: "Fictional dinner", departureLocal: "2026-10-03T21:00", constraints: "step free" })] });
    expect(currentPlanDraft()?.selection).toBeUndefined();
    const restored = sessionStorage.getItem("mira.plan.v1");
    expect(parsePlanSession(restored, Date.now() + PLAN_SESSION_TTL_MS)).toBeNull();
    expect(sessionStorage.getItem("mira.local-check-in.v1")).toBeNull();
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual(["/api/me/plans", "/api/me/plans"]);
  });

  it("rechecks a selected saved return and refuses a deleted or expired plan without changing the tab", async () => {
    render(<SavedReturnReview />); request();
    const review = await screen.findByRole("button", { name: /Review saved return:/ });
    mocks.api.mockResolvedValueOnce(answer([]));
    fireEvent.click(review);
    expect(await screen.findByText(/That saved return is no longer available/)).toBeInTheDocument();
    expect(screen.getByText(/No available saved return plans/)).toBeInTheDocument();
    expect(currentPlanDraft()).toBeNull(); expect(mocks.push).not.toHaveBeenCalled();
  });

  it("rejects a return that expires after listing even if the next response still includes it", async () => {
    const expiresAt = new Date(now.getTime() + 60_000).toISOString();
    mocks.api.mockResolvedValue(answer([{ ...saved(), expiresAt }]));
    render(<SavedReturnReview />); request();
    const review = await screen.findByRole("button", { name: /Review saved return:/ });
    vi.setSystemTime(new Date(now.getTime() + 60_000));
    fireEvent.click(review);
    expect(await screen.findByText(/That saved return is no longer available/)).toBeInTheDocument();
    expect(currentPlanDraft()).toBeNull(); expect(mocks.push).not.toHaveBeenCalled();
  });

  it("clears a stale owner list when selection loses account access and requires sign-in rather than restoring it", async () => {
    render(<SavedReturnReview />); request();
    const review = await screen.findByRole("button", { name: /Review saved return:/ });
    mocks.api.mockResolvedValueOnce({ ok: false, status: 401, network: false });
    fireEvent.click(review);
    expect(await screen.findByRole("button", { name: "Sign in for saved return plans" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review saved return:/ })).toBeNull();
    expect(currentPlanDraft()).toBeNull(); expect(mocks.push).not.toHaveBeenCalled();
  });

  it("recognizes a complete return with a custom label by its reversed named places", async () => {
    mocks.api.mockResolvedValueOnce(answer([{ ...saved(), draft: { ...plan(), legs: [{ ...plan().legs![0], label: "Home after dinner" }] } }]));
    render(<SavedReturnReview />); request();
    expect(await screen.findByRole("button", { name: "Review saved return: Home after dinner" })).toBeInTheDocument();
    expect(currentPlanDraft()).toBeNull();
  });

  it("clears the fetched choices when closed and requires a fresh explicit account read when reopened", async () => {
    render(<SavedReturnReview />); request();
    expect(await screen.findByRole("button", { name: /Review saved return:/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close saved returns" }));
    expect(screen.queryByRole("button", { name: /Review saved return:/ })).toBeNull();
    expect(mocks.api).toHaveBeenCalledOnce();
    mocks.api.mockResolvedValueOnce(answer([])); request();
    expect(await screen.findByText(/No available saved return plans/)).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(currentPlanDraft()).toBeNull(); expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not offer expired, incomplete or ambiguous-time saved returns", async () => {
    const expired = { ...saved(), expiresAt: now.toISOString() };
    const incomplete = { ...saved(), id: "incomplete", draft: { ...plan(), legs: [{ ...newPlanLeg(), label: "Return home" }] } };
    const ambiguous = { ...saved(), id: "ambiguous", draft: { ...plan(), legs: [{ ...plan().legs![0], departureLocal: "2026-10-25T01:30", timeZone: "Europe/London" }] } };
    mocks.api.mockResolvedValueOnce(answer([expired, incomplete, ambiguous]));
    render(<SavedReturnReview />); request();
    expect(await screen.findByText(/No available saved return plans/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review saved return:/ })).toBeNull();
    expect(currentPlanDraft()).toBeNull();
  });

  it("keeps offline failure distinct from empty and allows an explicit retry", async () => {
    mocks.api.mockResolvedValueOnce({ ok: false, status: 0, network: true });
    render(<SavedReturnReview />); request();
    expect(await screen.findByText(/Saved return plans are unavailable offline/)).toBeInTheDocument();
    expect(screen.queryByText(/No available saved return plans/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry saved return plans" }));
    expect(await screen.findByRole("button", { name: /Review saved return:/ })).toBeInTheDocument();
    expect(currentPlanDraft()).toBeNull(); expect(mocks.push).not.toHaveBeenCalled();
  });

  it("offers sign-in only after an explicit saved-plan request receives 401, then retries without automatically selecting a plan", async () => {
    mocks.api.mockResolvedValueOnce({ ok: false, status: 401, network: false });
    render(<SavedReturnReview />); expect(mocks.api).not.toHaveBeenCalled(); request();
    const signIn = await screen.findByRole("button", { name: "Sign in for saved return plans" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(signIn); expect(screen.getByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry saved return plans" }));
    expect(await screen.findByRole("button", { name: /Review saved return:/ })).toBeInTheDocument();
    expect(currentPlanDraft()).toBeNull(); expect(mocks.push).not.toHaveBeenCalled();
  });
});
