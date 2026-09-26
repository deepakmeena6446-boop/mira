import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, dayIn, formatIstDateTime, formatPlaceDate, formatPlaceDateTime, formatPlaceTime, hourIn, isValidTimeZone, zoneLabel, zoneOrUtc } from "@/lib/time";

const SUMMER = new Date("2026-07-01T12:00:00Z");
const WINTER = new Date("2026-01-15T12:00:00Z");

describe("time zones (the journey's zone, labelled; no India default)", () => {
  it("defaults to UTC, not IST", () => {
    expect(DEFAULT_TIMEZONE).toBe("UTC");
    expect(formatPlaceTime(SUMMER)).toBe("12:00 pm UTC");
    expect(formatIstDateTime(SUMMER)).toBe("1 Jul, 12:00 pm UTC"); // admin pages keep working, in UTC
  });

  it("labels each zone with Intl's own abbreviation, or its offset", () => {
    expect(formatPlaceTime(SUMMER, "America/New_York")).toBe("8:00 am EDT");
    expect(formatPlaceTime(WINTER, "America/New_York")).toBe("7:00 am EST");
    expect(formatPlaceTime(SUMMER, "Europe/London")).toBe("1:00 pm BST");
    expect(formatPlaceTime(WINTER, "Europe/London")).toBe("12:00 pm GMT");
    expect(formatPlaceTime(SUMMER, "Asia/Dubai")).toBe("4:00 pm GST");
    expect(formatPlaceTime(SUMMER, "Asia/Kolkata")).toBe("5:30 pm IST");
    expect(formatPlaceTime(SUMMER, "America/Los_Angeles")).toBe("5:00 am PDT");
    expect(formatPlaceTime(WINTER, "Europe/Paris")).toBe("1:00 pm CET");
    expect(formatPlaceTime(SUMMER, "Asia/Tokyo")).toBe("9:00 pm GMT+9"); // no common abbreviation: the offset
    expect(zoneLabel(SUMMER, "Australia/Sydney")).toBe("GMT+10");
    expect(zoneLabel(WINTER, "Australia/Sydney")).toBe("GMT+11");
    expect(formatPlaceDateTime(SUMMER, "America/New_York")).toBe("1 Jul, 8:00 am EDT");
    expect(formatPlaceDate(SUMMER, "Pacific/Kiritimati")).toBe("2 July 2026");
  });

  it("validates zones without trusting them, and never throws on a bad one", () => {
    for (const z of ["UTC", "Europe/London", "America/Argentina/Buenos_Aires", "Asia/Calcutta", "Etc/GMT+5"]) expect(isValidTimeZone(z), z).toBe(true);
    for (const z of ["Mars/Base", "", "x".repeat(65), "Europe/London; DROP", 42, null, undefined]) expect(isValidTimeZone(z), String(z)).toBe(false);
    expect(zoneOrUtc("Mars/Base")).toBe("UTC");
    expect(formatPlaceTime(SUMMER, "Mars/Base")).toBe("12:00 pm UTC");
    expect(formatPlaceTime(SUMMER, null)).toBe("12:00 pm UTC");
  });

  it("finds the local hour and day in a zone", () => {
    expect(hourIn(SUMMER, "America/New_York")).toBe(8);
    expect(hourIn(new Date("2026-07-01T23:30:00Z"), "Asia/Kolkata")).toBe(5);
    expect(hourIn(new Date("2026-07-01T04:00:00Z"), "America/New_York")).toBe(0); // midnight is 0, not 24
    expect(dayIn(new Date("2026-07-01T23:30:00Z"), "Asia/Kolkata")).toBe("2026-07-02");
    expect(dayIn(new Date("2026-07-01T23:30:00Z"), null)).toBe("2026-07-01");
  });
});
