# Plan: Phase 4 — the Dossier, Claude, insights

Written 27 Sep 2026. Built ahead of the Phase 1–3 gates at the owner's request.

## Decisions (owner, 27 Sep)

- **Dossier is the new home.** One "subject file" page with everything about the owner; Trends and
  Time stay as drill-down pages opened from its panels.
- **Dark, futuristic HUD look on every page, always** (independent of the device theme): monospace
  labels, thin cyan lines, faint grid/scanlines, status lights; real numbers stay large and readable,
  chart colours validated against the dark surface.
- **360° portrait from a turn-around set:** 8–16 photos taken while turning in place, or a short
  video split into frames in the browser; drag to rotate. One photo falls back to a 3D tilt effect.
  Photos live in a **private** Supabase Storage bucket, shown only to the signed-in owner via
  short-lived signed URLs.
- **Claude connector:** read-only MCP server at `/api/mcp` (Streamable HTTP) on Vercel, OAuth via
  **Supabase Auth's OAuth 2.1 server** (public beta; dynamic client registration, PKCE S256), with a
  consent page in the app.

## Tasks

| # | Task |
| --- | --- |
| 4.1 | HUD design system: dark tokens, fonts (sans + mono), panel/gauge/sensor components, restyle shell, Trends, Time, sign-in |
| 4.2 | Portrait: private storage bucket, upload (photos or video → frames), drag-to-rotate 360° viewer with scan effect, tilt fallback |
| 4.3 | Dossier page: ID panel (portrait, name, status "at Home · last seen 3 min ago"), vital readouts vs baseline, sensors, anomalies ("screen time 2.1× usual") |
| 4.4 | Dossier visuals: 24-hour day ring (sleep / places / phone use), pattern-of-life heatmap (weekday × hour), known locations map with visit counts, field notes (check-in notes and tags) |
| 4.5 | MCP server: tools `get_daily_summary`, `get_last_night`, `get_trend`, `get_time_breakdown`, `get_checkins`, `find_patterns`, `get_data_health`; Supabase OAuth 2.1 (DCR) + consent page; tested with MCP Inspector |
| 4.6 | Insights: correlations with guardrails (n ≥ 20 days, \|r\| ≥ 0.3, lagged pairs where natural, "pattern, not cause"), a dossier panel and the MCP `find_patterns` |
| 4.7 | Connect in claude.ai (owner, one-time), morning brief line, weekly review agent |

## Needs the owner

- Photos for the portrait (a turn-around set, or one photo to start).
- One-time: add the connector in claude.ai (Settings → Connectors → custom → the `/api/mcp` URL) and approve.
