import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "@/server/config/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Sql = postgres.Sql;

interface DbHandle {
  sql: Sql;
  db: Db;
  url: string;
  ormClient: Sql;
}

// Survive Next.js dev hot reloads without leaking connection pools.
const globalForDb = globalThis as unknown as { __miraDb?: DbHandle };

function createClient(url: string, max: number, statementTimeoutMs?: number): Sql {
  return postgres(url, {
    max,
    // The worker caps every statement so a hung query can't wedge the missed-arrival job forever.
    ...(statementTimeoutMs ? { connection: { statement_timeout: statementTimeoutMs } } : {}),
    idle_timeout: 30,
    connect_timeout: 10,
    // Never log query parameters: they may contain encrypted payloads or hashes.
    debug: false,
    onnotice: () => {},
    types: {
      // Return int8 (OSM ids, counts) as JS numbers; OSM ids fit well within 2^53.
      int8: {
        to: 20,
        from: [20],
        serialize: (x: number | bigint | string) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  });
}

/**
 * Raw SQL (PostGIS, locking, transactions) and Drizzle use separate clients: the
 * Drizzle postgres-js driver replaces the client's date serializers with identity
 * functions, which would break Date parameters in raw tagged-template queries.
 */
export function createDbHandle(url: string, max = 10, opts: { statementTimeoutMs?: number } = {}): DbHandle {
  const sql = createClient(url, max, opts.statementTimeoutMs);
  const ormClient = createClient(url, Math.max(2, Math.floor(max / 2)), opts.statementTimeoutMs);
  return { sql, db: drizzle(ormClient, { schema }), url, ormClient };
}

function handle(): DbHandle {
  const url = getEnv().DATABASE_URL;
  if (!globalForDb.__miraDb || globalForDb.__miraDb.url !== url) {
    globalForDb.__miraDb = createDbHandle(url);
  }
  return globalForDb.__miraDb;
}

export function getDb(): Db {
  return handle().db;
}

export function getSql(): Sql {
  return handle().sql;
}

export async function closeDb(): Promise<void> {
  const h = globalForDb.__miraDb;
  globalForDb.__miraDb = undefined;
  if (h) await Promise.all([h.sql.end({ timeout: 5 }), h.ormClient.end({ timeout: 5 })]);
}
