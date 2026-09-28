import { schema } from "@lifelog/shared/db";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Db = PostgresJsDatabase<typeof schema>;

// Reuse one client per server instance (and across dev hot reloads).
const globalForDb = globalThis as unknown as { lifelogDb?: Db; lifelogSql?: postgres.Sql };

export function getDb(): Db {
  if (!globalForDb.lifelogDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // DATABASE_URL is the Supabase pooler in session mode (5432); the transaction pooler (6543)
    // stalled the dashboard's parallel queries until statement_timeout. In session mode every open
    // connection holds one pooler slot across all Vercel instances, so keep two per instance and
    // close them quickly (a suspended instance can't run its idle timer).
    const client = postgres(url, { prepare: false, max: 2, idle_timeout: 5, max_lifetime: 60 });
    globalForDb.lifelogSql = client;
    globalForDb.lifelogDb = drizzle(client, { schema });
  }
  return globalForDb.lifelogDb;
}

/** Closes the shared connection pool (tests and scripts). */
export async function closeDb(): Promise<void> {
  await globalForDb.lifelogSql?.end();
  globalForDb.lifelogSql = undefined;
  globalForDb.lifelogDb = undefined;
}
