# Plan: Phase 5 — work, people, conversations, Claude

Written 29 Sep 2026. Built alongside the unfinished Phase 4 tasks (4.5 MCP, 4.6 insights) at the owner's request.

## Decisions (owner, 29 Sep)

- **Work from home.** The owner works from home, weekdays ~09:00–17:00, and also works outside those hours.
  "Work" is measured from activity, not from place: the Mint laptop (used for everything: work and personal)
  and work apps on the phone.
- **Desktop collector.** ActivityWatch on the laptop (Linux Mint, Cinnamon, X11) plus a sync service that
  sends aggregates to the ingest API. App names and browser **hostnames** only; never window titles, URLs,
  paths or queries.
- **Work tagging.** Desktop apps, browser hostnames and phone apps are tagged work / not work once in the
  dashboard. Untagged laptop activity inside the work schedule counts as work (setting, default on).
- **Contacts: store names.** Calls and SMS store the contact's display name (from the phone's contacts) next to a
  salted hash of the normalised number. Unknown numbers: hash only.
- **Messaging apps: count messages per sender.** The notification listener reads the sender (and group name) of
  messaging notifications, never the text, and uploads counts per app × sender × hour. Received only (a
  notification is only posted for incoming messages).
- **Call transcripts (Samsung Galaxy AI / call recordings).** Explore first (5.R), then build the path that works.
  Guardrails: only calls with contacts the owner has marked **"consented to recording"** are transcribed; the
  audio is deleted as soon as the transcript is stored; transcripts are private to the owner and reachable by
  Claude only through a dedicated MCP tool.
- **Claude connector** as planned in 4.5, extended with work, people and conversation tools, plus `query_days`.
- This relaxes the "no raw content" convention for three things the owner chose: contact names, messaging sender
  names, and transcripts of consented calls. CLAUDE.md and SPEC.md are updated to say so.

## Wire contract (new event types)

All ids are device-generated, **name-based UUIDs (v5)** so re-collection never double counts. Timestamps UTC.

| type | occurred_at / ended_at | payload |
| --- | --- | --- |
| `desktop_usage` | 30-min UTC window, complete windows only | `app` (e.g. "code", "firefox"), `host` (browser hostname or null), `active_ms` (not AFK, app focused; ≤ window) |
| `desktop_heartbeat` | now | `client_version`, `aw_version`, `aw_reachable`, `pending_count` |
| `call` | call start; `ended_at` = start + duration | `direction` (incoming, outgoing, missed, rejected), `duration_s`, `contact_hash`, `contact_name` (nullable) |
| `sms` | sent/received time | `direction` (in, out), `contact_hash`, `contact_name` (nullable) |
| `messages` | one finished UTC hour | `package`, `app_label`, `sender_hash`, `sender_name`, `conversation` (group name or null), `count` |
| `call_recording` | call start | `call_id` (the matching `call` event id, nullable), `contact_hash`, `duration_s`, `storage_path`, `source` ("samsung_recorder") |

- **Hashes:** `contact_hash` = hex HMAC-SHA256(key = `contact_salt` from `GET /v1/config`, E.164 number, default
  region MK). `sender_hash` = HMAC(salt, `package + "|" + sender_name`). The salt is created once server-side
  and never changes.
- `messages` counts may grow within an hour when re-sent; the server keeps the larger count (like steps).
- Desktop events use a separate token (`DESKTOP_TOKEN`) and `device_id` "laptop"; same batch endpoint.

## Database (new tables; RLS on, no policies, privileges revoked)

- `desktop_usage(window_start, app, host, active_ms, device_id)` — PK (window_start, app, host).
- `calls(id, occurred_at, direction, duration_s, contact_hash, contact_name)`
- `sms_messages(id, occurred_at, direction, contact_hash, contact_name)`
- `message_counts(hour, package, app_label, sender_hash, sender_name, conversation, count)` — PK (hour, package, sender_hash).
- `people(contact_hash PK, display_name, label, recording_consent bool default false, hidden bool)` — upserted from
  calls/sms/messages; the owner can rename, merge (later), mark consent.
- `call_recordings(id, call_id, contact_hash, occurred_at, duration_s, storage_path, status (pending, transcribing,
  done, skipped_no_consent, failed), transcript text, language, summary text, error, transcribed_at)`
- `work_settings` (single row): `days int[]` (ISO weekday), `start_local time`, `end_local time`,
  `untagged_desktop_is_work bool`.
- `app_tags(source ('phone','desktop','host'), key, is_work bool)` — PK (source, key).
- `daily_summary` gains: `worked_min`, `worked_in_hours_min`, `worked_after_hours_min`, `first_work_at`,
  `last_work_at`, `desktop_min`, `wfh_min` (home time inside the schedule), `calls`, `call_min`,
  `people_contacted`, `messages_received`.

Work minutes per day = union of work-tagged desktop minutes and work-tagged phone app minutes, per 30-min window,
capped at 30 per window (so the laptop and phone at once don't double count).

## Tasks

| # | Task | Depends on | Where |
| --- | --- | --- | --- |
| 5.0 | node-postgres pool (already written, uncommitted) | — | web |
| 5.1 | **Foundation:** zod contract + fixtures + Kotlin payload models for all new types; Drizzle tables; `process_events` / `refresh_daily_summary` new versions; `contact_salt` in `/v1/config`; `DESKTOP_TOKEN` auth; ingest tests; pgTAP | 5.0 | shared, supabase, web, android core/data |
| 5.2 | **Desktop collector:** `apps/desktop` (Node 22 + TS, no deps beyond zod/shared): reads ActivityWatch REST (window + afk + web buckets), builds 30-min windows, local queue (SQLite or JSON file), uploads, heartbeat; systemd user timer; install script for ActivityWatch + aw-watcher-web; tests from fixtures | contract in this plan; rebase on 5.1 | desktop |
| 5.3 | **MCP server:** `/api/mcp` (Streamable HTTP), Supabase OAuth 2.1 (DCR, PKCE) + consent page, tools from 4.5 + `query_days`; MCP Inspector test | 5.0 (new tools in 5.7) | web |
| 5.4 | **Android people:** calls + SMS collectors (CallLog, Telephony, Contacts for names), messages-per-sender in the notification listener, permissions in onboarding/status | 5.1 | android |
| 5.5 | **Dashboard:** work schedule + work tagging (phone apps, desktop apps, hosts) on Profile/Time; Work panel (in hours vs after hours, start/end); People page (who, how often, trend, consent toggle); dossier panels; seeder | 5.1 | web |
| 5.R | **Research spike:** what Samsung's Phone app / Galaxy AI produce on the S24 (recording files, where, format; whether transcripts are exportable), on-device vs laptop transcription (Macedonian + English) | — | docs |
| 5.6 | **Transcripts:** phone uploads consented call recordings to a private Storage bucket; laptop worker (faster-whisper on CPU) transcribes, stores transcript + short summary, deletes audio; People page shows transcripts | 5.R, 5.1, 5.4 | android, desktop, web |
| 5.7 | **MCP extension + insights:** tools `get_work`, `get_people`, `get_conversations`; insights (4.6) over the new metrics (after-hours work → sleep/mood, people contacted → mood) | 5.3, 5.5 | web |
| 5.8 | Docs: SPEC.md + CLAUDE.md as built | all | docs |

## Working rules for parallel work

- One branch + PR per task, in its own git worktree. Only **5.1 generates migrations** in the first wave; later
  tasks that need a schema change rebase onto master first and generate then.
- The local Supabase stack is shared: wrap resets and DB tests in `flock /tmp/lifelog-db.lock sh -c 'pnpm db:reset && pnpm test'`.
- Android changes are verified on the S24 before merge (owner plugs it in).

## Needs the owner

- Plug in the S24 (USB debugging) for 5.4 and 5.6 verification.
- Turn on call recording in the Samsung Phone app (Settings → Record calls) if 5.R confirms that path.
- Enable the OAuth 2.1 server in the Supabase dashboard if the Management API can't (5.3), then add the connector
  in claude.ai once.
- Install the ActivityWatch browser extension (aw-watcher-web) in your browser(s).
