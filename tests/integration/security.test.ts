import { chosenRecipientIds } from "../helpers/recipient-choice";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock);

import { getSql } from "@/server/db/client";
import { decryptText } from "@/server/crypto";
import { fixedClock, MINUTE } from "@/server/clock";
import { createJourney, revokeContact } from "@/server/journey/service";
import { acceptInvite } from "@/server/journey/invites";
import { hashToken } from "@/server/crypto";
import type { Mailer } from "@/server/mail";
import { POST as searchPOST } from "@/app/api/geo/search/route";
import { POST as reversePOST } from "@/app/api/geo/reverse/route";
import { POST as routePOST } from "@/app/api/geo/route/route";
import { POST as nearbyPOST } from "@/app/api/geo/nearby/route";
import { POST as helpPOST } from "@/app/api/geo/help/route";
import { POST as safetyPOST } from "@/app/api/safety-updates/route";
import { resetEnvCache } from "@/server/config/env";
import { GET as liveGET } from "@/app/api/health/live/route";
import { GET as readyGET } from "@/app/api/health/ready/route";
import { POST as reportPOST } from "@/app/api/reports/route";
import { POST as demoPOST } from "@/app/api/auth/demo/route";
import { POST as tripsPOST } from "@/app/api/trips/route";
import { GET as currentTripGET } from "@/app/api/trips/current/route";
import { GET as sharedGET } from "@/app/api/t/[token]/route";
import { GET as meGET } from "@/app/api/me/route";
import { recordHeartbeat } from "@/server/health/worker";
import { newJar, switchJar } from "../helpers/cookie-jar";
import { getRequest, jsonRequest, allKeys } from "../helpers/http";
import { loadFixturePilot, fixturePlaceId } from "../helpers/pilot";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const PRIVATE_TABLES = /\b(reports_private|report_structured|journeys|contact_invites|actor_sessions|admin_sessions|admin_audit|aggregate_contributions|abuse_counters)\b/;

/** Every key a public (non-owner, non-admin) response may contain. */
const PUBLIC_KEYS = new Set([
  "places", "id", "name", "kind", "lat", "lon", "distanceM", "hours", "label", "precise", "route", "meters", "minutes", "geometry",
  "approximate", "along", "notes", "text", "polarity", "timeBand", "week", "status", "checks", "database", "worker",
  "workerHeartbeatAgeSeconds", "pilotMapData", "contactEmail", "contactAlertProblems24h", "received", "error", "code", "message", "fields",
  "state", "destination", "dest", "etaAt", "location", "at", "ageSeconds", "alertsViewer",
  // Street lighting along a route: statuses and shares only (no voters, no counts per person).
  "lighting", "segments", "coords", "summary", "sources", "lit", "dark", "poles", "unknown", "walkers", "osm", "confirmed",
  // Help Points and route options: places and routes only (class, hours as listed, source, position along the route).
  "helpPoints", "cls", "open24h", "source", "hoursSource", "openNow", "checkedAt", "alongM", "alternatives", "schedule", "day", "from", "to", "freshness", "osmFrom", "osmTo", "polesTo",
  // Country Context: the country's cited emergency numbers and helplines (no place, no person).
  "country", "iso", "countryName", "region", "emergency", "primary", "also", "services", "service", "url", "title", "number", "helplines", "timezone", "scope", "qualification",
  // Per-source availability accompanies public map evidence; it carries no private identifiers.
  "helpEvidence", "lightingEvidence", "evidence", "data", "retryable",
  // The live view: how they're travelling and whether they asked to be checked on (no location history).
  "mode", "checkRequested",
  // The traveller's IANA time zone, so the viewer shows the ETA in her local time, labelled (no place, no person).
  "tz",
  // Country Context verification and coverage: statements about a country's data (no place, no person).
  "classification", "reviewed", "limitations", "regionOverride", "covers", "coverage", "verification",
  // The country's international calling code ("+91"), to complete a number she types for a WhatsApp contact (no person).
  "callingCode",
  "capabilities", "routes", "safetyUpdates", "communitySignals",
  // Safety updates: published headlines with their publisher, link, age and city-level place (no person, no coordinates).
  "area", "precision", "countryIso", "windowDays", "updates", "translatedTitle", "category", "reporting", "reportedLocation",
  "locationPrecision", "publishedAt", "eventYear", "publisher", "originalUrl", "sourceType", "sourceCount", "sensitive",
  "retrievedAt", "counts", "official", "news", "community",
]);

describe("privacy red-line audit", () => {
  let placeId = "";
  beforeAll(async () => {
    await loadFixturePilot(getSql());
    placeId = await fixturePlaceId(getSql(), "Fixture Pharmacy");
    await getSql()`DELETE FROM abuse_counters`;
  });

  it("public map/geo code never touches private tables", () => {
    const publicFiles = [...files("src/server/know"), ...files("src/server/providers/geo"), ...files("src/app/api/geo"), ...files("src/server/pilot"), ...files("src/server/help-points"), ...files("src/server/safety-intel"), ...files("src/app/api/safety-updates"), "src/server/notes/index.ts"];
    for (const f of publicFiles) expect(readFileSync(f, "utf8"), f).not.toMatch(PRIVATE_TABLES);
    // The only public community source is aggregate_releases.
    expect(readFileSync("src/server/notes/index.ts", "utf8")).toMatch(/FROM aggregate_releases/);
  });

  it("application code never imports test fixtures", () => {
    for (const f of files("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/from ["'][./]*tests\//);
  });

  it("client components import no server modules (except erased types)", () => {
    for (const f of files("src")) {
      const src = readFileSync(f, "utf8");
      if (!src.startsWith('"use client"')) continue;
      const imports = [...src.matchAll(/^import (type )?[^;]*from ["']([^"']+)["']/gm)];
      for (const m of imports) {
        if (m[2].startsWith("@/server/") || m[2] === "postgres" || m[2] === "nodemailer") expect(m[1], `${f} imports ${m[2]}`).toBe("type ");
      }
    }
  });

  it("keeps coordinates only where users chose them, never in reports, and no movement history", async () => {
    const cols = await getSql()<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
    const coordTables = [...new Set(cols.filter((c) => /(^|_)(lat|lon|point|geom|polygon)$/.test(c.column_name)).map((c) => c.table_name))].sort();
    // Map data, user-chosen saved places, trip destinations, and short-lived live trip points.
    expect(coordTables).toEqual(["journeys", "pilot_areas", "places", "saved_places", "trip_locations", "walk_edges", "walk_nodes"]);
    for (const t of ["reports_private", "report_structured", "aggregate_releases", "contacts", "mira_messages"]) {
      const c = cols.filter((x) => x.table_name === t).map((x) => x.column_name);
      for (const name of c) expect(name, `${t}.${name}`).not.toMatch(/^(lat|lon|point|origin|track|location)$/);
    }
    const tables = [...new Set(cols.map((c) => c.table_name))];
    expect(tables.some((t) => /history|track|movement/.test(t))).toBe(false);
    // Live points are hard-deleted with their trip.
    const [fk] = await getSql()`SELECT confdeltype FROM pg_constraint WHERE conrelid = 'trip_locations'::regclass AND contype = 'f'`;
    expect(fk.confdeltype).toBe("c");
  });

  it("every public response uses only allowlisted keys", async () => {
    await recordHeartbeat(getSql(), "audit-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
    switchJar(newJar());
    const from = { lat: 28.6927, lon: 77.2131 };
    const to = { lat: 28.6901, lon: 77.2111 };
    const bodies: unknown[] = [];
    bodies.push(await (await searchPOST(jsonRequest("/api/geo/search", { q: "fixture", near: { lat: 28.69, lon: 77.21 } }))).json());
    bodies.push(await (await reversePOST(jsonRequest("/api/geo/reverse", from))).json());
    bodies.push(await (await routePOST(jsonRequest("/api/geo/route", { from, to }))).json());
    bodies.push(await (await nearbyPOST(jsonRequest("/api/geo/nearby", from))).json());
    bodies.push(await (await helpPOST(jsonRequest("/api/geo/help", from))).json());
    const off = await (await safetyPOST(jsonRequest("/api/safety-updates", from))).json();
    expect(off).toMatchObject({ area: null, evidence: { state: "unavailable" } }); // switched off: no geocoding, no news lookup
    bodies.push(off);
    process.env.SAFETY_UPDATES = "fixture";
    resetEnvCache();
    const safety = await (await safetyPOST(jsonRequest("/api/safety-updates", from))).json();
    process.env.SAFETY_UPDATES = "off";
    resetEnvCache();
    expect(safety.area).toMatchObject({ name: "Delhi", precision: "city", countryIso: "IN" });
    expect(safety.evidence.state).toBe("ready");
    expect(JSON.stringify(safety)).not.toMatch(/28\.69|77\.21/); // the point she sent never comes back
    const [cached] = await getSql()<{ n: number }[]>`SELECT count(*)::int AS n FROM safety_intel_cache WHERE payload::text ~ '28\.69|77\.21'`;
    expect(cached.n).toBe(0); // nor is it stored
    bodies.push(safety);
    bodies.push(await (await liveGET()).json());
    bodies.push(await (await readyGET()).json());
    bodies.push(await (await reportPOST(jsonRequest("/api/reports", { idempotencyKey: randomUUID(), involvement: "witnessed", category: "environment", placeId, recency: "today", timeBand: "late", narrative: "call 9876543210" }))).json());
    bodies.push(await (await routePOST(jsonRequest("/api/geo/route", { from: "bad" }))).json());
    // The contact's live view of a shared trip.
    await demoPOST(jsonRequest("/api/auth/demo", { name: "Audit User" }));
    const { trip } = await (await tripsPOST(jsonRequest("/api/trips", { from, to: { ...to, name: "Home" }, recipientIds: await chosenRecipientIds() }))).json();
    const token = trip.shareUrl.split("/t/")[1];
    switchJar(newJar());
    bodies.push(await (await sharedGET(getRequest(`/api/t/${token}`), { params: Promise.resolve({ token }) })).json());
    for (const b of bodies) {
      for (const k of allKeys(b)) expect(PUBLIC_KEYS.has(k), `unexpected public key "${k}"`).toBe(true);
      expect(JSON.stringify(b)).not.toMatch(/9876543210|actor|token|@example|encrypted|Audit User/i);
    }
  });

  it("owner-only data never leaks contact addresses or tokens, and needs the session", async () => {
    await recordHeartbeat(getSql(), "audit-worker", new Date(), "test", new Date());
    await recordHeartbeat(getSql(), "job:journeys", new Date(), "test", new Date());
    switchJar(newJar());
    expect((await (await currentTripGET()).json()).trip).toBeNull();
    expect((await (await meGET()).json()).user).toBeNull();
    await demoPOST(jsonRequest("/api/auth/demo", { name: "Owner" }));
    const me = JSON.stringify(await (await meGET()).json());
    expect(me).not.toMatch(/token|encrypted|hash/i);
  });

  it("stores malicious strings verbatim and inert (parameterised SQL, encrypted, escaped on render)", async () => {
    switchJar(newJar());
    await getSql()`DELETE FROM reports_private`;
    await getSql()`DELETE FROM abuse_counters`;
    const evil = `<script>alert(1)</script>'); DROP TABLE reports_private; -- ‮`;
    const res = await reportPOST(jsonRequest("/api/reports", { idempotencyKey: randomUUID(), involvement: "witnessed", category: "other", placeId, recency: "today", timeBand: "unsure", narrative: evil }));
    expect(res.status).toBe(201);
    const [row] = await getSql()`SELECT encrypted_text FROM reports_private ORDER BY created_at DESC, id DESC LIMIT 1`;
    const stored = decryptText(row.encrypted_text, "report_text");
    expect(stored).toContain("<script>alert(1)</script>'); DROP TABLE reports_private;");
    expect(stored).not.toContain("‮"); // bidi override stripped
    const [{ n }] = await getSql()`SELECT count(*)::int AS n FROM reports_private`;
    expect(n).toBeGreaterThan(0);
    // React escapes text; no component renders user text as HTML.
    for (const f of files("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("rejects replayed and revoked invite tokens and forged tokens", async () => {
    const mailer: Mailer = { send: async () => ({ ok: true }) };
    const clock = fixedClock(new Date());
    await getSql()`DELETE FROM journeys`;
    const j = await createJourney({ sql: getSql(), clock, mailer, workerHealthy: true }, "sec-owner", {
      idempotencyKey: randomUUID(),
      destination: { placeId },
      etaAt: new Date(clock.now().getTime() + 30 * MINUTE).toISOString(),
      contactEmail: "c@example.test",
    });
    // Recover the token only via its hash (tests can't read the email here): forge a new known token.
    const token = "known-test-token-abcdefghijklmnopqrstuvwxyz";
    await getSql()`UPDATE contact_invites SET token_hash = ${hashToken("invite", token)} WHERE journey_id = ${j.id}`;
    await expect(acceptInvite(getSql(), "not-a-real-token-abcdefghijklmnop", clock.now())).rejects.toMatchObject({ status: 410 });
    await revokeContact(getSql(), "sec-owner", j.id, clock);
    await expect(acceptInvite(getSql(), token, clock.now())).rejects.toMatchObject({ code: "invite_revoked" });
  });
});
