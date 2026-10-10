import { describe, expect, it } from "vitest";
import { layoutAnswer, sentences } from "@/domain/answer-layout";

// design/mira-companion-ux: a reply is grouped for scanning, never changed. Texts are the deterministic companion's.
const WALK = "Calculated daylight at departure is daylight; this excludes weather and shade. Shortest mapped walk is about 3 minutes over 0.2 km. A distinct mapped alternative takes about 4 minutes. Source: © OpenStreetMap contributors (ODbL), imported walking graph; distance at 13.3 min/km assumed pace, data from 24 Sep 2026.  This is a mapped pedestrian estimate at the stated assumed pace, not a safety comparison. Ride and transit service, lighting and opening hours at the planned time remain unverified. Review the options before choosing a journey; starting or sharing requires a separate confirmation.";

describe("layoutAnswer", () => {
  it("leads with the facts, then the next step, what wasn't checked, and the source — every sentence kept", () => {
    const l = layoutAnswer(WALK)!;
    expect(l.answer).toEqual([
      "Calculated daylight at departure is daylight; this excludes weather and shade.",
      "Shortest mapped walk is about 3 minutes over 0.2 km.",
      "A distinct mapped alternative takes about 4 minutes.",
    ]);
    expect(l.next).toEqual(["Review the options before choosing a journey; starting or sharing requires a separate confirmation."]);
    expect(l.limits).toEqual([
      "This is a mapped pedestrian estimate at the stated assumed pace, not a safety comparison.",
      "Ride and transit service, lighting and opening hours at the planned time remain unverified.",
    ]);
    expect(l.sources).toEqual(["Source: © OpenStreetMap contributors (ODbL), imported walking graph; distance at 13.3 min/km assumed pace, data from 24 Sep 2026."]);
    // Nothing dropped or reworded: the groups hold exactly the reply's sentences.
    expect([...l.answer, ...l.next, ...l.limits, ...l.sources].sort()).toEqual(sentences(WALK).sort());
  });

  it("keeps a qualifier with its fact, and a sentence with a number in the answer", () => {
    const l = layoutAnswer("Calculated daylight begins by about 6:34 AM (Asia/Kolkata), 25 minutes later. This is a solar calculation, not a lighting or route check. Source: NOAA solar approximation.")!;
    expect(l.answer).toEqual(["Calculated daylight begins by about 6:34 AM (Asia/Kolkata), 25 minutes later."]);
    expect(l.limits).toEqual(["This is a solar calculation, not a lighting or route check."]);
  });

  it("leaves a reply as one paragraph when there's nothing to separate, or no fact to lead with", () => {
    expect(layoutAnswer("I can start from a named place without your device location and calculate daylight once you choose a time. Which starting place should I use?")).toBeNull();
    expect(layoutAnswer("Ride and transit service remain unverified. Source: © OpenStreetMap contributors.")).toBeNull();
    expect(layoutAnswer("About 21 min on foot.\n- Lighting remains unverified.\nSource: © OpenStreetMap contributors.")).toBeNull();
  });
});
