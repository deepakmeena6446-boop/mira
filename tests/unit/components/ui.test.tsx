// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChoiceGroup } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
