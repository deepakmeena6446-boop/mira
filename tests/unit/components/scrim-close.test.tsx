// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sheet } from "@/components/mira/Frame";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("a sheet opened by a double-tap stays open (audit P08-004)", () => {
  it("ignores a scrim tap right after opening, closes on a later one, and never on taps inside", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Right now"><button>Inside</button></Sheet>);
    const scrim = screen.getByRole("dialog");
    fireEvent.click(scrim); // the second tap of the double-tap that opened it
    expect(onClose).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-10-04T12:00:01Z"));
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
