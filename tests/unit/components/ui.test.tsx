// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlacePicker } from "@/components/places/PlacePicker";
import { ChoiceGroup } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlacePicker", () => {
  it("is an accessible combobox over the local search API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ places: [{ id: "p1", name: "Vishwavidyalaya Metro Gate No. 1", kind: "Metro entrance" }] }), { status: 200 }),
    );
    const onPick = vi.fn();
    render(<PlacePicker label="Where to?" onPick={onPick} />);
    const input = screen.getByRole("combobox", { name: "Where to?" });
    fireEvent.change(input, { target: { value: "vishwa" } });
    const option = await screen.findByRole("option", { name: /Gate No. 1/ });
    expect(fetchMock).toHaveBeenCalledWith("/api/places?q=vishwa", expect.objectContaining({ headers: expect.objectContaining({ "x-mira-request": "1" }) }));
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    expect(option).toBeTruthy();
  });

  it("says when nothing matches in the pilot area", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    render(<PlacePicker label="Where to?" onPick={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "connaught place" } });
    await waitFor(() => expect(screen.getAllByText(/No matching places in the pilot area/).length).toBeGreaterThan(0));
  });
});

describe("form primitives", () => {
  it("ChoiceGroup exposes a labelled radio group with its error", () => {
    render(<ChoiceGroup name="t" legend="Time of day" value={null} onChange={() => {}} error="Choose one" options={[{ value: "day", label: "Day" }, { value: "late", label: "Late" }]} />);
    expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Choose one").id).toBe("t-error");
  });

  it("busy buttons block double submission", () => {
    const onClick = vi.fn();
    render(
      <Button busy busyLabel="Sending…" onClick={onClick}>
        Submit
      </Button>,
    );
    const b = screen.getByRole("button", { name: /Sending/ });
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});
