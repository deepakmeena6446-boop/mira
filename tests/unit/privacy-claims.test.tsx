import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const configured = vi.hoisted(() => vi.fn());
const safety = vi.hoisted(() => ({ mode: "gdelt" as string | undefined }));
vi.mock("@/server/config/env", () => ({ emailConfigured: configured, getEnv: () => ({ SAFETY_UPDATES: safety.mode }) }));
vi.mock("@/server/providers/modes", () => ({ providerModes: () => ({ maps: "osm", companion: "scripted" }) }));

import PrivacyPage from "@/app/(app)/privacy/page";

afterEach(() => configured.mockReset());

describe("Privacy notification claims", () => {
  it("states no contact email when the provider is absent", () => {
    configured.mockReturnValue(false);
    const html = renderToStaticMarkup(<PrivacyPage />);
    expect(html).toContain("Contact email is unavailable");
    expect(html).toContain("does not email anyone if you miss a check-in");
  });

  it("states attempts, failures, and accepted-contact eligibility when configured", () => {
    configured.mockReturnValue(true);
    const html = renderToStaticMarkup(<PrivacyPage />);
    expect(html).toContain("Mira attempts an email if you miss your check-in");
    expect(html).toContain("Sending can fail");
    expect(html).toContain("Without accepted contacts, nobody is alerted");
  });

  it("states exactly what safety updates send, and when they're off", () => {
    configured.mockReturnValue(false);
    safety.mode = undefined;
    const on = renderToStaticMarkup(PrivacyPage());
    expect(on).toContain("sends only the city name to the GDELT news index");
    expect(on).toContain("never your");
    expect(on).toContain("none of it is a rating of any area");
    safety.mode = "off";
    expect(renderToStaticMarkup(PrivacyPage())).toContain("Safety updates are switched off in this version.");
    safety.mode = "gdelt";
  });
});
