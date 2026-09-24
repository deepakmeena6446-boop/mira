/**
 * Drizzle table definitions mirroring the reviewed SQL migrations in db/migrations.
 * Migrations are the source of truth; spatial columns are typed loosely here and
 * queried with explicit PostGIS SQL.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  doublePrecision,
  timestamp,
  jsonb,
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";

const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const pilotAreas = pgTable("pilot_areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  polygon: geometry("polygon").notNull(),
  sourceDate: ts("source_date").notNull(),
  manifestHash: text("manifest_hash").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceLicence: text("source_licence").notNull(),
  importerVersion: text("importer_version").notNull(),
  placeCount: integer("place_count").notNull().default(0),
  nodeCount: integer("node_count").notNull().default(0),
  edgeCount: integer("edge_count").notNull().default(0),
  status: text("status").$type<"importing" | "ready" | "failed">().notNull(),
  importedAt: ts("imported_at").notNull().defaultNow(),
});

export const places = pgTable("places", {
  id: uuid("id").primaryKey().defaultRandom(),
  pilotId: uuid("pilot_id").notNull(),
  osmType: text("osm_type").$type<"node" | "way">().notNull(),
  osmId: bigint("osm_id", { mode: "number" }).notNull(),
  name: text("name"),
  nameHi: text("name_hi"),
  placeType: text("place_type").notNull(),
  point: geometry("point").notNull(),
  tags: jsonb("tags").$type<Record<string, string>>().notNull(),
  searchText: text("search_text").notNull(),
  sourceDate: ts("source_date").notNull(),
});

export const walkNodes = pgTable("walk_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  pilotId: uuid("pilot_id").notNull(),
  osmNodeId: bigint("osm_node_id", { mode: "number" }).notNull().unique(),
  point: geometry("point").notNull(),
  component: integer("component").notNull(),
});

export const walkEdges = pgTable("walk_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  pilotId: uuid("pilot_id").notNull(),
  fromNode: bigint("from_node", { mode: "number" }).notNull(),
  toNode: bigint("to_node", { mode: "number" }).notNull(),
  geom: geometry("geom").notNull(),
  lengthM: doublePrecision("length_m").notNull(),
  sourceWayId: bigint("source_way_id", { mode: "number" }).notNull(),
  tags: jsonb("tags").$type<Record<string, string>>().notNull(),
});

export const actorSessions = pgTable("actor_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
});

export const abuseCounters = pgTable(
  "abuse_counters",
  {
    keyHmac: text("key_hmac").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.keyHmac, t.bucket, t.windowStart] })],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text("worker_id").primaryKey(),
  startedAt: ts("started_at").notNull(),
  lastBeatAt: ts("last_beat_at").notNull(),
  version: text("version").notNull(),
});
