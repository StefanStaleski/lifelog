import { createLifelogMcpHandler } from "@/lib/mcp/server";

// Remote MCP server for claude.ai (Streamable HTTP, stateless). Node runtime: pg and jose.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createLifelogMcpHandler();

export { handler as DELETE, handler as GET, handler as POST };
