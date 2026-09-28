# Life Tracker: Android App Build Spec

Last updated: Sep 27, 2026 (Phases 1–3 built; see "Phase 1 as built" and "Phases 2–3 as built")

## Overview

Build a personal, single-user Android app for a Samsung Galaxy S24 (no wearable) that passively collects daily-life data, syncs it to Supabase, shows it on a web dashboard, and exposes it to Claude scheduled agents through an MCP server.

**Goals**

- Collect phone usage, activity, location visits, sleep estimate, notifications, calls/SMS metadata and spending with zero daily effort.
- Capture a 5-second evening check-in: mood, energy, focus (1–5), tags and an optional note.
- Show trends and correlations against the user's own baseline, not generic targets.
- Let Claude agents (morning brief, weekly review) query the data in plain language.

**Non-goals (v1)**

- No iOS, no Play Store release: the app is sideloaded, which avoids Play's restrictions on call log and SMS permissions.
- No multi-user support, no social features, no message or call content.
- No ML models; correlations are simple statistics computed in SQL or the backend.

**Principles**

- Local-first: every event is written to the on-device database before any network call.
- Store derived data, not raw streams: visits instead of GPS traces, counts instead of notification text.
- Visible health: the dashboard always shows when each source last reported data.

## Architecture

Three pieces, all on free tiers: a native Android collector, Supabase Postgres with scheduled jobs, and one Next.js app on Vercel that serves the ingest API, the web dashboard and a read-only MCP server for Claude agents.

```
Galaxy S24 app (Kotlin)            Supabase + Vercel                    Consumers
┌───────────────────────┐          ┌─────────────────────────────┐      ┌──────────────────────────┐
│ Collectors            │          │ Ingest API                  │      │ Web dashboard            │
│ (usage, health,       │          │ (Vercel route, token auth)  │      │ (Next.js on Vercel)      │
│  location, notifs,    │          └──────────────┬──────────────┘      └────────────▲─────────────┘
│  check-in)            │                         ▼                                  │
└──────────┬────────────┘          ┌─────────────────────────────┐                   │
           ▼                       │ Supabase Postgres           │───────────────────┤
┌───────────────────────┐          │ (events + daily rollups)    │                   │
│ Room database         │          └──────────────▲──────────────┘      ┌────────────┴─────────────┐
│ (local-first store)   │                         │                     │ MCP server               │
└──────────┬────────────┘          ┌──────────────┴──────────────┐      │ (Next.js route, read-only)│
           ▼                       │ Nightly jobs                │      └────────────▲─────────────┘
┌───────────────────────┐  HTTPS   │ (pg_cron + Edge Functions:  │                   │
│ Sync worker           │─────────▶│  rollups, weather, calendar)│      ┌────────────┴─────────────┐
│ (WorkManager, 30 min) │ to Ingest└─────────────────────────────┘      │ Claude agents            │
└───────────────────────┘                                               │ (morning brief, reviews) │
                                                                        └──────────────────────────┘
```

The phone never talks to the dashboard or Claude directly. Everything flows through Postgres, so each consumer can be rebuilt without touching the app.

## Tech stack

Native Kotlin on the phone, Supabase for data and scheduled jobs, and one Next.js app on Vercel for the dashboard, API and MCP server; everything runs on free tiers.

| Layer | Choice | Why |
| --- | --- | --- |
| Android app | Kotlin, Jetpack Compose, Room, WorkManager, Hilt | Every data source is a native Android API; a cross-platform layer only adds bridging |
| Health data | Health Connect client (androidx.health.connect) | Samsung Health syncs steps from the S24 into Health Connect |
| Activity and location | Google Play Services: Activity Recognition, Fused Location, Geofencing | Battery-friendly, handles Samsung's power management better than raw GPS |
| Database | Supabase Postgres (free tier, existing account) | JSONB for payloads, window functions for trends, built-in connection pooler |
| ORM / migrations | Drizzle ORM + drizzle-kit | Typed queries, plain SQL migrations Claude Code can read and write |
| Web app | Next.js (App Router) on Vercel Hobby | Dashboard pages, `/api/v1` route handlers and the MCP route in one deployment with a free HTTPS subdomain |
| Charts and UI | Recharts or ECharts, Tailwind | Simple to generate and style |
| MCP server | TypeScript MCP SDK via Vercel's MCP adapter for Next.js, Streamable HTTP | Runs as a route in the same app |
| Scheduled jobs | Supabase pg_cron + Edge Functions | Vercel Hobby cron runs rarely and with loose timing; this keeps jobs next to the data |
| Auth | Supabase Auth, one account | Dashboard login and OAuth provider for the MCP connector |
| Repo tooling | pnpm workspaces, GitHub Actions | CI builds the APK, runs tests and takes a weekly encrypted backup |

**Cost: €0** beyond the existing Claude Pro plan. No domain is needed: Vercel provides a `*.vercel.app` subdomain with HTTPS. Watch the Supabase free-tier database cap (raw events are pruned, see Data model) and check current Supabase and Vercel free-tier limits before launch.

## Data sources on the Galaxy S24

Ten sources, all available on a sideloaded Android app without a wearable. Heart rate and real sleep stages are out of scope until a wearable is added.

| Source | Android API | Permission | Captured | Frequency |
| --- | --- | --- | --- | --- |
| App usage and screen time | UsageStatsManager (queryEvents) | PACKAGE_USAGE_STATS (special access) | Foreground time per app per 30-min window, launches; unlocks from KEYGUARD_HIDDEN events | Every 30 min |
| Screen and charging events | BroadcastReceiver: SCREEN_ON/OFF, USER_PRESENT, POWER_CONNECTED/DISCONNECTED | None | Timestamps, used for sleep estimate | Live, while foreground service runs |
| Steps and distance | Health Connect (StepsRecord, DistanceRecord) | Health Connect read permissions | Steps and distance per hour | Every hour |
| Movement type | Activity Recognition Transition API | ACTIVITY_RECOGNITION | Walking, running, cycling, in vehicle, still | Live transitions |
| Place visits | Geofencing API + Fused Location (balanced power) | ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION | Arrival and departure at named places; unknown stays over 15 min | Live geofence events + a check every 15 min |
| Notifications | NotificationListenerService | Notification access (special access) | Count per app per hour; no text stored | Live |
| Spending | Same listener, filtered to your bank app; or SMS from the bank sender | Notification access or READ_SMS | Amount, currency, merchant, timestamp | Live |
| Calls | CallLog provider | READ_CALL_LOG | Direction, duration, hashed number, contact name | Every 30 min |
| SMS metadata | Telephony SMS provider | READ_SMS | Direction, hashed number, timestamp; no body except bank SMS | Every 30 min |
| Daily check-in | Own notification with action buttons + Compose screen | POST_NOTIFICATIONS | Mood, energy, focus (1–5), tags, optional note | Once, at 21:30 |

Weather (Open-Meteo, free, no key) and Google Calendar meeting load are pulled by the backend's nightly job, not the phone.

**Sleep estimate without a watch.** Sleep start = the last screen-off after 21:00 that is followed by at least 3 hours of no unlocks and a "still" activity state. Wake = the first unlock after that gap. Charging overnight raises confidence. Store the estimate with a confidence score and let the check-in correct it.

## Data model

One append-only `events` table receives everything from the phone; typed tables and a `daily_summary` table are derived from it by the backend. This keeps the app simple and lets you reprocess history when logic changes.

| Table | Key columns | Written by |
| --- | --- | --- |
| `events` | `id` (UUID from device), `type`, `occurred_at`, `ended_at`, `payload` JSONB, `device_id`, `received_at` | Ingest API |
| `app_usage` | `date`, `package`, `app_label`, `category`, `foreground_ms`, `launches` | Ingest processor |
| `unlocks` | `occurred_at` | Ingest processor |
| `activity_segments` | `started_at`, `ended_at`, `kind` (still, walking, vehicle…) | Ingest processor |
| `places` | `id`, `name`, `lat`, `lng`, `radius_m`, `kind` (home, work, gym, other) | Dashboard (you define them) |
| `visits` | `place_id`, `arrived_at`, `left_at` | Ingest processor |
| `steps_hourly` | `hour`, `steps`, `distance_m` | Ingest processor |
| `notifications_hourly` | `hour`, `package`, `count` | Ingest processor |
| `transactions` | `occurred_at`, `amount`, `currency`, `merchant`, `category`, `raw_hash` | Ingest processor |
| `calls` | `occurred_at`, `direction`, `duration_s`, `contact_hash`, `contact_name` | Ingest processor |
| `sleep_estimates` | `date`, `sleep_start`, `wake_at`, `duration_min`, `confidence`, `corrected` | Nightly job |
| `checkins` | `date`, `mood`, `energy`, `focus`, `tags` text[], `note` | Ingest processor |
| `context_daily` | `date`, `temp_max`, `precip_mm`, `meeting_count`, `meeting_minutes` | Nightly job |
| `daily_summary` | `date` + one column per headline metric (screen time, unlocks, steps, sleep, time at home/work, spend, mood…) | Nightly job |
| `source_health` | `source`, `last_event_at`, `last_error` | Ingest API |

Rules:

- Event ids are generated on the phone, so re-sending a batch is safe: the ingest uses `ON CONFLICT (id) DO NOTHING`.
- All timestamps are stored in UTC; `daily_summary.date` is the local date in Europe/Skopje.
- `daily_summary` is the table the dashboard and the MCP server read first; raw tables are for drill-downs.
- Retention: a weekly pg_cron job deletes processed rows from `events` older than 90 days; typed tables and `daily_summary` are kept, which keeps the database well under the free-tier cap.
- Row Level Security is enabled on every table with no public policies; only server code with the service role key reads or writes.

## Android app design

The app is a background collector with three small screens; almost all of its code is collectors, the local store and the sync worker.

**Modules**

- `:app` — Compose UI: onboarding and permissions, check-in screen, status screen (last event per source, pending upload count, battery settings shortcut).
- `:core:data` — Room database with one `pending_events` table (id, type, occurred_at, payload JSON, uploaded flag) and DAOs.
- `:core:network` — Retrofit or Ktor client, gzip JSON batches, device token in the `Authorization` header.
- `:collectors` — one class per source, each implementing `Collector { suspend fun collect(since: Instant): List<Event> }` or registering live listeners.
- `:sync` — WorkManager jobs: collect polled sources every 30 min, upload pending events in batches of 500, retry with exponential backoff.

**Services**

- `CollectorForegroundService` (type `dataSync` or `location`) keeps screen, charging and activity receivers alive, with a low-priority persistent notification.
- `LifeNotificationListener` (NotificationListenerService) counts notifications and parses bank messages.
- `GeofenceBroadcastReceiver` and `ActivityTransitionReceiver` write events straight into Room.
- `BootReceiver` restarts the service and re-registers geofences after a reboot.

**Samsung battery handling (do this in onboarding, not later)**

1. Request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and check `isIgnoringBatteryOptimizations`.
2. Deep-link to Settings → Battery → Background usage limits and ask to add the app to "Never sleeping apps".
3. Turn off "Put unused apps to sleep" for this app and disable "Remove permissions if app is unused".
4. Show a red banner on the status screen whenever any of these checks fail, and report it to `source_health`.

**Bank parsing**

Keep parsers as small, testable functions: `parse(text: String, sender: String): Transaction?`. Store a hash of the raw text for de-duplication, never the full text. Start with one regex per bank format you actually receive, and write unit tests from real (anonymised) samples.

## Backend and API

The API lives in the Next.js app on Vercel as route handlers under `/api/v1`: a write path for the phone and a read path for the dashboard. Scheduled work runs inside Supabase.

| Method | Path | Used by | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/events/batch` | Phone | Up to 500 events, gzip JSON; returns accepted and duplicate counts |
| ~~POST~~ | ~~`/v1/checkins`~~ | — | Not built: check-ins travel as `checkin` events in `/v1/events/batch` (local-first); the processor upserts by date |
| GET | `/v1/config` | Phone | Places (geofences), bank parser settings, collection intervals |
| GET | `/v1/summary?from&to` | Dashboard | Rows of `daily_summary` plus each metric's 30-day baseline |
| GET | `/v1/metrics/:name?from&to&bucket` | Dashboard | One metric as a series (day, week, month) |
| GET | `/v1/correlations?x&y&from&to` | Dashboard | Pearson r, sample size and the paired values |
| GET, POST, PATCH | `/v1/places` | Dashboard | Manage named places (PATCH can archive) |
| DELETE | `/v1/data?from&to&confirm=delete` | Dashboard | Kill switch: delete everything recorded on those local dates |
| GET | `/v1/jobs/daily` | Vercel Cron | Daily weather refresh (bearer `CRON_SECRET`) |
| GET | `/v1/health` | Phone, dashboard, MCP | Last event per source, errors, staleness |
| GET | `/v1/gate?days=7` | You (`pnpm gate`) | Phase-gate report: heartbeat gaps over 4 h, per-day data, check-ins |

**Processing.** The batch endpoint connects through Supabase's connection pooler (transaction mode), inserts raw events in one transaction and processes them into the typed tables inline. A 500-event batch finishes well within a Vercel function's time limit, so no job queue is needed.

**Nightly job (03:00 Europe/Skopje).** pg_cron runs SQL functions that compute sleep estimates and rebuild `daily_summary` for the last 3 days (late data arrives), then calls a Supabase Edge Function that fetches weather from Open-Meteo and the previous day's meeting count and minutes from Google Calendar. pg_cron schedules in UTC, so 03:00 local is 01:00 UTC in summer and 02:00 UTC in winter; pick one and accept the one-hour drift.

**Auth.** The phone sends a long random device token that the API routes check. The dashboard uses Supabase Auth with your single account. The MCP server uses Supabase Auth as its OAuth provider. The Supabase service role key lives only in Vercel environment variables, never in the app or the browser.

## Dashboard

Five views; every number is shown against your own 30-day baseline rather than a generic target.

| View | Shows |
| --- | --- |
| Today | Yesterday's sleep, today's screen time and unlocks so far, steps, meetings, check-in status, and a data-health strip per source |
| Trends | Any metric over 7/30/90/365 days with a rolling average band; week-over-week change |
| Time | Where hours go: home, work, gym, commuting, other places, plus top apps by category |
| Money | Spend by week and merchant category; unusual transactions flagged by amount |
| Insights | Correlation grid (e.g. sleep → next-day mood, meeting minutes → evening screen time), each with r, n and a scatter plot |

**Guardrails for insights.** Show a correlation only when n ≥ 20 days and |r| ≥ 0.3, label it as a pattern rather than a cause, and use lagged pairs (today's X vs tomorrow's Y) where that is the natural question.

## MCP server for Claude agents

A read-only remote MCP server exposes a few high-level tools, so your morning brief and weekly review agents can ask for summaries instead of writing SQL.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_daily_summary` | `date` or `from`/`to` | Rows of `daily_summary` with the 30-day baseline for each metric |
| `get_last_night` | none | Sleep estimate, confidence, and how it compares to average |
| `get_trend` | `metric`, `period` (week, month) | Current vs previous period, with the change in % |
| `get_time_breakdown` | `from`, `to` | Hours per place kind and top apps |
| `get_spending` | `from`, `to` | Totals by category and the largest transactions |
| `find_patterns` | `from`, `to` | Correlations that pass the guardrails, in plain words |
| `get_checkins` | `from`, `to` | Mood, energy, focus, tags and notes |
| `get_data_health` | none | Sources that have gone quiet, so the agent can warn you |

Design notes:

- Tools return compact JSON with units in the field names (`screen_time_min`, `spend_mkd`), which Claude reads reliably.
- Keep it read-only in v1; writing (e.g. a correction to a sleep estimate) can come later.
- Serve it over Streamable HTTP from a route in the Next.js app on Vercel, and add that URL in claude.ai as a custom connector. Custom connectors authenticate through OAuth, so use Supabase Auth as the provider for your single account, and check Anthropic's current connector docs for the exact requirements.
- Test it locally with MCP Inspector before connecting it to claude.ai.

Then extend the morning-brief prompt with one line: "Call `get_last_night` and `get_data_health` and mention anything unusual."

## Privacy and security

This dataset describes where you are, who you talk to and what you spend, so treat it like a password vault.

- **Minimise:** no message bodies, no notification text, no raw GPS trace; phone numbers stored as salted hashes with an optional contact name.
- **Transport:** HTTPS by default on Vercel and Supabase; API routes reject requests without the device token.
- **Database access:** Row Level Security on every table with no public policies, so the anon key reads nothing; server code uses the service role key from Vercel environment variables.
- **Backups:** the Supabase free tier has no automatic backups, so a weekly GitHub Action runs `pg_dump`, encrypts it with age and stores it outside Supabase.
- **MCP scope:** read-only tools that return aggregates; no tool returns raw call or SMS rows.
- **Secrets:** tokens and keys in Vercel and Supabase environment settings or git-ignored `.env.local` files; never commit real bank samples, use anonymised fixtures.
- **Kill switch:** a "pause collection" toggle in the app and a "delete date range" action in the dashboard.

## Phase 1 as built

Changes and decisions made while building Phase 1 (the rest of this spec still applies):

- **Heartbeat event.** Every collection run writes a `heartbeat` (app version, pending count, paused, usage access, battery optimisation). It is the liveness signal for `source_health` and the gate, and carries the permission status that onboarding and the status screen also show.
- **Check-ins are events.** Saved to Room first and uploaded in the normal batch; the latest submission per local date wins. Before 04:00 a check-in counts for the previous evening. The reminder is an inexact alarm at ~21:30 (no exact-alarm permission) with quick mood buttons that open the screen prefilled.
- **Unlocks come from UsageStats** (`KEYGUARD_HIDDEN`), polled with screen time. The foreground service with screen/charging receivers moves to Phase 2 (sleep).
- **Screen time windows.** One `app_usage` event per app per 30-min UTC window, only for complete windows; an app's time is the union of its activities' intervals; launcher and system UI excluded. Event ids are name-based UUIDs, so re-collection never double counts.
- **Processing in SQL.** `process_events(ids)` (called inside the ingest transaction) derives `unlocks`, `app_usage`, `checkins`, heartbeat status and `daily_summary`; the nightly job can reuse it to reprocess history.
- **Security.** Besides RLS without policies, all table and function privileges are revoked from `anon`/`authenticated` (checked by pgTAP tests).
- **Wire contract** in `packages/shared` (zod) with JSON fixtures that both the TypeScript and Kotlin tests run against.
- **Gate definition.** "No gaps" means no heartbeat silence over 4 h (Doze may delay work overnight; usage data is backfilled) and screen time or unlocks on every finished day. Missing check-ins are reported, not failing. Check with `pnpm gate`.
- **Deploy.** Vercel project `staleski-dev/lifelog`, https://stefanslifelog.vercel.app. Supabase org "Lifelog"; the cloud project waits for a free-tier slot (limit of 2 active projects), then `scripts/setup-supabase.sh` finishes setup.

## Phases 2–3 as built

- **No foreground service.** Screen on/off comes from UsageStats, charging and battery are sampled in each heartbeat, and Activity Recognition and geofences deliver through PendingIntents (Android 15 limits `dataSync` services to 6 h/day).
- **Steps** from Health Connect per finished UTC hour; the last 24 h are re-read every run because Samsung Health syncs late, and the server keeps the larger value per hour. Background reading permission is required (collection runs in WorkManager).
- **Places:** named places are managed on a map in the dashboard (Time view) and reach the phone through `/v1/config`; geofences are re-registered only when places change. Stays of 15+ min elsewhere are detected on the phone from one balanced-power fix per run and uploaded with coordinates rounded to ~100 m.
- **Sleep estimate** (`compute_sleep`): wake = the unlock ending the longest quiet stretch (3–16 h) in 21:00→14:00; start = the first screen-off after the last evening unlock; single night-time "blips" are ignored; confidence from screen-off, plausible length, stillness and charging; corrections are never overwritten. Runs on ingest and nightly (pg_cron, 01:00 UTC); a weekly job prunes processed raw events older than 90 days.
- **Notifications** are counted per app per hour from flags only (never title or text); ongoing, group summaries and silent updates are ignored.
- **Samsung hardening:** status cards for auto-revoke, the restricted standby bucket and "Never sleeping apps" (a checklist item, since apps can't read it).
- **Dashboard:** magic-link sign-in for one owner (PKCE: open the link in the browser that requested it; `/auth/callback` exchanges the code server-side; sign-ups disabled), Today, Trends (metric × 7/30/90/365 days, 7-day average, usual range band, week-over-week) and Time (hours per place kind, apps by category, places editor). Chart colours come from a validated palette.
- **Weather** comes from Open-Meteo through a Vercel Cron job (not an Edge Function) into `context_daily`.
- **Not built:** spending. Komercijalna banka's mBanka notifications carry no amounts ("Priliv/Odliv na sredstva"); the started framework is parked on branch `parked/spending-framework`. Google Calendar waits for OAuth approval. Insights and the MCP server are Phase 4.

## Build phases

About eight weekends of part-time work with Claude Code doing most of the typing; each phase ends only when real data from your own phone passes its gate.

| Phase | Timing | Scope | Gate before next phase |
| --- | --- | --- | --- |
| 1. Foundations | Weekends 1–2 | Monorepo + CI; Postgres + ingest API; app shell, Room, sync; screen time and unlocks; daily check-in | 7 days of data, no gaps |
| 2. Movement and places | Weekends 3–4 | Health Connect steps; Activity Recognition; geofences and visits; sleep estimate; Samsung battery fixes | Sleep estimate right 5 of 7 nights |
| 3. Dashboard | Weekends 5–6 | Today and Trends views; Time and Money views; notification counts; bank parsing; weather + calendar job | Dashboard used daily for a week |
| 4. Claude + insights | Weekends 7–8 | Read-only MCP server; claude.ai connector; morning brief upgrade; Insights view; weekly review agent | — |

The gates matter more than the dates: a collector that silently stops on Samsung is the main risk, so phase 1 must prove a full week of gap-free data before anything else is built on it.

## Working with Claude Code

Run Claude Code locally on your machine for this project, with the repo on GitHub, rather than only letting it work in the cloud: the Android half needs Gradle builds, `adb` and your actual S24 plugged in, which a cloud session cannot reach.

**Setup**

1. Create an empty private GitHub repo and clone it locally; install Android Studio (SDK, platform tools), Node 20+ with pnpm, the Supabase CLI and the Vercel CLI.
2. Link the cloud projects: create a Supabase project and a Vercel project from your existing accounts, then run `supabase link` and `vercel link` in the repo and pull environment variables with `vercel env pull`.
3. Commit this file as `docs/SPEC.md`.
4. Ask Claude Code to generate a `CLAUDE.md` from the spec: repo layout (`apps/android`, `apps/web` for the Next.js dashboard, API and MCP route, `packages/shared`, `supabase/` for migrations, pg_cron SQL and Edge Functions), commands to build and test each part, and conventions (UTC timestamps, event ids from the device, no raw text stored).
5. Enable USB debugging on the S24 so Claude Code can run `./gradlew installDebug` and read `adb logcat` while it debugs.

**Workflow per phase**

1. Start in plan mode: "Read docs/SPEC.md and plan phase 1 as a list of small PR-sized tasks." Review the plan before any code is written.
2. One task per branch and PR, with tests: parser unit tests, ingest API integration tests against a local Supabase stack (supabase start), and a fake-data seeder for the dashboard.
3. Merge only after you've run the build yourself; on the phone, check the status screen shows fresh data.
4. After each phase, ask Claude Code to update `docs/SPEC.md` and `CLAUDE.md` with what changed, so the next session starts with accurate context.

**Where cloud and GitHub integration fit.** Once the Android core is stable, backend, dashboard and MCP tasks are well suited to Claude Code working asynchronously on GitHub (open an issue, get a PR back), and to automated PR reviews. Keep Android changes local, where they can be run on the phone.
