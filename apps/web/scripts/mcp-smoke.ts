/**
 * End-to-end check of the MCP server with the official SDK client over Streamable HTTP.
 *
 *   pnpm --filter web mcp:smoke [base-url]          # default http://localhost:3000
 *   MCP_TOKEN=<access token> pnpm --filter web mcp:smoke https://stefanslifelog.vercel.app
 *
 * Always checks the OAuth discovery surface (401 + WWW-Authenticate → protected resource metadata).
 * Then, with MCP_TOKEN or against a local `DASHBOARD_DEV_AUTH_BYPASS=1` dev server, lists the tools
 * and calls each one. Exit code 0 = everything answered.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const endpoint = new URL(`${base}/api/mcp`);
const token = process.env.MCP_TOKEN;
let failed = false;
const ok = (msg: string) => console.log(`✓ ${msg}`);
const fail = (msg: string) => {
  failed = true;
  console.log(`✗ ${msg}`);
};

// 1. Discovery: a bad token must get a 401 whose challenge points at the resource metadata.
const probe = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: "Bearer invalid",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
const challenge = probe.headers.get("www-authenticate") ?? "";
const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
if (probe.status === 401 && metadataUrl) ok(`401 with ${challenge}`);
else fail(`expected 401 with resource_metadata, got ${probe.status} "${challenge}"`);

if (metadataUrl) {
  const meta = (await (await fetch(metadataUrl)).json()) as {
    resource?: string;
    authorization_servers?: string[];
  };
  if (meta.resource === endpoint.toString()) ok(`metadata resource = ${meta.resource}`);
  else fail(`metadata resource ${meta.resource} ≠ ${endpoint}`);
  const issuer = meta.authorization_servers?.[0];
  if (issuer) {
    const as = new URL(issuer);
    const asMeta = await fetch(
      `${as.origin}/.well-known/oauth-authorization-server${as.pathname.replace(/\/$/, "")}`,
    );
    const body = (await asMeta.json()) as Record<string, unknown>;
    if (asMeta.ok)
      ok(
        `authorization server ${issuer}: registration_endpoint=${body.registration_endpoint ?? "none (enable dynamic registration)"}, PKCE ${JSON.stringify(body.code_challenge_methods_supported)}`,
      );
    else
      console.log(
        `! authorization server ${issuer} answered ${asMeta.status}: ${JSON.stringify(body)} (OAuth server not enabled yet?)`,
      );
  } else console.log("! no authorization server configured (NEXT_PUBLIC_SUPABASE_URL unset)");
}

// 2. Tools, through the SDK client.
const client = new Client({ name: "lifelog-smoke", version: "1.0.0" });
try {
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : {},
    }),
  );
} catch (e) {
  console.log(
    token
      ? `✗ connect failed: ${(e as Error).message}`
      : "! no MCP_TOKEN and no dev auth bypass: skipping tool calls",
  );
  process.exit(failed || token ? 1 : 0);
}

const { tools } = await client.listTools();
ok(`tools/list: ${tools.map((t) => t.name).join(", ")}`);
const localDate = (ms: number) =>
  new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Skopje" });
const today = localDate(Date.now());
const weekAgo = localDate(Date.now() - 6 * 86_400_000);
const calls: [string, Record<string, unknown>][] = [
  ["get_daily_summary", {}],
  ["get_last_night", {}],
  ["get_trend", { metric: "screen_time_min", period: "week" }],
  ["get_time_breakdown", { from: weekAgo, to: today }],
  ["get_checkins", {}],
  ["get_data_health", {}],
  [
    "query_days",
    {
      from: localDate(Date.now() - 59 * 86_400_000),
      to: today,
      metrics: ["screen_time_min", "steps"],
      lag_metrics: ["sleep_min"],
      group_by: "weekday",
    },
  ],
];
for (const [name, args] of calls) {
  if (!tools.some((t) => t.name === name)) {
    fail(`${name} is not listed`);
    continue;
  }
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  if (res.isError) fail(`${name}: ${text}`);
  else ok(`${name} (${text.length} B): ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}`);
}
await client.close();
process.exit(failed ? 1 : 0);
