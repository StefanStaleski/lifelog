import { schema } from "@lifelog/shared/db";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type Db = NodePgDatabase<typeof schema>;

// Reuse one pool per server instance (and across dev hot reloads).
const globalForDb = globalThis as unknown as { lifelogDb?: Db; lifelogPool?: Pool };

export function getDb(): Db {
  if (!globalForDb.lifelogDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // DATABASE_URL is the Supabase pooler in session mode (5432); the transaction pooler (6543)
    // stalled the dashboard's parallel queries until statement_timeout. In session mode every open
    // connection holds one of 15 pooler slots across all Vercel instances. A suspended instance
    // can't run its idle timer, so its connections used to hold slots for minutes until the pool
    // ran out; attachDatabasePool keeps the instance alive until idle connections are closed.
    const pool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 5_000,
      maxLifetimeSeconds: 60,
    });
    attachDatabasePool(pool);
    globalForDb.lifelogPool = pool;
    globalForDb.lifelogDb = drizzle(pool, { schema });
  }
  return globalForDb.lifelogDb;
}

/** Closes the shared connection pool (tests and scripts). */
export async function closeDb(): Promise<void> {
  await globalForDb.lifelogPool?.end();
  globalForDb.lifelogPool = undefined;
  globalForDb.lifelogDb = undefined;
}
