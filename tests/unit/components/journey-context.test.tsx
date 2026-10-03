// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RouteContextLines, helpPointsLine } from "@/components/app/HelpPointList";
import { HelpNearSheet } from "@/components/app/HelpNearSheet";
import { ArrivalContextLines, RouteOptions, type RouteOption } from "@/components/app/RouteOptions";
import { lightingEvidenceLine, lightingWhy, sourceDetails } from "@/components/app/LightingSummary";
import { setCountry } from "@/lib/locale-store";
import { UNKNOWN_COUNTRY } from "@/domain/country-context";
import type { RouteLighting } from "@/domain/lighting";
import type { HelpPoint } from "@/domain/help-points";

const VERDICTS = /\b(safe|safer|safest|unsafe|dangerous|danger|risky|avoid|score)\b/i;

const lighting = (lit: number, unknown: number): RouteLighting => ({
  segments: [],
  summary: { lit, poles: 0, dark: 100 - lit - unknown, unknown },
  confirmed: { lit: 0, dark: 0 },
  sources: { walkers: false, osm: true, poles: false },
});
const pharmacy: HelpPoint = { id: "p1", name: "Corner Pharmacy", cls: "pharmacy", lat: 51.5034, lon: -0.1197, open24h: false, hours: null, source: "osm", alongM: 450 };
const option = (l: RouteLighting | null, help: HelpPoint[] = [pharmacy], minutes = 18, meters = 1600): RouteOption => ({ route: { minutes, meters, geometry: [], approximate: false }, lighting: l, helpPoints: help });

afterEach(() => {
  cleanup();
  setCountry(UNKNOWN_COUNTRY);
});

describe("journey context card", () => {
  it("states lighting with its unknown share, and the first Help Point on the way", () => {
    render(<RouteContextLines option={option(lighting(71, 22))} />);
    const card = screen.getByLabelText("What's known about this way");
    expect(card).toHaveTextContent("71% mapped as lit · 7% mapped as unlit · 22% not known"); // every known share, never a 0%
    expect(card).toHaveTextContent("1 mapped Help Point along the way · first: Corner Pharmacy, 6 min in");
    expect(card.textContent).not.toMatch(VERDICTS);
  });

  it("says 'not known' and why in one tap, with the community hint", () => {
    render(<RouteContextLines option={option(null, [])} />);
    expect(screen.getByText("Lighting not known")).toBeInTheDocument();
    expect(screen.getByText("No mapped Help Points from sources checked")).toBeInTheDocument();
    expect(screen.getAllByText(/Community can improve this/)).toHaveLength(2);
    const [lightWhy] = screen.getAllByRole("button", { name: "Why not known?" });
    expect(lightWhy).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(lightWhy);
    expect(screen.getByText(/has mapped the street lights here yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(VERDICTS);
  });

  it("shows failed and partial source states without discarding available evidence", () => {
    const failed = [{ source: "OpenStreetMap", state: "failed" as const, retryable: true }];
    const partial = [{ source: "MIRA walkers", state: "ready" as const }, ...failed];
    expect(lightingEvidenceLine({ state: "failed", sources: failed, retryable: true }, null)).toBe("Mira couldn't check lighting sources right now.");
    expect(lightingEvidenceLine({ state: "partial", sources: partial, data: lighting(71, 22) }, null)).toMatch(/71% mapped as lit.*Couldn't check OpenStreetMap/);
    expect(helpPointsLine([], { state: "failed", sources: failed, retryable: true })).toBe("Mira couldn't check Help Points right now.");
    expect(helpPointsLine([pharmacy], { state: "partial", sources: partial, data: [pharmacy] })).toMatch(/1 mapped Help Point.*Some sources couldn't be checked/);
  });

  it("offers Retry instead of an empty Help Point claim when lookup failed", () => {
    const retry = vi.fn();
    render(<HelpNearSheet open onClose={() => {}} me={{ lat: 51.5, lon: -0.12 }} points={[]} evidence={{ state: "failed", sources: [{ source: "Google Places", state: "failed", retryable: true }], retryable: true }} loading={false} onRetry={retry} onPick={() => {}} />);
    expect(screen.getByText("Mira couldn't check Help Points right now.")).toBeInTheDocument();
    expect(screen.queryByText(/No mapped Help Points/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("has nothing to explain when every stretch is known", () => {
    expect(lightingWhy(lighting(80, 0))).toBeNull();
    expect(lightingWhy(lighting(60, 40))).toMatch(/not known/i);
  });

  it("compares walking options by time only: 'Fastest' is the only label", () => {
    render(<RouteOptions options={[option(lighting(71, 22)), option(lighting(31, 47), [], 21, 1750)]} selected={0} onSelect={() => {}} />);
    expect(screen.getByText("2 ways to walk")).toBeInTheDocument();
    expect(screen.getAllByText("Fastest")).toHaveLength(1);
    expect(document.body.textContent).toMatch(/22% not known/);
    expect(document.body.textContent).toMatch(/47% not known/);
    expect(document.body.textContent).toMatch(/1\.6 km/);
    expect(document.body.textContent).not.toMatch(/\b(safe|safest|unsafe|recommended|score)\b/i);
  });

  it("shows miles in the UK", () => {
    setCountry({ ...UNKNOWN_COUNTRY, iso: "GB" }, { point: { lat: 51.5, lon: -0.12 }, checkedAt: Date.now() });
    render(<RouteOptions options={[option(lighting(71, 22)), option(lighting(31, 47), [], 21, 1750)]} selected={0} onSelect={() => {}} />);
    expect(document.body.textContent).toMatch(/18 min · 1\.0 mi/);
  });

  it("for a ride: no lighting numbers, Help Points near where she arrives", () => {
    render(<ArrivalContextLines mode="ride" arrivalHelp={[pharmacy]} dest={{ lat: 51.5033, lon: -0.1196 }} />);
    const card = screen.getByLabelText("What's known about this journey");
    expect(card).toHaveTextContent("Street lighting is shown for walks, not rides: it's mapped street by street for people on foot.");
    expect(card).toHaveTextContent("1 Help Point near where you arrive · nearest: Corner Pharmacy, 1 min walk");
    expect(card.textContent).not.toMatch(/%/);
    expect(card.textContent).not.toMatch(VERDICTS);
  });

  it("for a ride whose Help Point lookup failed: says it couldn't check, never 'none'", () => {
    const failed = { state: "failed" as const, sources: [{ source: "Google Places", state: "failed" as const, retryable: true }], retryable: true };
    render(<ArrivalContextLines mode="ride" arrivalHelp={[]} arrivalEvidence={failed} dest={{ lat: 0, lon: 0 }} />);
    expect(screen.getByText("Mira couldn't check Help Points near where you arrive right now.")).toBeInTheDocument();
    expect(screen.queryByText(/No mapped Help Points/)).not.toBeInTheDocument();
  });

  it("says a lighting source failed rather than 'nobody has mapped it', and stays quiet about unconfigured ones", () => {
    const partial = { state: "partial" as const, data: lighting(0, 100), sources: [{ source: "MIRA walkers", state: "ready" as const }, { source: "OpenStreetMap", state: "failed" as const, retryable: true }, { source: "Mapillary", state: "unavailable" as const }] };
    expect(lightingEvidenceLine(partial, null)).toMatch(/Couldn't check OpenStreetMap$/);
    expect(lightingEvidenceLine(partial, null)).not.toMatch(/Mapillary/);
    expect(lightingWhy(lighting(0, 100), partial)).toMatch(/couldn't reach OpenStreetMap/);
    expect(lightingWhy(lighting(0, 100), partial)).not.toMatch(/has mapped the street lights here yet/);
  });

  it("names every lighting source and what it said, not only the ones with data", () => {
    const sources = [{ source: "MIRA walkers", state: "ready" as const }, { source: "OpenStreetMap", state: "failed" as const, retryable: true }, { source: "Mapillary", state: "unavailable" as const }];
    const none = { ...lighting(0, 100), sources: { walkers: false, osm: false, poles: false } };
    expect(sourceDetails({ state: "partial", data: none, sources }, none)).toBe("Mira walkers: nothing mapped here yet; OpenStreetMap: couldn't check just now; Mapillary: not available here.");
    const osm = lighting(71, 22); // OpenStreetMap had data
    const ok = [{ source: "MIRA walkers", state: "ready" as const }, { source: "OpenStreetMap", state: "ready" as const }];
    expect(sourceDetails({ state: "ready", data: osm, sources: ok }, osm)).toBe("From OpenStreetMap. Mira walkers: nothing mapped here yet.");
    expect(sourceDetails(undefined, null)).toBe("Mira could not confirm source coverage.");
  });

  it("for transit with nothing found: says so, and why in one tap", () => {
    render(<ArrivalContextLines mode="transit" arrivalHelp={[]} dest={{ lat: 0, lon: 0 }} />);
    expect(screen.getByText("No mapped Help Points from sources checked near where you arrive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why not known?" }));
    expect(screen.getByText(/No results from checked sources does not mean no places exist/)).toBeInTheDocument();
  });
});
