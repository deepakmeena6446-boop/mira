// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { closeOverlayThen, useOverlay } from "@/lib/use-overlay";
function Dialog({ open, close, nested = false, navigate }: { open: boolean; close: () => void; nested?: boolean; navigate?: () => void }) {
  useOverlay(open, close);
  return open ? createPortal(<div role="dialog" aria-modal="true" aria-label={nested ? "Nested" : "Support"}><button onClick={close}>First {nested ? "nested" : "support"}</button>{navigate ? <button onClick={() => closeOverlayThen(close, navigate)}>Review movement</button> : null}<button>Last {nested ? "nested" : "support"}</button></div>, document.body) : null;
}
function Harness({ navigate }: { navigate?: () => void } = {}) {
  const [open, setOpen] = useState(false), [nested, setNested] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open</button><button onClick={() => setNested(true)}>Open nested</button><Dialog open={open} close={() => setOpen(false)} navigate={navigate} /><Dialog nested open={nested} close={() => setNested(false)} /></>;
}
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
  const previous: { state: unknown; href: string }[] = [];
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => { previous.push({ state: window.history.state, href: window.location.href }); push(state, unused, url); });
  vi.spyOn(window.history, "back").mockImplementation(() => { const target = previous.pop(); if (target) { window.history.replaceState(target.state, "", target.href); window.dispatchEvent(new PopStateEvent("popstate", { state: target.state })); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("urgent modal keyboard access", () => {
  it("waits for the closed overlay's actual history return before navigating, so a late Back cannot cancel the route", () => {
    vi.mocked(window.history.back).mockImplementation(() => {});
    const navigate = vi.fn(() => window.history.pushState({ route: true }, "", "/around/map"));
    render(<Harness navigate={navigate} />); fireEvent.click(screen.getByRole("button", { name: /^Open$/ }));
    const overlayState = window.history.state;
    fireEvent.click(screen.getByRole("button", { name: "Review movement" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(window.history.back).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: overlayState })));
    expect(navigate).not.toHaveBeenCalled();
    act(() => { window.history.replaceState(null, "", "/"); window.dispatchEvent(new PopStateEvent("popstate", { state: null })); });
    expect(navigate).toHaveBeenCalledOnce(); expect(window.location.pathname).toBe("/around/map");
    expect(window.history.state).toEqual({ route: true }); expect(window.history.back).toHaveBeenCalledOnce();
  });
  it("browser Back closes only the top nested overlay without scheduling another Back or navigation", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />); fireEvent.click(screen.getByRole("button", { name: /^Open$/ }));
    const parentState = window.history.state;
    fireEvent.click(screen.getByText("Open nested"));
    act(() => window.history.back());
    expect(screen.queryByRole("dialog", { name: "Nested" })).toBeNull(); expect(screen.getByRole("dialog", { name: "Support" })).toBeTruthy();
    expect(window.history.state).toEqual(parentState); expect(window.history.back).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(window.history.back).toHaveBeenCalledTimes(2); expect(window.history.state).toBeNull();
  });
  it("enters focus, makes background inert, traps both ends and restores the opener", () => {
    const view = render(<Harness />); const opener = screen.getByRole("button", { name: /^Open$/ }); opener.focus(); fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First support" })); expect(view.container.inert).toBe(true);
    screen.getByRole("button", { name: "Last support" }).focus(); fireEvent.keyDown(window, { key: "Tab" }); expect(document.activeElement).toBe(screen.getByRole("button", { name: "First support" }));
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last support" }));
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(opener); expect(view.container.inert).toBeFalsy();
  });
  it("Escape closes only the topmost nested sheet and restores the parent focus", () => {
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: /^Open$/ }));
    fireEvent.click(screen.getByText("Open nested")); expect(document.activeElement).toBe(screen.getByRole("button", { name: "First nested" }));
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("dialog", { name: "Nested" })).toBeNull(); expect(screen.getByRole("dialog", { name: "Support" })).toBeTruthy(); expect(document.activeElement).toBe(screen.getByRole("button", { name: "First support" }));
  });
});
