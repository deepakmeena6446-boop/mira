import "server-only";
import { lightingForRoute } from "@/server/lighting";
import { daypartFor, type Daypart } from "@/domain/daypart";
import type postgres from "postgres";
import { getGeo } from "@/server/providers/geo";
import { listPlaces } from "@/server/account/places";
import { shareTargets } from "@/server/account/contacts";
import { currentTrip } from "@/server/trips";
import type { User } from "@/server/session/user";
import type { MiraContext } from "./types";

/**
 * Mira's tools. Read-only lookups run directly; anything with consequences (starting a
 * trip, filing a report) only returns a proposal card the user must tap to confirm.
 * The same functions back the placeholder engine and, later, Claude tool calls.
 */
export function miraTools(sql: postgres.Sql, user: User, ctx: MiraContext) {
  // Once per message: the reply may consult it several times (greeting, time, nudges).
  let context: Promise<{ hour: number; minute: number; daypart: Daypart; late: boolean; area: string | null; hasLocation: boolean }> | null = null;
  const getContext = () => {
    context ??= (async () => {
      const local = new Date(ctx.localTime);
      const minutes = (local.getUTCHours() * 60 + local.getUTCMinutes() - ctx.tzOffsetMin + 1440) % 1440;
      const hour = Math.floor(minutes / 60);
      const area = ctx.area || (ctx.location ? (await getGeo().reverse(ctx.location)).label : null);
      return { hour, minute: minutes % 60, daypart: daypartFor(hour), late: hour >= 21 || hour < 5, area, hasLocation: Boolean(ctx.location) };
    })();
    return context;
  };
  return {
    getContext,
    listSavedPlaces: () => listPlaces(sql, user.id),
    async findNearby(kinds?: string[]) {
      if (!ctx.location) return [];
      return (await getGeo().nearby(ctx.location, 1500, kinds)).slice(0, 5);
    },
    async proposeTrip(dest: { name: string; lat: number; lon: number }) {
      const [contacts, route] = await Promise.all([shareTargets(sql, user.id), ctx.location ? getGeo().walk(ctx.location, dest) : Promise.resolve(null)]);
      // After dark, lighting along the way is worth knowing (only for real street routes).
      const { hour } = await getContext();
      const lighting = route && !route.approximate && (hour >= 18 || hour < 6) ? await lightingForRoute(sql, route.geometry).catch(() => null) : null;
      return { destination: dest, minutes: route?.minutes ?? null, contacts: contacts.map((c) => c.name), lighting: lighting?.summary ?? null };
    },
    tripStatus: () => currentTrip(sql, user.id, new Date()),
    async trustedContacts() {
      return (await shareTargets(sql, user.id)).map((c) => c.name);
    },
  };
}

export type MiraTools = ReturnType<typeof miraTools>;
