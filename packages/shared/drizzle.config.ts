import { defineConfig } from "drizzle-kit";

// Generates plain SQL into supabase/migrations with Supabase-style timestamp prefixes;
// apply with `supabase db reset` (local) or `supabase db push` (cloud).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "../../supabase/migrations",
  migrations: { prefix: "supabase" },
});
