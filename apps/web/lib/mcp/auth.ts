import type { AuthInfo } from "@modelcontextprotocol/server";
import {
  bearerAuthChallengeResponse,
  OAuthError,
  OAuthErrorCode,
} from "@modelcontextprotocol/server";
import {
  createRemoteJWKSet,
  errors as joseErrors,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";
import { getPublicOrigin } from "mcp-handler";
import { devAuthBypass, isOwnerEmail } from "@/lib/owner";

/**
 * Resource-server side of the claude.ai connector. Supabase Auth's OAuth 2.1 server is the
 * authorization server: claude.ai registers itself (DCR), the owner approves on /oauth/consent, and
 * Supabase issues an access token (an ES256 JWT, like a session token, plus a `client_id` claim).
 * This module checks that token on every /api/mcp request.
 */

export const MCP_PATH = "/api/mcp";
/** RFC 9728 path-inserted location of the metadata for the resource at MCP_PATH. */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;
/** Supabase's default OAuth scope; the email claim is how the owner is recognised. */
export const MCP_SCOPES = ["email"];
/** Supabase puts this audience on every user access token, OAuth-issued ones included. */
export const TOKEN_AUDIENCE = "authenticated";

/** Supabase Auth's issuer (`https://<ref>.supabase.co/auth/v1`), or null when not configured. */
export function authIssuer(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/auth/v1` : null;
}

export const mcpResourceUrl = (req: Request) => `${getPublicOrigin(req)}${MCP_PATH}`;
export const resourceMetadataUrl = (req: Request) =>
  `${getPublicOrigin(req)}${RESOURCE_METADATA_PATH}`;

/** RFC 9728 protected resource metadata for /api/mcp. */
export function protectedResourceMetadata(req: Request) {
  const issuer = authIssuer();
  return {
    resource: mcpResourceUrl(req),
    authorization_servers: issuer ? [issuer] : [],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Lifelog",
    resource_documentation: `${getPublicOrigin(req)}/`,
  };
}

let remoteJwks: { issuer: string; keys: JWTVerifyGetKey } | undefined;
/** Supabase's signing keys, fetched once per instance and cached by jose. */
function supabaseKeys(issuer: string): JWTVerifyGetKey {
  if (remoteJwks?.issuer !== issuer)
    remoteJwks = {
      issuer,
      keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
        timeoutDuration: 5_000,
      }),
    };
  return remoteJwks.keys;
}

export type McpAuthOptions = {
  /** Key set to verify against; defaults to the Supabase project's JWKS. Tests pass a local set. */
  keys?: JWTVerifyGetKey;
  issuer?: string;
};

const invalid = (message: string) => new OAuthError(OAuthErrorCode.InvalidToken, message);

/**
 * Verifies an access token: signature (asymmetric keys only), issuer, audience, expiry, and that it
 * was issued to an OAuth client (`client_id`), so a stolen dashboard session token can't be
 * replayed here. Throws OAuthError(invalid_token) on any failure.
 */
export async function verifyAccessToken(
  token: string,
  opts: McpAuthOptions = {},
): Promise<JWTPayload & { client_id: string }> {
  const issuer = opts.issuer ?? authIssuer();
  if (!issuer) throw invalid("Auth is not configured on this server");
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, opts.keys ?? supabaseKeys(issuer), {
      issuer,
      audience: TOKEN_AUDIENCE,
      algorithms: ["ES256", "RS256", "EdDSA"],
      requiredClaims: ["exp", "sub"],
    }));
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw invalid("Token has expired");
    if (e instanceof joseErrors.JWTClaimValidationFailed)
      throw invalid(`Invalid token: ${e.claim}`);
    throw invalid("Invalid token");
  }
  if (typeof payload.client_id !== "string" || !payload.client_id)
    throw invalid("Not an OAuth access token");
  return payload as JWTPayload & { client_id: string };
}

/** 403 for a valid token that belongs to someone other than the owner. */
function forbidden(req: Request): Response {
  return Response.json(
    { error: "access_denied", error_description: "This connector is for its owner only" },
    {
      status: 403,
      headers: {
        "WWW-Authenticate": `Bearer error="access_denied", resource_metadata="${resourceMetadataUrl(req)}"`,
      },
    },
  );
}

/**
 * Authorizes an /api/mcp request. Returns the AuthInfo to hand to the MCP SDK, or the response to
 * send instead: 401 with a WWW-Authenticate challenge pointing at the resource metadata (which is
 * what makes claude.ai start OAuth), or 403 for a non-owner.
 */
export async function authorizeMcpRequest(
  req: Request,
  opts: McpAuthOptions = {},
): Promise<AuthInfo | Response> {
  const challenge = { resourceMetadataUrl: resourceMetadataUrl(req), requiredScopes: [] };
  const header = req.headers.get("authorization");
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];

  // `DASHBOARD_DEV_AUTH_BYPASS=1 pnpm --filter web dev`: MCP Inspector and the smoke test can call
  // the local server without a token. Never active on Vercel or in production builds.
  if (!token && devAuthBypass())
    return {
      token: "dev-bypass",
      clientId: "dev-bypass",
      scopes: MCP_SCOPES,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { email: process.env.DASHBOARD_EMAIL ?? "dev@localhost" },
    };

  if (!token) return bearerAuthChallengeResponse(invalid("No authorization provided"), challenge);
  let claims: JWTPayload & { client_id: string };
  try {
    claims = await verifyAccessToken(token, opts);
  } catch (e) {
    return bearerAuthChallengeResponse(e, challenge);
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isOwnerEmail(email)) return forbidden(req);
  return {
    token,
    clientId: claims.client_id,
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: claims.exp,
    resource: new URL(mcpResourceUrl(req)),
    extra: { email, sub: claims.sub },
  };
}
