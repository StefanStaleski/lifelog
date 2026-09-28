# Lifelog

Personal, single-user life tracker. A sideloaded Android app (Galaxy S24) passively collects daily-life data into Room, syncs it to Supabase Postgres through an ingest API on Vercel, and a Next.js app serves the dashboard and a read-only MCP server for Claude agents. Full spec: `docs/SPEC.md`. Read it before starting a phase.

## Repo layout

```
apps/android/      Kotlin app: Compose, Room, WorkManager, Hilt
  app/             UI: onboarding, status screen, check-in (+ 21:30 reminder, boot receiver)
  core/data/       Room (pending_events), EventWriter, payload models, LifelogSettings (DataStore)
  core/network/    HTTP client, gzip JSON batches, device token auth
  collectors/      One PolledCollector per source (Hilt set): usage/ (screen time, unlocks, screen),
                   health/ (Health Connect steps), activity/ (transitions), places/ (geofences, stays),
                   notifications/ (listener + hourly counts)
  sync/            CollectRunner + heartbeat, Uploader (batches of 500), WorkManager jobs every 30 min
apps/web/          Next.js 16 on Vercel: /api/v1 routes, dashboard (app/(dashboard): Today, Trends, Time),
                   proxy.ts (session refresh), lib/ (metrics registry, ingest, sleep via SQL), vercel.json (cron)
packages/shared/   Wire contract (zod: events.ts, api.ts) + fixtures/, Drizzle schema (src/db)
supabase/          migrations (incl. process_events SQL), pgTAP tests; later pg_cron + Edge Functions
scripts/           smoke.sh, setup-supabase.sh, gate.mjs
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
pnpm test                             # web tests need the local DB: run `pnpm db:start` first
pnpm build
pnpm --filter web dev                 # local dashboard + API on :3000
pnpm --filter web seed                # ~60 days of fake phone data into the LOCAL db (refuses anything else)
DASHBOARD_DEV_AUTH_BYPASS=1 pnpm --filter web dev   # dashboard without signing in (local dev only)

# Database (Supabase CLI is a dev dependency: `pnpm exec supabase …`)
pnpm db:start                         # local Postgres only, on port 55322 (ports are 553xx to avoid other local stacks)
pnpm db:generate                      # drizzle-kit: schema.ts → new SQL migration in supabase/migrations
pnpm db:reset                         # re-apply all migrations + seed.sql locally
pnpm db:test                          # pgTAP tests in supabase/tests (RLS / no public access)

# Android (from apps/android; JDK 17; CI runs `test assembleDebug lintDebug`)
./gradlew test assembleDebug          # JVM unit tests + debug APK
./gradlew installDebug                # to the S24 over USB
adb reverse tcp:3000 tcp:3000         # phone reaches local `pnpm --filter web dev` at localhost:3000
adb logcat -s Lifelog                 # app log tag
./gradlew :app:testDebugUnitTest -Plifelog.screenshots   # render screens to app/build/screenshots/*.png (Roborazzi)
```

Android setup: AGP 9 with built-in Kotlin (don't apply `org.jetbrains.kotlin.android`), versions in `apps/android/gradle/libs.versions.toml`, compileSdk 37 / targetSdk 36 / minSdk 30, package `io.github.stefanstaleski.lifelog`. Per-machine values go in git-ignored `apps/android/local.properties`: `lifelog.apiBaseUrl` (default `http://localhost:3000/`) and `lifelog.deviceToken`, exposed as `BuildConfig.API_BASE_URL` / `DEVICE_TOKEN`. Cleartext HTTP is allowed only to localhost. The local copy on this machine points at production.

## Deploy

- Vercel project `staleski-dev/lifelog` (root directory `apps/web`), production URL https://stefanslifelog.vercel.app (the old https://lifelog-opal-two.vercel.app redirects there). Repo root is linked (`.vercel/`, git-ignored). Deploy with `vercel deploy --prod --archive=tgz --scope staleski-dev` until the GitHub integration is connected (`.vercelignore` keeps the upload to the web app; the free tier allows 5000 file uploads a day).
- Env vars on Vercel (production): `DEVICE_TOKEN`, `DATABASE_URL` (Supabase transaction pooler, port 6543). Local copies plus `SUPABASE_DB_PASSWORD` live in git-ignored `apps/web/.env.local`.
- Supabase org "Lifelog". `scripts/setup-supabase.sh` creates/links the cloud project, runs `db push`, sets `DATABASE_URL` on Vercel, redeploys and smoke-tests. Schema changes later: `pnpm exec supabase db push`.
- `scripts/smoke.sh [base-url]` checks a deployment end to end (safe to re-run).
- `pnpm gate [base-url] [days]` prints the phase-gate report (`GET /api/v1/gate`): no heartbeat silence over 4 h, screen time or unlocks on every finished day; exit 0 when passed.

## Conventions

- **Timestamps are UTC** everywhere (device, API, DB: `timestamptz`). Only `daily_summary.date` (and other `date` columns) is a local date in `Europe/Skopje`.
- **Event ids are UUIDs generated on the device** at capture time. Ingest uses `ON CONFLICT (id) DO NOTHING`, so re-sending a batch is always safe. Never generate event ids server-side.
- **Local-first:** every event is written to Room before any network call.
- **No raw content stored:** no message bodies, no notification text, no call/SMS content, no raw GPS trace. Store counts, derived visits, salted hashes of phone numbers, and a hash of bank message text (for de-dup), never the text itself.
- **Wire contract** lives in `packages/shared/src/events.ts` and `api.ts` (zod) with examples in `packages/shared/fixtures/`. Any change to an event type updates the schema, the fixtures and the Kotlin models in the same PR; both test suites run against the fixtures.
- **Schema changes** go through `packages/shared/src/db/schema.ts` + `pnpm db:generate`; never edit a generated migration. Hand-written SQL (functions, grants, pg_cron) goes in `drizzle-kit generate --custom` migrations. CI fails if migrations drift from the schema.
- **Processing lives in SQL** (`process_events`, `refresh_daily_summary`, `compute_sleep` in `supabase/migrations`). Applied migrations can't change, so a new version of a function is a new migration that replaces it whole; derive it from the previous version with asserted edits.
- **Room schema changes** bump the version with an `AutoMigration` and a migration test (`core/data/.../MigrationTest.kt`); the phone keeps its database across updates.
- **Tests share the local database:** `pnpm test` truncates it, so run `pnpm --filter web seed` again before looking at the dashboard locally.
- `events` is append-only; typed tables and `daily_summary` are derived and can be rebuilt from it.
- RLS enabled on every table with no public policies. Only server code uses the service role key, which lives in Vercel env vars / git-ignored `.env.local`, never in the app or browser.
- API payloads and MCP outputs put units in field names (`screen_time_min`, `distance_m`, `spend_mkd`).
- Tests with every change: parser unit tests from anonymised fixtures (never commit real bank samples), ingest integration tests against local Supabase.
- One task per branch and PR. Android changes are verified on the physical phone before merge.
- After each phase, update `docs/SPEC.md` and this file with what changed.
