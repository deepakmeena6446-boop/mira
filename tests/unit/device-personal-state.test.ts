// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { clearDevicePersonalState } from "@/lib/clear-device-personal-state";
import { clearPlanDraft, setPlanDraft } from "@/lib/plan-store";
import { newPlanDraft } from "@/domain/plan-state";
import { startLocalCheckIn, readLocalCheckIn } from "@/lib/local-check-in-store";
import { currentLocation, setLocation } from "@/lib/location-store";
import { currentCountry, setCountry } from "@/lib/locale-store";
import { UNKNOWN_COUNTRY } from "@/domain/country-context";
afterEach(() => { clearDevicePersonalState(); clearPlanDraft(); sessionStorage.clear(); localStorage.clear(); });
it("removes sensitive tab and memory state before the next account uses this device", () => {
  setPlanDraft({ ...newPlanDraft(new Date(), "Europe/London"), activity: "Private destination", touched: true });
  startLocalCheckIn(30); setLocation({ lat: 51.47, lon: -.45, accuracy: 10 });
  setCountry({ ...UNKNOWN_COUNTRY, iso: "GB" }, { point: { lat: 51.47, lon: -.45 }, checkedAt: Date.now() });
  sessionStorage.setItem("mira.tripRoute.fictional", "private route"); sessionStorage.setItem("mira.wa.fictional", "private name");
  sessionStorage.setItem("unrelated", "preserve");
  clearDevicePersonalState();
  expect(sessionStorage.getItem("mira.plan.v1")).toBeNull(); expect(sessionStorage.getItem("mira.tripRoute.fictional")).toBeNull(); expect(sessionStorage.getItem("mira.wa.fictional")).toBeNull();
  expect(readLocalCheckIn()).toBeNull(); expect(currentLocation().point).toBeNull(); expect(currentCountry().iso).toBeNull(); expect(sessionStorage.getItem("unrelated")).toBe("preserve");
});
