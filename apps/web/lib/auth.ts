import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

function bearer(req: Request): string | null {
  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

/** Hash both sides so lengths match and comparison time doesn't leak the token. */
function matches(token: string, expected: string | undefined): boolean {
  if (!expected) return false; // unset token: that client is rejected
  return timingSafeEqual(digest(token), digest(expected));
}

/** True when the request carries `Authorization: Bearer <DEVICE_TOKEN>` (the phone). */
export function isDeviceAuthorized(req: Request): boolean {
  const token = bearer(req);
  return token !== null && matches(token, process.env.DEVICE_TOKEN);
}

export type Uploader = "phone" | "desktop";

/**
 * Who may upload events: the phone (`DEVICE_TOKEN`) or the laptop's desktop collector
 * (`DESKTOP_TOKEN`, desktop event types only). Null when neither token matches.
 */
export function uploaderOf(req: Request): Uploader | null {
  const token = bearer(req);
  if (token === null) return null;
  if (matches(token, process.env.DEVICE_TOKEN)) return "phone";
  if (matches(token, process.env.DESKTOP_TOKEN)) return "desktop";
  return null;
}
