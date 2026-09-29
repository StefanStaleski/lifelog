# lifelog-desktop

Laptop collector (Phase 5, task 5.2). [ActivityWatch](https://activitywatch.net) records the focused
window and AFK state on the laptop; `lifelog-desktop sync` turns that into `desktop_usage` events
(focused, not-AFK time per app and browser hostname per 30-minute UTC window) plus a
`desktop_heartbeat`, and uploads them to the ingest API like the phone does.

```
aw-qt ── aw-watcher-window, aw-watcher-afk ──▶ aw-server :5600 ◀── aw-watcher-web (browser extension)
                                                   │ REST
systemd user timer (every 30 min + after login) ──▶ lifelog-desktop sync
                                                   │ queue.json (local-first)
                                                   ▼
                              POST {baseUrl}/api/v1/events/batch  (gzip JSON, Bearer DESKTOP_TOKEN)
```

## Install

From the repo root, after `pnpm install`:

```bash
apps/desktop/scripts/install-activitywatch.sh   # ActivityWatch in ~/.local/opt/activitywatch, starts on login
apps/desktop/scripts/install.sh                 # lifelog-desktop + systemd user timer
```

Both are safe to re-run (re-run `install.sh` after code changes or after switching Node versions:
the unit calls the absolute node path it found).

- **ActivityWatch** runs as `aw-qt` from `~/.config/autostart/aw-qt.desktop` (tray icon; it starts
  `aw-server`, `aw-watcher-window` and `aw-watcher-afk`). Autostart instead of a systemd service because
  the watchers need the X11 session, and Cinnamon never activates `graphical-session.target`.
  Check: `curl localhost:5600/api/0/info`, web UI at http://localhost:5600.
- **lifelog-desktop** is a single bundled file in `~/.local/opt/lifelog-desktop/`, run by
  `lifelog-desktop.timer` at :07 and :37 past each hour (and 3 min after login). Manual runs:
  `~/.local/bin/lifelog-desktop sync`, `… sync --dry-run`, `… status`.
  Logs: `journalctl --user -u lifelog-desktop`.

### Browser extension (manual, once per browser)

Browser hostnames need the ActivityWatch extension; without it, browser time is still counted,
with `host: null`.

- Firefox: https://addons.mozilla.org/firefox/addon/aw-watcher-web/
- Chrome: search "ActivityWatch Web Watcher" in the Chrome Web Store.

After installing, open the extension's popup once and accept its consent prompt (Firefox asks for
it). A bucket `aw-watcher-web-<browser>_<hostname>` appears at http://localhost:5600/#/buckets; the next
sync picks it up automatically.

### Uninstall

```bash
apps/desktop/scripts/install.sh --uninstall     # timer, units, bundle (keeps config + queue)
pkill -f activitywatch/aw- ; rm -rf ~/.local/opt/activitywatch ~/.config/autostart/aw-qt.desktop
rm -rf ~/.config/lifelog-desktop ~/.local/state/lifelog-desktop   # config, queue, cursor
# ActivityWatch's own data: ~/.local/share/activitywatch
```

## Config

`~/.config/lifelog-desktop/config.json` (mode 600, created by `install.sh`, never committed):

```json
{ "baseUrl": "https://stefanslifelog.vercel.app", "token": "<DESKTOP_TOKEN>" }
```

Optional: `deviceId` (default `"laptop"`), `awUrl` (default `http://localhost:5600`). With the placeholder
token (`REPLACE_WITH_DESKTOP_TOKEN`) nothing is uploaded; events accumulate in the queue and go out
on the first run after a real token is set.

## How it works

- **Cursor:** `~/.local/state/lifelog-desktop/state.json` holds `synced_until`. Each run reads
  ActivityWatch from there (one day at a time) up to the last complete window that closed at least
  5 min ago (AFK changes are back-dated by up to 3 min). The first run backfills from the start of
  ActivityWatch's data.
- **Windows:** focused-window spans (each lasts until the next one starts, if the gap is ≤ 5 s:
  the window watcher records zero-length events on every title change) ∩ not-AFK spans, split by the
  active tab's hostname for browsers, summed per (30-min UTC window, app, host). `app` is the lowercase
  window class (`code`, `firefox`, `google-chrome`); `active_ms` ≤ 30 min; spans under 1 s are dropped.
- **Ids:** UUIDv5 of `${window_start ISO}|${app}|${host ?? ""}` in a fixed namespace, so collecting
  a window twice (lost state, re-install) produces the same ids and the server drops duplicates.
- **Local-first queue:** `queue.json` is written before the cursor moves and before any upload.
  Uploads go in batches of ≤ 500 (gzip JSON, `Authorization: Bearer <token>`, `device_id` "laptop").
  A batch leaves the queue only after a 2xx acknowledgement; network errors, 5xx and 401/403 keep
  it for the next run. Events the server rejects individually are moved to `rejected.jsonl`.
- **Heartbeat:** every run queues a `desktop_heartbeat` (`client_version`, `aw_version`,
  `aw_reachable`, `pending_count`), also when ActivityWatch is down.

## Privacy

- Only three things leave ActivityWatch: the window **class** (app name), the AFK status and, for
  browser tabs, the bare **hostname** (`https://www.github.com/me/repo?token=…` → `github.com`).
- Window titles, URLs, paths, queries, fragments, ports and credentials are never read into the
  payload: `src/aw.ts` maps AW events to `{start, end, app | host}` right after fetching, and tests
  assert that fixture titles/URLs never appear in the output.
- Incognito/private tabs count as browser time with `host: null`. Non-web pages (`file://`,
  `about:`, extensions) have no host.
- ActivityWatch itself keeps full titles and URLs locally in `~/.local/share/activitywatch`
  (its normal behaviour); they are never uploaded.

## Develop

```bash
pnpm --filter @lifelog/desktop test
pnpm --filter @lifelog/desktop typecheck
pnpm --filter @lifelog/desktop sync -- --dry-run   # from source, prints the batch, changes nothing
```
