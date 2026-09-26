import "server-only";
import { lightingForRoute } from "@/server/lighting";
import { helpPointsForRoutes, helpPointsNear } from "@/server/help-points";
import { helpPointItems, lightingItems } from "@/domain/context";
import { HELP_CLASSES, SOURCE_NAME, hoursLine, isNight, rankHelpPoints } from "@/domain/help-points";
import type { CountryContext } from "@/domain/country-context";
import { countryContext } from "@/server/locale";
import { getEnv } from "@/server/config/env";
import type postgres from "postgres";
import { getGeo } from "@/server/providers/geo";
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
    coverage: () => coverageLine(Boolean(getEnv().GOOGLE_MAPS_SERVER_KEY)),
    listSavedPlaces: () => listPlaces(sql, user.id),
    async findNearby(kinds?: string[]) {
      if (!ctx.location) return [];
      return (await getGeo().nearby(ctx.location, 1500, kinds)).slice(0, 5);
    },
    /**
     * Help Points around her, ranked deterministically (domain/help-points). Mira never ranks
     * or filters them. `situation` is passed through to the ranking options so the ranking
     * can take it into account; here it only sets how many are shown.
     */
    async findHelpPoints(situation: HelpSituation): Promise<MiraHelpPoint[]> {
      if (!ctx.location) return [];
      const [now, points] = await Promise.all([getContext(), helpPointsNear(getGeo(), ctx.location)]);
      const opts = { night: isNight(now.hour), now: { day: now.isoDay, minute: now.hour * 60 + now.minute }, situation };
      return rankHelpPoints(points, ctx.location, opts)
        .slice(0, situation === "nearby" ? 5 : 3)
        .map((p) => ({ name: p.name, label: HELP_CLASSES[p.cls].label, emoji: HELP_CLASSES[p.cls].emoji, minutes: p.minutes, hours: hoursLine(p), source: SOURCE_NAME[p.source], lat: p.lat, lon: p.lon }));
    },
    async proposeTrip(dest: { name: string; lat: number; lon: number }, mode: MiraTripMode = "walk") {
      if (mode !== "walk") {
        // Ride / transit: MIRA doesn't estimate those here; Home plans it and asks her for the ETA.
        const contacts = await shareTargets(sql, user.id);
        return { destination: dest, minutes: null, contacts: contacts.map((c) => c.name), context: [], mode };
      }
      const [contacts, route] = await Promise.all([shareTargets(sql, user.id), ctx.location ? getGeo().walk(ctx.location, dest) : Promise.resolve(null)]);
      // After dark, lighting along the way is worth knowing (only for real street routes).
      const { hour } = await getContext();
      const night = hour >= 18 || hour < 6;
      const street = route && !route.approximate ? route.geometry : null;
      const [lighting, help] = await Promise.all([
        street && night ? lightingForRoute(sql, street).catch(() => null) : Promise.resolve(null),
        street ? helpPointsForRoutes(getGeo(), [street]).then((r) => r[0]).catch(() => []) : Promise.resolve([]),
      ]);
      // Evidence as context items (deterministic, sourced). Mira chooses what matters; it never adds facts.
      const context = [...(night ? lightingItems(lighting) : []), ...helpPointItems(help)];
      return { destination: dest, minutes: route?.minutes ?? null, contacts: contacts.map((c) => c.name), context, mode };
    },
    tripStatus: () => currentTrip(sql, user.id, new Date()),
    async trustedContacts() {
      return (await shareTargets(sql, user.id)).map((c) => c.name);
    },
  };
}

export type MiraTools = ReturnType<typeof miraTools>;

