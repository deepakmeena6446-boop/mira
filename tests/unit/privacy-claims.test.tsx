import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const configured = vi.hoisted(() => vi.fn());
const safety = vi.hoisted(() => ({ mode: "gdelt" as string | undefined }));
const companion = vi.hoisted(() => ({ mode: "scripted" }));
vi.mock("@/server/config/env", () => ({ emailConfigured: configured, getEnv: () => ({ SAFETY_UPDATES: safety.mode }) }));
vi.mock("@/server/providers/modes", () => ({ providerModes: () => ({ maps: "osm", companion: companion.mode }) }));

import PrivacyPage from "@/app/(app)/privacy/page";

afterEach(() => { configured.mockReset(); companion.mode = "scripted"; });

describe("Privacy notification claims", () => {
  it("discloses the one-text configured AI transfer separately from draft and saved chat retention", () => {
    companion.mode = "claude";
    const html = renderToStaticMarkup(<PrivacyPage />);
    expect(html).toContain("may send that one submitted text to Anthropic");
    expect(html).toContain("any names, addresses or purpose you type");
    expect(html).toContain("does not add your device location, account, saved places, contacts or chat history");
    expect(html).toContain("An AI failure can use built-in rules after the text has already been sent");
    expect(html).toContain("two-hour tab expiry applies to your draft, not to an AI provider");
    expect(html).toContain("Signed-in nearby, reporting and general product chat is saved");
    expect(html).not.toContain("zero retention");
  });
  it("discloses deterministic extraction when AI is absent", () => {
    expect(renderToStaticMarkup(<PrivacyPage />)).toContain("currently use built-in extraction rules");
  });
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
