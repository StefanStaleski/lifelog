# Lifelog

Personal, single-user life tracker. A sideloaded Android app (Galaxy S24) passively collects daily-life data into Room, syncs it to Supabase Postgres through an ingest API on Vercel, and a Next.js app serves the dashboard and a read-only MCP server for Claude agents. Full spec: `docs/SPEC.md`. Read it before starting a phase.

## Repo layout

```
apps/android/      Kotlin app: Compose, Room, WorkManager, Hilt
  app/             UI: onboarding/permissions, check-in, status screen
  core/data/       Room DB (pending_events) + DAOs
  core/network/    HTTP client, gzip JSON batches, device token auth
  collectors/      One class per data source (Collector interface)
  sync/            WorkManager: poll collectors every 30 min, upload batches of 500
apps/web/          Next.js (App Router) on Vercel: /api/v1 routes, dashboard, MCP route
packages/shared/   TypeScript shared by web code: event types, zod schemas, Drizzle schema
supabase/          migrations, pg_cron SQL, Edge Functions (weather, calendar)
docs/SPEC.md       Source of truth for scope and design
```

The phone only talks to the ingest API. The dashboard and MCP server only read Postgres.

## Commands

Tooling: pnpm workspaces (Node 22, version pinned via `packageManager`; `corepack enable` provides `pnpm`), Gradle wrapper, Supabase CLI, Vercel CLI. Update this section when the scripts change.

```bash
# JS/TS (from repo root; these are what CI runs)
pnpm install
pnpm lint                             # eslint + prettier --check
pnpm typecheck
pnpm test
pnpm build
pnpm --filter web dev                 # local dashboard + API on :3000

# Database
supabase start                        # local stack (needed by ingest integration tests)
pnpm --filter shared db:generate      # drizzle-kit: generate SQL migration into supabase/migrations
supabase db reset                     # re-apply all migrations locally

# Android (from apps/android; JDK 17; CI runs `test assembleDebug`)
./gradlew test assembleDebug          # JVM unit tests + debug APK
./gradlew installDebug                # to the S24 over USB
adb reverse tcp:3000 tcp:3000         # phone reaches local `pnpm --filter web dev` at localhost:3000
adb logcat -s Lifelog                 # app log tag
```

Android setup: AGP 9 with built-in Kotlin (don't apply `org.jetbrains.kotlin.android`), versions in `apps/android/gradle/libs.versions.toml`, compileSdk 37 / targetSdk 36 / minSdk 30, package `io.github.stefanstaleski.lifelog`. Per-machine values go in git-ignored `apps/android/local.properties`: `lifelog.apiBaseUrl` (default `http://localhost:3000/`) and `lifelog.deviceToken`, exposed as `BuildConfig.API_BASE_URL` / `DEVICE_TOKEN`. Cleartext HTTP is allowed only to localhost.

## Conventions

- **Timestamps are UTC** everywhere (device, API, DB: `timestamptz`). Only `daily_summary.date` (and other `date` columns) is a local date in `Europe/Skopje`.
- **Event ids are UUIDs generated on the device** at capture time. Ingest uses `ON CONFLICT (id) DO NOTHING`, so re-sending a batch is always safe. Never generate event ids server-side.
- **Local-first:** every event is written to Room before any network call.
- **No raw content stored:** no message bodies, no notification text, no call/SMS content, no raw GPS trace. Store counts, derived visits, salted hashes of phone numbers, and a hash of bank message text (for de-dup), never the text itself.
- **Wire contract** lives in `packages/shared/src/events.ts` (zod) with examples in `packages/shared/fixtures/events/{valid,invalid}`. Any change to an event type updates the schema, the fixtures and the Kotlin models in the same PR; both test suites run against the fixtures.
- `events` is append-only; typed tables and `daily_summary` are derived and can be rebuilt from it.
- RLS enabled on every table with no public policies. Only server code uses the service role key, which lives in Vercel env vars / git-ignored `.env.local`, never in the app or browser.
- API payloads and MCP outputs put units in field names (`screen_time_min`, `distance_m`, `spend_mkd`).
- Tests with every change: parser unit tests from anonymised fixtures (never commit real bank samples), ingest integration tests against local Supabase.
- One task per branch and PR. Android changes are verified on the physical phone before merge.
- After each phase, update `docs/SPEC.md` and this file with what changed.
