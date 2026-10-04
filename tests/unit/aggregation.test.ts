import { describe, expect, it } from "vitest";
import { computeReleases, isBurst, releaseCopy, type EligibleReport } from "@/domain/aggregation";
import { FORBIDDEN_VERDICT_WORDS } from "@/domain/know-copy";

const T = new Date("2026-09-28T03:00:00Z"); // Monday 08:30 IST
const day = 86_400_000;
let n = 0;
function rep(actor: string, over: Partial<EligibleReport> = {}): EligibleReport {
  n += 1;
  return {
    reportId: `r${n}`,
    actorHash: actor,
    duplicateGroup: null,
    cellId: "c2-2",
    timeBand: "late",
    category: "environment",
    recency: "today",
    tags: ["poor_lighting"],
    submittedAt: new Date(T.getTime() - (n % 10) * day - 3600_000 * (n % 7)),
    ...over,
  };
}
const actors = (k: number, prefix = "a") => Array.from({ length: k }, (_, i) => `${prefix}${i}`);

describe("computeReleases", () => {
  it("publishes nothing below five independent contributors", () => {
    expect(computeReleases(actors(1).map((a) => rep(a)), T, new Map()).releases).toHaveLength(0);
    expect(computeReleases(actors(4).map((a) => rep(a)), T, new Map()).releases).toHaveLength(0);
  });
  it("five 'people' from one network publish nothing; from three networks they do (audit P14-001)", () => {
    const sameNet = actors(5, "b").map((a) => rep(a, { networkHash: "net-1" }));
    expect(computeReleases(sameNet, T, new Map())).toMatchObject({ releases: [], skipped: [{ reason: "not_enough_networks" }] });
    const twoNets = actors(5, "c").map((a, i) => rep(a, { networkHash: i < 4 ? "net-1" : "net-2" }));
    expect(computeReleases(twoNets, T, new Map()).releases).toHaveLength(0);
    const threeNets = actors(5, "d").map((a, i) => rep(a, { networkHash: `net-${i % 3}` }));
    expect(computeReleases(threeNets, T, new Map()).releases).toHaveLength(1);
  });
  it("publishes one coarse release at five independent contributors", () => {
    const { releases } = computeReleases(actors(5).map((a) => rep(a)), T, new Map());
    expect(releases).toHaveLength(1);
    expect(releases[0].copy).toBe("Multiple reviewed observations mention poor lighting in this area during late hours.");
    expect(releases[0].copy).not.toMatch(/\d/);
  });
  it("counts five repeats from one browser once", () => {
    expect(computeReleases(Array.from({ length: 5 }, () => rep("same")), T, new Map()).releases).toHaveLength(0);
  });
  it("collapses a duplicate group across actors", () => {
    const list = actors(5).map((a, i) => rep(a, { duplicateGroup: i < 2 ? "g1" : null }));
    expect(computeReleases(list, T, new Map()).releases).toHaveLength(0);
  });
  it("never merges day and late or unrelated categories", () => {
    const list = [...actors(3).map((a) => rep(a)), ...actors(2, "b").map((a) => rep(a, { timeBand: "day" }))];
    expect(computeReleases(list, T, new Map()).releases).toHaveLength(0);
    const cats = [...actors(3).map((a) => rep(a)), ...actors(2, "b").map((a) => rep(a, { category: "harassment", tags: [] }))];
    expect(computeReleases(cats, T, new Map()).releases).toHaveLength(0);
  });
  it("excludes unsure time, stale recency and old submissions", () => {
    expect(computeReleases(actors(5).map((a) => rep(a, { timeBand: "unsure" })), T, new Map()).releases).toHaveLength(0);
    expect(computeReleases(actors(5).map((a) => rep(a, { recency: "earlier_unsure" })), T, new Map()).releases).toHaveLength(0);
    expect(computeReleases(actors(5).map((a) => rep(a, { submittedAt: new Date(T.getTime() - 22 * day) })), T, new Map()).releases).toHaveLength(0);
  });
  it("requires five new contributors for a changed release (anti-differencing)", () => {
    const prev = new Map([["c2-2|late|environment", new Set(actors(5))]]);
    const plusOne = [...actors(5), "new1"].map((a) => rep(a));
    expect(computeReleases(plusOne, T, prev).skipped[0].reason).toBe("not_enough_new_contributors");
    const plusFive = [...actors(5), ...actors(5, "n")].map((a) => rep(a));
    expect(computeReleases(plusFive, T, prev).releases).toHaveLength(1);
  });
  it("holds a burst", () => {
    const burst = actors(6).map((a, i) => rep(a, { submittedAt: new Date(T.getTime() - day - i * 60_000) }));
    expect(isBurst(burst)).toBe(true);
    expect(computeReleases(burst, T, new Map()).skipped[0].reason).toBe("burst_hold");
  });
  it("thresholds tags separately and keeps positive observations separate", () => {
    const mixed = actors(5).map((a, i) => rep(a, { tags: i < 4 ? ["poor_lighting"] : ["broken_footpath"] }));
    expect(computeReleases(mixed, T, new Map()).releases[0].copy).toBe("Multiple reviewed observations mention problems with the street environment in this area during late hours.");
    const pos = [...actors(5).map((a) => rep(a, { category: "positive_condition", tags: ["people_around"] })), ...actors(5, "z").map((a) => rep(a))];
    const out = computeReleases(pos, T, new Map()).releases;
    expect(out.map((r) => r.polarity).sort()).toEqual(["environmental", "positive"]);
  });
  it("has no template for 'other' and never uses verdict words", () => {
    expect(releaseCopy("other", "late", [])).toBeNull();
    const all = ["harassment", "following_stalking", "unwanted_touching", "threatening_behaviour", "transport_issue", "environment", "positive_condition"] as const;
    const text = all.flatMap((c) => (["day", "evening", "late"] as const).map((b) => releaseCopy(c, b, []))).join(" ");
    for (const re of FORBIDDEN_VERDICT_WORDS) expect(text).not.toMatch(re);
  });
});
