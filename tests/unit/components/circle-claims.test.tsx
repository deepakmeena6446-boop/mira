// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CircleScreen } from "@/app/(app)/circle/CircleScreen";
import type { Contact } from "@/server/account/contacts";

const accepted: Contact = { id: "1", name: "Mum", emailHint: "mu••@example.test", phone: null, phoneHint: null, isDefault: true, status: "accepted" };
const invited: Contact = { ...accepted, id: "2", name: "Friend", status: "invited" };
const show = (emailAlerts: boolean, contacts: Contact[]) => render(<CircleScreen user={{ name: "Asha" }} contacts={contacts} emailAlerts={emailAlerts} />);
afterEach(cleanup);

describe("Circle notification claims", () => {
  it("says contact email is unavailable when no provider is configured", () => {
    show(false, [accepted]);
    expect(screen.getAllByText(/Contact email is unavailable/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/emails everyone/i);
  });

  it("does not promise an alert before any contact accepts", () => {
    show(true, [invited]);
    expect(screen.getByText(/Automatic email needs an accepted trusted contact/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Friend.*eligible for a live-link email/);
  });

  it("describes attempts and results for accepted contacts, not guaranteed delivery", () => {
    show(true, [accepted, invited]);
    expect(screen.getByText(/Mum is eligible for a live-link email/)).toBeInTheDocument();
    expect(screen.getByText(/attempts to email accepted contacts/)).toBeInTheDocument();
    expect(screen.getByText(/provider accepted or rejected/)).toBeInTheDocument();
  });
});
