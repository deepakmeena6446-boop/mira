import "server-only";
import { lightingForRoute } from "@/server/lighting";
import { helpPointsEvidenceForRoutes, helpPointsNearEvidence } from "@/server/help-points";
import { helpPointItems, lightingItems } from "@/domain/context";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, isNight, rankHelpPoints } from "@/domain/help-points";
import type { CountryContext } from "@/domain/country-context";
import { CATEGORY_LABEL, DEFAULT_WINDOW, REPORTING_NOTE } from "@/domain/safety-updates";
import { openState, parseOpeningHours } from "@/domain/opening-hours";
import { countryContext } from "@/server/locale";
import { emailConfigured, getEnv } from "@/server/config/env";
import { areaFromReverse, safetyProviders, safetyUpdatesFor, type SafetyEvidence } from "@/server/safety-intel";
import type postgres from "postgres";
import { getGeo, type GeoPoint } from "@/server/providers/geo";
import { listPlaces } from "@/server/account/places";
import { shareTargets } from "@/server/account/contacts";
import { currentTrip } from "@/server/trips";
import type { User } from "@/server/session/user";
import type { MiraContext, MiraHelpPoint, MiraTripMode } from "./types";
import { localClock, type MiraClock } from "./clock";
import { coverageLine } from "./coverage";

export { coverageLine };

/**
 * Mira's tools. Read-only lookups run directly; anything with consequences (starting a
 * trip, filing a report) only returns a proposal card the user must tap to confirm.
 * The same functions back the placeholder engine and Claude tool calls. Every fact Mira
 * may state comes from here or from the context block built on top of `getContext`.
 */

/** Why she wants Help Points: shapes how many are shown (the order is always the deterministic ranking). */
export type HelpSituation = "nearby" | "unsafe" | "emergency";

/** A lookup that can fail: `failed` means MIRA couldn't check, which is never the same as "none". */
export interface HelpLookup {
  points: MiraHelpPoint[];
  failed: boolean;
}

/** Safety updates as Mira may state them: counts, categories, publishers and ages — never headlines or a verdict. */
export type SafetyUpdatesResult =
  | { status: "off" }
  | { status: "no_place"; reason: string }
  | { status: "couldnt_check"; area: string | null }
  | {
      status: "checked";
      area: string;
      precision: string;
      window_days: number;
      count: number;
      /** Some sources couldn't be checked: an empty list then proves even less. */
      partial: boolean;
      categories: Array<{ category: string; updates: number }>;
      latest: Array<{ category: string; publisher: string; age_days: number; reporting: string; sources: number; official: boolean }>;
    };

/** Pure: the tool result for one Safety updates check. A failed or unavailable check is "couldn't check", never "none". */
export function safetyUpdatesSummary(e: SafetyEvidence, area: string | null, now = new Date()): SafetyUpdatesResult {
  if (!("data" in e)) return { status: "couldnt_check", area };
  const counts = new Map<string, number>();
  for (const u of e.data.updates) counts.set(CATEGORY_LABEL[u.category], (counts.get(CATEGORY_LABEL[u.category]) ?? 0) + 1);
  return {
    status: "checked",
    area: e.data.area.name,
    precision: e.data.area.precision,
    window_days: e.data.windowDays,
    count: e.data.updates.length,
    partial: e.state === "partial",
    categories: [...counts].map(([category, updates]) => ({ category, updates })),
    latest: e.data.updates.slice(0, 3).map((u) => ({
      category: CATEGORY_LABEL[u.category],
      publisher: u.publisher,
      age_days: Math.max(0, Math.floor((now.getTime() - new Date(u.publishedAt).getTime()) / 86_400_000)),
      reporting: REPORTING_NOTE[u.reporting],
      sources: u.sourceCount,
      official: u.sourceType === "official",
    })),
  };
}

export interface MiraNow extends MiraClock {
  late: boolean;
  /** A place name for where she is ("Near Gate 3", "Shoreditch"), never coordinates. */
  area: string | null;
  hasLocation: boolean;
  /** What MIRA knows about the country she's in (emergency numbers, helplines); unknown without location. */
  country: CountryContext;
}

export function miraTools(sql: postgres.Sql, user: User, ctx: MiraContext) {
  // Once per message: the reply may consult it several times (greeting, time, nudges).
  let context: Promise<MiraNow> | null = null;
  const getContext = () => {
    context ??= (async () => {
      const clock = localClock(ctx);
      let area = ctx.area || null;
      let country: CountryContext = countryContext(null);
      if (ctx.location) {
        try {
          const r = await getGeo().reverse(ctx.location);
          area ||= r.label;
          country = countryContext(r.country ?? null, r.region ?? null);
        } catch {
          // No place name or country: the context says "not known" rather than guessing.
        }
      }
      return { ...clock, late: clock.hour >= 21 || clock.hour < 5, area, hasLocation: Boolean(ctx.location), country };
    })();
    return context;
  };
  return {
    getContext,
    coverage: () => coverageLine(Boolean(getEnv().GOOGLE_MAPS_SERVER_KEY), safetyProviders().length > 0),
    /** Can MIRA email her Circle at all? Off means a shared journey reaches nobody unless she sends the link herself. */
    emailOn: () => emailConfigured(),
    safetyUpdatesOn: () => safetyProviders().length > 0,
    listSavedPlaces: () => listPlaces(sql, user.id),
    /**
     * Ordinary places around her, or around `around` (a running trip's destination or a saved
     * place). `openNow` is "open" only when listed hours say so at her local time; distances
     * are from the point searched.
     */
    async findNearby(kinds?: string[], around?: GeoPoint) {
      const at = around ?? ctx.location;
      if (!at) return [];
      const [hits, now] = await Promise.all([getGeo().nearby(at, 1500, kinds), getContext()]);
      return hits.slice(0, 5).map((p) => {
        const state = openState(parseOpeningHours(p.hours), { day: now.isoDay, minute: now.hour * 60 + now.minute }).state;
        return { ...p, openNow: state === "open" || state === "closing" ? ("open" as const) : state === "closed" ? ("closed" as const) : ("not_known" as const) };
      });
    },
    /**
     * Help Points around her, ranked deterministically (domain/help-points). Mira never ranks
     * or filters them. `situation` is passed through to the ranking options so the ranking
     * can take it into account; here it only sets how many are shown. A failed map lookup is
     * reported as such, so Mira says "couldn't check" rather than "none".
     */
    async findHelpPoints(situation: HelpSituation): Promise<HelpLookup> {
      if (!ctx.location) return { points: [], failed: false };
      const [now, found] = await Promise.all([getContext(), helpPointsNearEvidence(getGeo(), ctx.location)]);
      if (!("data" in found)) return { points: [], failed: found.state === "failed" };
      const opts = { night: isNight(now.hour), now: { day: now.isoDay, minute: now.hour * 60 + now.minute }, situation };
      const points = rankHelpPoints(found.data, ctx.location, opts)
        .slice(0, situation === "nearby" ? 5 : 3)
        .map((p) => ({ name: p.name, label: HELP_CLASSES[p.cls].label, emoji: HELP_CLASSES[p.cls].emoji, minutes: p.minutes, hours: hoursLine(p), source: SOURCE_NAME[p.source], lat: p.lat, lon: p.lon }));
      return { points, failed: false };
    },
    async proposeTrip(dest: { name: string; lat: number; lon: number }, mode: MiraTripMode = "walk") {
      const email = emailConfigured();
      if (mode !== "walk") {
        // Ride / transit: MIRA doesn't estimate those here; Home plans it and asks her for the ETA.
        const contacts = await shareTargets(sql, user.id);
        return { destination: dest, minutes: null, contacts: contacts.map((c) => c.name), context: [], mode, email, helpLookupFailed: false };
      }
      const [contacts, route] = await Promise.all([shareTargets(sql, user.id), ctx.location ? getGeo().walk(ctx.location, dest) : Promise.resolve(null)]);
      // After dark, lighting along the way is worth knowing (only for real street routes).
      const { hour } = await getContext();
      const night = hour >= 18 || hour < 6;
      const street = route && !route.approximate ? route.geometry : null;
      const [lighting, help] = await Promise.all([
        street && night ? lightingForRoute(sql, street).catch(() => null) : Promise.resolve(null),
        street ? helpPointsEvidenceForRoutes(getGeo(), [street]).then((r) => r[0]).catch(() => null) : Promise.resolve(null),
      ]);
      // Evidence as context items (deterministic, sourced). Mira chooses what matters; it never adds facts.
      const context = [...(night ? lightingItems(lighting) : []), ...helpPointItems(help && "data" in help ? help.data : [])];
      const helpLookupFailed = Boolean(street) && (!help || help.state === "failed");
      return { destination: dest, minutes: route?.minutes ?? null, contacts: contacts.map((c) => c.name), context, mode, email, helpLookupFailed };
    },
    tripStatus: () => currentTrip(sql, user.id, new Date()),
    /**
     * Safety updates (news reports) for the city she's in, or her running trip's destination —
     * the same entry point as POST /api/safety-updates. Read-only; only the city name leaves.
     */
    async safetyUpdates(where: "here" | "destination"): Promise<SafetyUpdatesResult> {
      if (!safetyProviders().length) return { status: "off" };
      let point: GeoPoint | null = ctx.location;
      if (where === "destination") {
        const t = await currentTrip(sql, user.id, new Date());
        if (!t || (t.state !== "active" && t.state !== "missed")) return { status: "no_place", reason: "No journey is running, so MIRA has no destination to check." };
        point = t.destination;
      } else if (!point) return { status: "no_place", reason: "Her location is off, so MIRA doesn't know which city to check." };
      let area: ReturnType<typeof areaFromReverse>;
      try {
        area = areaFromReverse(await getGeo().reverse(point));
      } catch {
        return { status: "couldnt_check", area: null };
      }
      if (!area) return { status: "couldnt_check", area: null };
      const evidence = await safetyUpdatesFor(sql, area, DEFAULT_WINDOW).catch((): SafetyEvidence => ({ state: "failed", sources: [], retryable: true }));
      return safetyUpdatesSummary(evidence, area.name);
    },
    async trustedContacts() {
      return (await shareTargets(sql, user.id)).map((c) => c.name);
    },
  };
}

export type MiraTools = ReturnType<typeof miraTools>;
