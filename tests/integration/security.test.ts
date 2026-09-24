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
import { GET as pilotGET } from "@/app/api/pilot/route";
import { GET as placesGET } from "@/app/api/places/route";
import { POST as knowPOST } from "@/app/api/know/route";
import { GET as liveGET } from "@/app/api/health/live/route";
import { GET as readyGET } from "@/app/api/health/ready/route";
import { POST as reportPOST } from "@/app/api/reports/route";
import { GET as currentGET } from "@/app/api/journeys/current/route";
import { POST as journeysPOST } from "@/app/api/journeys/route";
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
  "available", "name", "bounds", "south", "north", "west", "east", "timezone", "source", "licence", "attribution", "copyrightUrl", "snapshotDate",
  "tiles", "url", "places", "id", "kind", "placeType", "point", "lat", "lon", "coverage", "time", "context", "band", "label", "place", "facts",
  "value", "note", "nearby", "community", "selectedBand", "matching", "otherBands", "statement", "polarity", "category", "text", "timeBand",
  "releasedWeek", "expiresAt", "unknowns", "origin", "destination", "routes", "lengthM", "minutes", "geometry", "steps", "comparison",
  "routeUnavailable", "reason", "message", "status", "checks", "database", "worker", "workerHeartbeatAgeSeconds", "pilotMapData",
  "contactEmail", "contactAlertProblems24h", "received", "error", "code", "fields",
]);

describe("privacy red-line audit", () => {
  let placeId = "";
  beforeAll(async () => {
    await loadFixturePilot(getSql());
    placeId = await fixturePlaceId(getSql(), "Fixture Pharmacy");
    await getSql()`DELETE FROM abuse_counters`;
  });

  it("public KNOW code never touches private tables", () => {
    const publicFiles = [...files("src/server/know"), ...files("src/app/api/pilot"), ...files("src/app/api/places"), ...files("src/app/api/know"), ...files("src/server/pilot")];
    for (const f of publicFiles) expect(readFileSync(f, "utf8"), f).not.toMatch(PRIVATE_TABLES);
    // The only public community source is aggregate_releases.
    expect(readFileSync("src/server/know/community.ts", "utf8")).toMatch(/FROM aggregate_releases/);
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

  it("stores no movement history: no coordinates on private tables", async () => {
    const cols = await getSql()<{ table_name: string; column_name: string; udt_name: string }[]>`
      SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public'`;
    const spatial = cols.filter((c) => c.udt_name === "geometry" || c.udt_name === "geography").map((c) => c.table_name);
    expect([...new Set(spatial)].sort()).toEqual(["pilot_areas", "places", "walk_edges", "walk_nodes"]);
    const privateCols = cols.filter((c) => ["journeys", "contact_invites", "reports_private", "report_structured"].includes(c.table_name)).map((c) => c.column_name);
    for (const c of privateCols) expect(c).not.toMatch(/lat|lon|point|origin|track|location|coord/);
    const tables = [...new Set(cols.map((c) => c.table_name))];
    expect(tables.some((t) => /history|track|location|movement/.test(t))).toBe(false);
  });

  it("every public response uses only allowlisted keys", async () => {
    await recordHeartbeat(getSql(), "audit-worker", new Date(), "test", new Date());
    switchJar(newJar());
    const bodies: unknown[] = [];
    bodies.push(await (await pilotGET()).json());
    bodies.push(await (await placesGET(getRequest("/api/places?q=fixture"))).json());
    bodies.push(await (await knowPOST(jsonRequest("/api/know", { mode: "place", placeId, time: "late" }))).json());
    const other = await fixturePlaceId(getSql(), "Fixture Metro Gate 1");
    bodies.push(await (await knowPOST(jsonRequest("/api/know", { mode: "route", origin: { placeId: other }, destination: { placeId }, time: "now" }))).json());
    bodies.push(await (await knowPOST(jsonRequest("/api/know", { mode: "route", origin: { lat: 28.7, lon: 77.222 }, destination: { placeId } }))).json());
    bodies.push(await (await liveGET()).json());
    bodies.push(await (await readyGET()).json());
    bodies.push(await (await reportPOST(jsonRequest("/api/reports", { idempotencyKey: randomUUID(), involvement: "witnessed", category: "environment", placeId, recency: "today", timeBand: "late", narrative: "call 9876543210" }))).json());
    bodies.push(await (await knowPOST(jsonRequest("/api/know", { mode: "place", placeId: "bad" }))).json());
    for (const b of bodies) {
      for (const k of allKeys(b)) expect(PUBLIC_KEYS.has(k), `unexpected public key "${k}"`).toBe(true);
      expect(JSON.stringify(b)).not.toMatch(/9876543210|actor|token|@example|encrypted/i);
    }
  });

  it("owner journey responses never contain the contact address or tokens", async () => {
    await recordHeartbeat(getSql(), "audit-worker", new Date(), "test", new Date());
    switchJar(newJar());
    await getSql()`DELETE FROM journeys`;
    const res = await journeysPOST(jsonRequest("/api/journeys", { idempotencyKey: randomUUID(), destination: { label: "Room 12" }, etaAt: new Date(Date.now() + 30 * MINUTE).toISOString() }));
    expect(res.status).toBe(201);
    const current = JSON.stringify(await (await currentGET()).json());
    expect(current).not.toMatch(/token|@|encrypted|owner|actor/i);
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
