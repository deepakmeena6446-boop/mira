import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const configured = vi.hoisted(() => vi.fn());
vi.mock("@/server/config/env", () => ({ emailConfigured: configured }));
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
    expect(html).toContain("MIRA attempts an email if you miss your check-in");
    expect(html).toContain("Sending can fail");
    expect(html).toContain("Without accepted contacts, nobody is alerted");
  });
});
