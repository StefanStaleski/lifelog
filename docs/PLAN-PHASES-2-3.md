# Plan: Phases 2 and 3

Written 27 Sep 2026 while the Phase 1 gate runs on the phone. Built ahead of the gate at the
owner's request; Android work is unit-tested here and installed on the S24 afterwards.

## Design decisions

- **No foreground service.** Screen on/off comes from UsageStats (`SCREEN_INTERACTIVE` /
  `SCREEN_NON_INTERACTIVE`), charging state is sampled in every heartbeat, and Activity
  Recognition and geofences deliver through PendingIntents. Android 15 caps `dataSync`
  foreground services at 6 h/day, so a service would not have been reliable anyway.
- **Values that can change later** (Health Connect steps sync late, notification counts grow
  during an hour) are only sent for finished periods, with ids derived from the content, and the
  server keeps the newest value per period.
- **Location privacy.** Known places come from the dashboard (geofences). Unknown stays over
  15 min are detected on the phone and sent as one event with the centre rounded to 3 decimals
  (~100 m); no GPS trace leaves the phone.
- **Sleep estimate** runs in SQL (nightly + on ingest): last screen-off after 21:00 followed by
  ≥ 3 h without unlocks; wake = first unlock after it; confidence from gap length, "still"
  activity and charging overnight.
- **Dashboard login:** Supabase Auth magic link, allow-listed to one email. Dashboard API routes
  accept the session cookie; phone routes keep the device token.

## Phase 2: movement and places

| # | Task |
| --- | --- |
| 2.1 | Contract + DB: event types `steps`, `activity`, `screen`, `geofence`, `stay`; heartbeat gets charging, battery and permission fields (optional, old app keeps working); tables `places`, `visits`, `steps_hourly`, `activity_segments`, `screen_events`, `location_stays`, `sleep_estimates`; processor + `daily_summary` columns |
| 2.2 | Sleep estimate SQL + pg_cron nightly job (rebuild last 3 days) |
| 2.3 | Android: screen events from UsageStats; charging/battery/permissions in heartbeat |
| 2.4 | Android: Health Connect steps + distance per hour, onboarding step, permission rationale screen |
| 2.5 | Android: Activity Recognition transitions (receiver, re-register on boot/update), onboarding step |
| 2.6 | Android: places from `/v1/config` → geofences; unknown-stay detection every collection run; location permissions (incl. "Allow all the time") |
| 2.7 | Android: Samsung hardening: "remove permissions if unused" exemption, sleeping-apps deep link, status problems |

## Phase 3: dashboard

| # | Task |
| --- | --- |
| 3.1 | Auth (magic link, allow-list), app shell, protected routes |
| 3.2 | Read API: summary, metric series with baselines, places CRUD, delete date range |
| 3.3 | Fake-data seeder; Today view with data-health strip |
| 3.4 | Trends view (7/30/90/365 days, rolling average band, week-over-week) |
| 3.5 | Time view (hours per place kind, top apps by category) + places editor on a map |
| 3.6 | Android: notification counts per app per hour (listener, no text), onboarding step |
| 3.7 | Bank parsing framework (phone, hash only) + transactions + Money view |
| 3.8 | Weather (Open-Meteo) Edge Function + nightly job; calendar prepared but off until you connect Google |
| 3.9 | Docs, deploy, final end-to-end check |

## Needs the owner (not blocking)

- Bank: which bank, notification or SMS, 2–3 anonymised sample messages.
- Google Calendar: one-time OAuth approval.
- Home / work / gym: set in the dashboard's places editor.
- Install the new app build on the S24 and grant the new permissions.
