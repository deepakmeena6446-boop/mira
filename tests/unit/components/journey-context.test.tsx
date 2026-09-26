// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RouteContextLines } from "@/components/app/HelpPointList";
import { ArrivalContextLines, RouteOptions, type RouteOption } from "@/components/app/RouteOptions";
import { lightingWhy } from "@/components/app/LightingSummary";
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
    expect(card).toHaveTextContent("1 Help Point along the way · first: Corner Pharmacy, 6 min in");
    expect(card.textContent).not.toMatch(VERDICTS);
  });

  it("says 'not known' and why in one tap, with the community hint", () => {
    render(<RouteContextLines option={option(null, [])} />);
    expect(screen.getByText("Lighting not known")).toBeInTheDocument();
    expect(screen.getByText("No Help Points found along the way")).toBeInTheDocument();
    expect(screen.getAllByText(/Community can improve this/)).toHaveLength(2);
    const [lightWhy] = screen.getAllByRole("button", { name: "Why not known?" });
    expect(lightWhy).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(lightWhy);
    expect(screen.getByText(/has mapped the street lights here yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(VERDICTS);
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
    setCountry({ ...UNKNOWN_COUNTRY, iso: "GB" });
    render(<RouteOptions options={[option(lighting(71, 22)), option(lighting(31, 47), [], 21, 1750)]} selected={0} onSelect={() => {}} />);
    expect(document.body.textContent).toMatch(/18 min · 1\.0 mi/);
  });

  it("for a ride: no lighting numbers, Help Points near where she arrives", () => {
    render(<ArrivalContextLines mode="ride" arrivalHelp={[pharmacy]} dest={{ lat: 51.5033, lon: -0.1196 }} />);
    const card = screen.getByLabelText("What's known about this journey");
    expect(card).toHaveTextContent("Street lighting is shown for walks, not rides.");
    expect(card).toHaveTextContent("1 Help Point near where you arrive · nearest: Corner Pharmacy, 1 min walk");
    expect(card.textContent).not.toMatch(/%/);
    expect(card.textContent).not.toMatch(VERDICTS);
  });

  it("for transit with nothing found: says so, and why in one tap", () => {
    render(<ArrivalContextLines mode="transit" arrivalHelp={[]} dest={{ lat: 0, lon: 0 }} />);
    expect(screen.getByText("No Help Points found near where you arrive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why not known?" }));
    expect(screen.getByText(/may only mean the map has no data yet/)).toBeInTheDocument();
  });
});
