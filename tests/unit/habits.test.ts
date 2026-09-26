import { describe, expect, it } from "vitest";
import { HABIT_MIN_TIMES, describeHabit, habitSuggestion, hourDistance, hourWords, type Habit, type HabitContact, type HabitPlace } from "@/domain/habits";

const HOME = "11111111-1111-4111-8111-111111111111";
const WORK = "22222222-2222-4222-8222-222222222222";
const PRIYA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MUM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const places: HabitPlace[] = [
  { id: HOME, label: "Home" },
  { id: WORK, label: "Work" },
];
const contacts: HabitContact[] = [
  { id: PRIYA, name: "Priya", accepted: true },
  { id: MUM, name: "Mum", accepted: true },
];
const habit = (h: Partial<Habit>): Habit => ({ placeId: HOME, mode: "walk", startHour: 21, times: 3, lastSharedWith: [PRIYA], lastDay: "2026-09-20", ...h });

describe("hourDistance / hourWords", () => {
  it("wraps at midnight", () => {
    expect(hourDistance(23, 0)).toBe(1);
    expect(hourDistance(0, 23)).toBe(1);
    expect(hourDistance(22, 1)).toBe(3);
    expect(hourDistance(12, 0)).toBe(12);
    expect(hourDistance(5, 5)).toBe(0);
  });
  it("says hours in plain words", () => {
    expect(hourWords(21)).toBe("around 9 pm");
    expect(hourWords(9)).toBe("around 9 am");
    expect(hourWords(0)).toBe("around midnight");
    expect(hourWords(12)).toBe("around noon");
    expect(describeHabit({ mode: "walk", startHour: 21, times: 5 }, "Home")).toBe("Home · walking · around 9 pm · 5 times");
    expect(describeHabit({ mode: "transit", startHour: 8, times: 1 }, "Work")).toBe("Work · by transit · around 8 am · 1 time");
  });
});

describe("habitSuggestion (only when history backs it)", () => {
  it("suggests the usual journey with the people she shared it with last time", () => {
    const s = habitSuggestion([habit({ times: 5 })], 21, places, contacts);
    expect(s).toEqual({
      placeId: HOME,
      placeLabel: "Home",
      mode: "walk",
      times: 5,
      shareWith: [{ id: PRIYA, name: "Priya" }],
      text: "You're heading to Home around your usual time. Share this journey with Priya like usual?",
    });
  });

  it("needs at least three matching journeys", () => {
    expect(HABIT_MIN_TIMES).toBe(3);
    expect(habitSuggestion([habit({ times: 2 })], 21, places, contacts)).toBeNull();
    expect(habitSuggestion([habit({ times: 1 }), habit({ times: 1, startHour: 20 })], 21, places, contacts)).toBeNull();
    expect(habitSuggestion([], 21, places, contacts)).toBeNull();
  });

  it("counts journeys within ±1 h of now (same place, same mode), wrapping at midnight", () => {
    const late = [habit({ startHour: 23, times: 2 }), habit({ startHour: 0, times: 1 })];
    expect(habitSuggestion(late, 0, places, contacts)?.times).toBe(3);
    expect(habitSuggestion(late, 23, places, contacts)?.times).toBe(3);
    expect(habitSuggestion(late, 1, places, contacts)).toBeNull(); // only the 0 h bucket is within an hour
    expect(habitSuggestion(late, 22, places, contacts)).toBeNull(); // only the 23 h bucket
    expect(habitSuggestion([habit({ startHour: 21 })], 19, places, contacts)).toBeNull(); // two hours off
    expect(habitSuggestion([habit({ startHour: 21 })], 22, places, contacts)).not.toBeNull();
  });

  it("never mixes ways of travelling or places", () => {
    const split = [habit({ mode: "walk", times: 2 }), habit({ mode: "ride", times: 2 }), habit({ placeId: WORK, times: 2 })];
    expect(habitSuggestion(split, 21, places, contacts)).toBeNull();
    const ride = [habit({ mode: "ride", times: 4 }), habit({ mode: "walk", times: 3 })];
    expect(habitSuggestion(ride, 21, places, contacts)?.mode).toBe("ride"); // the more frequent
    expect(habitSuggestion(ride, 21, places, contacts, { mode: "walk" })?.mode).toBe("walk");
    expect(habitSuggestion(ride, 21, places, contacts, { mode: "transit" })).toBeNull();
    expect(habitSuggestion(ride, 21, places, contacts, { placeId: WORK })).toBeNull();
  });

  it("names only contacts that still exist and are accepted", () => {
    const h = [habit({ lastSharedWith: [PRIYA, MUM, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"] })];
    expect(habitSuggestion(h, 21, places, contacts)?.text).toBe("You're heading to Home around your usual time. Share this journey with Priya and Mum like usual?");
    const withoutPriya = contacts.filter((c) => c.id !== PRIYA); // deleted
    expect(habitSuggestion(h, 21, places, withoutPriya)?.shareWith).toEqual([{ id: MUM, name: "Mum" }]);
    const pending = [{ id: PRIYA, name: "Priya", accepted: false }];
    const s = habitSuggestion([habit({})], 21, places, pending);
    expect(s?.shareWith).toEqual([]);
    expect(s?.text).toBe("Heading to Home around your usual time? Start the journey with MIRA.");
    expect(s?.text).not.toMatch(/Priya/);
  });

  it("forgets places she deleted and ignores nonsense", () => {
    expect(habitSuggestion([habit({})], 21, [{ id: WORK, label: "Work" }], contacts)).toBeNull();
    expect(habitSuggestion([habit({})], 24, places, contacts)).toBeNull();
    expect(habitSuggestion([habit({})], -1, places, contacts)).toBeNull();
    expect(habitSuggestion([habit({ times: 0 }), habit({ times: 3, startHour: 20 })], 21, places, contacts)?.times).toBe(3);
  });

  it("uses the most recent journey for 'like usual' (same day: the hour closest to now)", () => {
    const h = [habit({ startHour: 20, times: 2, lastSharedWith: [MUM], lastDay: "2026-09-25" }), habit({ startHour: 21, times: 2, lastSharedWith: [PRIYA], lastDay: "2026-09-20" })];
    expect(habitSuggestion(h, 21, places, contacts)?.shareWith).toEqual([{ id: MUM, name: "Mum" }]);
    const sameDay = [habit({ startHour: 20, times: 2, lastSharedWith: [MUM], lastDay: "2026-09-25" }), habit({ startHour: 21, times: 1, lastSharedWith: [PRIYA], lastDay: "2026-09-25" })];
    expect(habitSuggestion(sameDay, 21, places, contacts)?.shareWith).toEqual([{ id: PRIYA, name: "Priya" }]);
  });

  it("reads a Date in the phone's local zone", () => {
    const d = new Date(2026, 8, 26, 21, 15);
    expect(habitSuggestion([habit({})], d, places, contacts)?.placeId).toBe(HOME);
  });
});
