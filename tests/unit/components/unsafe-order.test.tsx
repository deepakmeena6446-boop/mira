// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));

import { UnsafeSheet } from "@/components/app/UnsafeSheet";
import type { HelpPoint } from "@/domain/help-points";

afterEach(() => cleanup());

const point = (id: string, cls: HelpPoint["cls"], dLat: number): HelpPoint =>
  ({ id, name: `Place ${id}`, cls, lat: 28.6951 + dLat, lon: 77.2143, open24h: true, hours: "24/7", source: "osm" }) as HelpPoint;

/**
 * "I feel unsafe" is a frozen order (docs/launch-ux/02 C-16.2): move toward help, tell your people,
 * call, emergency, then where you are, then Mira, then "I'm okay now". Restyling must not reorder it.
 */
describe("I feel unsafe — the action order is frozen", () => {
  it("keeps Help Point → share/tell → call → emergency → location in words → Mira → I'm okay now", () => {
    render(
      <UnsafeSheet
        open
        onClose={() => {}}
        me={{ lat: 28.6951, lon: 77.2143 }}
        area="Banarsi Das Estate"
        helpPoints={[point("a", "fuel", 0.002), point("b", "transit", 0.004), point("c", "police", 0.006)]}
        helpLoading={false}
        onGoHelpPoint={() => {}}
        goLabel="Walk there"
        share={{ label: "Share my journey live", detail: "Sign in, then send a live link to anyone.", onShare: () => {} }}
        tell={{ names: ["Mum"], email: false, onTell: async () => ({ told: [], failed: [], whatsapp: [] }) }}
        landmark={null}
        exclude={[]}
      />,
    );
    expect(screen.getByLabelText("Immediate Emergency action").querySelector("button, a")).toHaveTextContent(/Emergency/);
    const names = [...screen.getByRole("dialog", { name: "Right now" }).querySelectorAll("button, a")].map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim());
    const order = [/^Close$/, /Go to a Help Point/, /Place b/, /Place c/, /Tell my people now/, /Share my journey live/, /Call someone/, /Emergency|call/i, /Copy/, /Talk to Mira/, /I'm okay now/];
    let at = -1;
    for (const want of order) {
      const i = names.findIndex((n, k) => k > at && want.test(n));
      expect(i, `${want} after position ${at} in ${JSON.stringify(names)}`).toBeGreaterThan(at);
      at = i;
    }
  });
});
