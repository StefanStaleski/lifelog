# Lifelog MCP server (Claude connector)

A read-only remote MCP server at **`https://stefanslifelog.vercel.app/api/mcp`** (Streamable HTTP,
stateless). claude.ai adds it as a custom connector; every Claude surface (web, desktop, mobile,
Claude Code) can then call its tools.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_daily_summary` | `date`, or `from`/`to` (≤ 92 days); none = today | Metrics per day, 30-day baseline per metric, `unusual` metrics (\|z\| ≥ 1.5) |
| `get_last_night` | `date` (wake-up date), default today | Sleep start/wake (UTC + local), duration, confidence, vs the 30 nights before |
| `get_trend` | `metric`, `period` (week, month), `end` | Current vs previous period, change %, verdict |
| `get_time_breakdown` | `from`/`to` (≤ 92 days), default last 7 days | Minutes per day per place kind, app categories, top apps |
| `get_checkins` | `from`/`to` (≤ 366 days), default last 14 days | Mood/energy/focus, tags, notes, averages, tag counts |
| `get_data_health` | none | Stale sources, errors, latest phone heartbeat |
| `query_days` | `from`, `to`, `metrics[]`, `where[]`, `weekdays[]`, `tags{any,all,none}`, `group_by`, `agg`, `lag_days`, `lag_metrics[]` | Filtered / grouped `daily_summary` rows + `n_days` |

All outputs are compact JSON with units in field names. Metrics come from the registry in
`apps/web/lib/metrics.ts` (`METRICS` + `METRIC_COLUMNS`): a metric added there shows up in
`query_days`, `get_trend` and `get_daily_summary` without touching the MCP code.

### Adding a tool

1. Write it with `defineTool` (`apps/web/lib/mcp/tool.ts`) in a file under `apps/web/lib/mcp/tools/`:
   a zod `input` object (`.describe()` every field), a `description` that says what it returns,
   units and defaults, and a read-only `run(args, { db, now })` that reuses `lib/` queries.
2. Append it to `TOOLS` in `apps/web/lib/mcp/tools/index.ts`.
3. Add a case to `apps/web/lib/mcp/mcp.test.ts` (it calls tools through a real MCP client).

## Auth

- **Authorization server:** Supabase Auth's OAuth 2.1 server (issuer
  `https://itiulabamqhidvpjvgvt.supabase.co/auth/v1`), with dynamic client registration and PKCE
  S256. claude.ai registers itself, sends the owner to Supabase's authorize endpoint, and Supabase
  redirects to our consent page **`/oauth/consent?authorization_id=…`** (signed-out → `/login` →
  back). The owner clicks Allow; Supabase issues the code, then tokens (1 h access token + rotating
  refresh token).
- **Resource server (`/api/mcp`):** no or bad token → `401` with
  `WWW-Authenticate: Bearer … resource_metadata="<origin>/.well-known/oauth-protected-resource/api/mcp"`.
  The metadata (also at `/.well-known/oauth-protected-resource`) names the Supabase issuer and
  `resource = <origin>/api/mcp`. Tokens are verified against Supabase's JWKS (ES256): issuer,
  `aud = authenticated` (Supabase's audience for every user token), expiry, and a `client_id` claim
  (so a plain dashboard session token is refused). A valid token whose `email` isn't
  `DASHBOARD_EMAIL` gets `403`. Only the owner can approve on the consent page.
- Supabase doesn't support RFC 8707 resource indicators, so tokens aren't audience-bound to
  `/api/mcp`; the `client_id` + owner checks and the short token lifetime are the mitigation.
- **Local dev:** with `DASHBOARD_DEV_AUTH_BYPASS=1 pnpm --filter web dev`, requests *without* an
  `Authorization` header are served as the owner (never on Vercel or in production builds).

## Owner steps (one-time)

1. **Enable the OAuth 2.1 server** on the Supabase project (it answers "OAuth server is disabled"
   until then). Either:
   - `pnpm exec supabase config push` from the repo root (the linked project; applies the
     `[remotes.production.auth.oauth_server]` block in `supabase/config.toml`; review the diff it
     prints before confirming), or
   - Supabase dashboard → **Authentication → OAuth Server**: enable it, set **Authorization path**
     to `/oauth/consent`, turn on **Allow dynamic client registration**, save.
2. Check **Authentication → URL Configuration → Site URL** is `https://stefanslifelog.vercel.app`
   (the consent URL is Site URL + authorization path).
3. Check that Vercel has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `DASHBOARD_EMAIL` in production (the dashboard sign-in already uses them), then deploy.
4. Verify: `pnpm --filter web mcp:smoke https://stefanslifelog.vercel.app` should print the 401,
   the metadata and a `registration_endpoint` for the authorization server.
5. **claude.ai → Settings → Connectors → Add custom connector**: name `Lifelog`, URL
   `https://stefanslifelog.vercel.app/api/mcp`, leave the OAuth client id/secret empty → Add →
   Connect. Sign in if asked, click **Allow** on the Lifelog consent page. In a chat, enable the
   connector from the tools menu and ask e.g. "How did I sleep last night?".
6. Revoke: remove the connector in claude.ai (and, if wanted, the client under Authentication →
   OAuth Server → Clients in Supabase).

## Testing

- `pnpm --filter web test` runs `lib/mcp/mcp.test.ts`: auth (401 challenge, wrong audience,
  expired, wrong issuer, foreign key, no `client_id`, 403 non-owner) with locally signed ES256
  tokens, and every tool through the MCP SDK client against the local database.
- `pnpm --filter web mcp:smoke [base-url]`: SDK client over real Streamable HTTP. Against a local
  `DASHBOARD_DEV_AUTH_BYPASS=1` dev server it lists and calls every tool; against production it
  checks discovery, and with `MCP_TOKEN=<access token>` also calls the tools.
- MCP Inspector (CLI):
  `npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --method tools/list`
  and `--method tools/call --tool-name get_trend --tool-arg metric=steps`.
- Consent page preview (dev bypass only): `/oauth/consent?preview=1` (or `?preview=loopback`).
