// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/Toast";
const route = vi.hoisted(() => ({ path: "/trip" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
function Actions() { const toast = useToast(); return <><button onClick={() => toast("Arrival response was lost. Retry.", "error")}>Fail arrival</button><button onClick={() => toast("Link removed successfully.")}>Remove link</button></>; }
const tree = () => <ToastProvider><Actions /></ToastProvider>;
afterEach(() => { cleanup(); route.path = "/trip"; });
describe("current screen action feedback", () => {
  it("shows the latest result without stacking obsolete failures over controls and permits explicit dismissal", () => {
    render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Fail arrival" }));
    expect(screen.getByText("Arrival response was lost. Retry.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(screen.queryByText("Arrival response was lost. Retry.")).toBeNull();
    expect(screen.getByText("Link removed successfully.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Link removed successfully.")).toBeNull();
  });
  it("does not carry an error into return planning or resurrect it on browser Back", () => {
    const view = render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Fail arrival" }));
    route.path = "/plan"; view.rerender(tree());
    expect(screen.queryByText("Arrival response was lost. Retry.")).toBeNull();
    route.path = "/trip"; view.rerender(tree());
    expect(screen.queryByText("Arrival response was lost. Retry.")).toBeNull();
  });
});
