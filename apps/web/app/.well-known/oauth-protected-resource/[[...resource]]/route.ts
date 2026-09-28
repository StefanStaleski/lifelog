import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { protectedResourceMetadata } from "@/lib/mcp/auth";

/**
 * RFC 9728 protected resource metadata for /api/mcp, served both at the path-inserted location
 * (`/.well-known/oauth-protected-resource/api/mcp`, which the 401 challenge points to) and at the
 * root, which some clients probe. It names Supabase Auth as the authorization server.
 */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(req), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
