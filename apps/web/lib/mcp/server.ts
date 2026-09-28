import type { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "mcp-handler";
import { getDb } from "@/lib/db";
import { authorizeMcpRequest, type McpAuthOptions } from "./auth";
import type { McpTool, ToolContext } from "./tool";
import { TOOLS } from "./tools";

const INSTRUCTIONS = `Lifelog: one person's passively collected daily-life data (Samsung phone, no wearable), read-only.
Days are local dates in Europe/Skopje; instants are UTC ISO strings. Units are in field names (_min, _m, _pct); mood/energy/focus are 1-5.
Start with get_daily_summary (today or a range, with 30-day baselines) or get_last_night; use get_trend for "is X going up", get_time_breakdown for places and apps, get_checkins for mood and notes, and query_days for filtered or grouped questions across days.
Check get_data_health before reading much into a missing or zero value: a quiet source usually means the phone stopped reporting.
The data shows patterns, not causes; mention small samples.`;

export function registerTools(server: McpServer, tools: McpTool[], ctx: () => ToolContext) {
  for (const tool of tools)
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        const result = await tool.run(args, ctx());
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    );
}

export type LifelogMcpOptions = McpAuthOptions & {
  tools?: McpTool[];
  /** Tests pin the clock so "today" is stable. */
  now?: () => Date;
};

/** The /api/mcp handler: bearer auth first (401/403 before the SDK runs), then MCP. */
export function createLifelogMcpHandler(opts: LifelogMcpOptions = {}) {
  const tools = opts.tools ?? TOOLS;
  const now = opts.now ?? (() => new Date());
  const mcp = createMcpHandler(
    (server) => registerTools(server, tools, () => ({ db: getDb(), now: now() })),
    {
      serverInfo: { name: "lifelog", version: "1.0.0" },
      instructions: INSTRUCTIONS,
    },
  );
  return async (req: Request): Promise<Response> => {
    const auth = await authorizeMcpRequest(req, opts);
    if (auth instanceof Response) return auth;
    req.auth = auth;
    return mcp(req);
  };
}
